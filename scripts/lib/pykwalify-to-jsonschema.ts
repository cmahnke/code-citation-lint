import {parse} from 'yaml'

/**
 * Converter for pykwalify schemas.
 *
 * CFF 1.0.x and 1.1.0 were specified with pykwalify (YAML) schemas instead of
 * JSON Schema. This converts those schemas into draft-07 JSON Schema so all
 * CFF versions can be validated with ajv.
 *
 * Semantics preserved from pykwalify:
 * - `type: map` + `mapping` -> object with `properties` (+ `required` list)
 * - maps are lenient by default -> `additionalProperties: true`
 * - `type: seq` + `sequence` -> array; `matching: any` with multiple entries -> anyOf
 * - `type: str|int|date|bool|float` -> string|integer|string(format date)|boolean|number
 * - `pattern`, `enum` carried over
 * - `include: NAME` -> `$ref: #/definitions/NAME` (named types live under `schema;NAME` keys)
 */

interface PyKNode {
  type?: string
  mapping?: Record<string, PyKNode>
  sequence?: PyKNode[]
  include?: string
  pattern?: string
  enum?: unknown[]
  required?: boolean
  matching?: string
  format?: string
  allowempty?: boolean
  desc?: string
  name?: string
}

type JsonSchemaNode = Record<string, unknown>

/**
 * The upstream 1.0.x/1.1.0 pykwalify schemas double-escaped dots in some
 * patterns (`\\.` = "literal backslash + any char" instead of "literal dot"),
 * which would reject perfectly valid emails/URLs. Normalize to a single escape.
 */
function normalizePattern(pattern: string): string {
  return pattern.replace(/\\\\\./g, '\\.')
}

function convertNode(node: PyKNode): JsonSchemaNode {
  if (typeof node.include === 'string') {
    return {$ref: `#/definitions/${node.include}`}
  }
  switch (node.type) {
    case 'map': {
      const properties: Record<string, JsonSchemaNode> = {}
      const required: string[] = []
      for (const [key, child] of Object.entries(node.mapping ?? {})) {
        properties[key] = convertNode(child)
        if (child.required === true) required.push(key)
      }
      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? {required} : {}),
        additionalProperties: true
      }
    }
    case 'seq': {
      const entries = node.sequence ?? []
      if (entries.length === 1) {
        return {type: 'array', items: convertNode(entries[0] as PyKNode)}
      }
      return {
        type: 'array',
        items: {anyOf: entries.map(entry => convertNode(entry))}
      }
    }
    case 'str': {
      return {
        type: 'string',
        ...(node.pattern ? {pattern: normalizePattern(node.pattern)} : {}),
        ...(node.enum ? {enum: node.enum} : {})
      }
    }
    case 'int':
      return {type: 'integer', ...(node.enum ? {enum: node.enum} : {})}
    case 'float':
      return {type: 'number', ...(node.enum ? {enum: node.enum} : {})}
    case 'bool':
      return {type: 'boolean'}
    case 'date':
      // CFF dates are YYYY-MM-DD strings; see the note in the official 1.2.0 JSON schema
      return {type: 'string', format: 'date'}
    default:
      // Unknown/missing type: accept anything (pykwalify would try its default)
      return {}
  }
}

export function pykwalifyToJsonSchema(yamlSource: string, title: string): JsonSchemaNode {
  const doc = parse(yamlSource) as PyKNode
  const rootMapping = doc.mapping ?? {}

  const definitions: Record<string, JsonSchemaNode> = {}
  const properties: Record<string, JsonSchemaNode> = {}
  const required: string[] = []

  // Named types live as root-level `schema;NAME` keys, siblings of `mapping`
  for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
    if (key.startsWith('schema;')) {
      definitions[key.slice('schema;'.length)] = convertNode(value as PyKNode)
    }
  }

  for (const [key, child] of Object.entries(rootMapping)) {
    if (key.startsWith('schema;')) continue
    properties[key] = convertNode(child)
    if (child.required === true) required.push(key)
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title,
    description: typeof doc.desc === 'string' ? doc.desc : undefined,
    type: 'object',
    properties,
    ...(required.length > 0 ? {required} : {}),
    additionalProperties: true,
    definitions
  }
}
