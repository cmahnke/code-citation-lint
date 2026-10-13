/**
 * Generates per-version JSON Schemas for CodeMeta instance documents from the
 * vendored JSON-LD contexts.
 *
 * CodeMeta has no official JSON Schema; this generator derives one per version:
 * - allowed top-level terms are exactly the terms of that context version
 * - `@context` is restricted to the context URLs known for that version
 * - dates, URLs and agent-like terms get safe structural type constraints
 * - unknown terms are rejected (`additionalProperties: false`), except
 *   `schema:`-prefixed terms (see the CodeMeta user guide) and other `@`-keys
 *
 * The generated schemas are intentionally lenient about single-vs-array values
 * (JSON-LD allows both); stricter expectations are enforced as lint rules.
 */

import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {DEFINITIONS, termToSchema} from './lib/schema-definitions.js'

const SCHEMA_DIR = path.resolve(import.meta.dirname, '../schemas')

type JsonSchemaNode = Record<string, unknown>

const CODEMETA_VERSIONS = ['1.0', '2.0-rc', '2.0', '2.1', '3.0', '3.1', '4.0']

/** Well-known context URLs per version, plus "unversioned" aliases that resolve to the latest release. */
const CONTEXT_URLS: Record<string, string[]> = {
  '1.0': [
    'https://doi.org/10.5063/schema/codemeta-1.0',
    'http://doi.org/10.5063/schema/codemeta-1.0',
    'https://raw.githubusercontent.com/codemeta/codemeta/1.0/codemeta.jsonld'
  ],
  '2.0-rc': ['https://raw.githubusercontent.com/codemeta/codemeta/2.0-rc/codemeta.jsonld'],
  '2.0': [
    'https://doi.org/10.5063/schema/codemeta-2.0',
    'http://doi.org/10.5063/schema/codemeta-2.0',
    'https://raw.githubusercontent.com/codemeta/codemeta/2.0/codemeta.jsonld'
  ],
  '2.1': ['https://raw.githubusercontent.com/codemeta/codemeta/2.1/codemeta.jsonld'],
  '3.0': [
    'https://w3id.org/codemeta/3.0',
    'https://raw.githubusercontent.com/codemeta/codemeta/3.0/codemeta.jsonld'
  ],
  '3.1': [
    'https://w3id.org/codemeta/3.1',
    'https://raw.githubusercontent.com/codemeta/codemeta/3.1/codemeta.jsonld'
  ],
  '4.0': [
    'https://w3id.org/codemeta/4.0',
    'https://raw.githubusercontent.com/codemeta/codemeta/4.0/codemeta.jsonld'
  ]
}

const LATEST_ALIASES = [
  'https://w3id.org/codemeta',
  'https://raw.githubusercontent.com/codemeta/codemeta/master/codemeta.jsonld',
  'https://raw.githubusercontent.com/codemeta/codemeta/main/codemeta.jsonld'
]

function contextEnum(version: string): string[] {
  const urls = CONTEXT_URLS[version] ?? []
  return [...urls, ...LATEST_ALIASES]
}

/** Term values like "schema:Person" (class names start with a capital letter). */
function isClassName(value: string): boolean {
  const parts = value.split(':')
  const local = parts.length > 1 ? (parts[1] ?? '') : value
  return /^[A-Z]/.test(local)
}

function isTermMapping(value: string): boolean {
  return /^(schema|codemeta):[a-z]/.test(value) || !value.includes(':')
}

async function main(): Promise<void> {
  for (const version of CODEMETA_VERSIONS) {
    const versionDir = path.join(SCHEMA_DIR, 'codemeta', version)
    const contextFile = path.join(versionDir, 'codemeta.jsonld')
    const context = JSON.parse(await readFile(contextFile, 'utf8')) as {
      '@context': Record<string, unknown>
    }

    const classTypes = new Set<string>(['SoftwareSourceCode', 'SoftwareApplication'])
    const properties: Record<string, JsonSchemaNode> = {
      '@context': {
        description: 'JSON-LD context. Must reference a CodeMeta context.',
        anyOf: [
          {enum: contextEnum(version)},
          {
            type: 'array',
            items: {anyOf: [{enum: contextEnum(version)}, {type: 'string'}, {type: 'object'}]}
          }
        ]
      },
      '@type': {type: 'string'},
      '@id': {type: 'string'}
    }

    const terms: string[] = []
    for (const [key, value] of Object.entries(context['@context'])) {
      if (key === 'type' || key === 'id') continue
      if (typeof value === 'string') {
        // Early contexts (e.g. 2.0-rc) map terms to "schema:..." strings
        if (isClassName(value)) {
          classTypes.add(value.split(':').pop() ?? value)
        } else if (isTermMapping(value)) {
          properties[key] = termToSchema(key, {})
          terms.push(key)
        }
        continue
      }
      if (typeof value === 'object' && value !== null && '@id' in value) {
        properties[key] = termToSchema(key, value as Record<string, unknown>)
        terms.push(key)
      }
    }
    ;(properties['@type'] as JsonSchemaNode).enum = [...classTypes].sort()

    const schema: JsonSchemaNode = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: `CodeMeta ${version}`,
      description: `Schema for CodeMeta ${version} instance documents, generated from the official JSON-LD context.`,
      type: 'object',
      properties,
      patternProperties: {
        // Additional schema.org terms may be used with an explicit prefix (CodeMeta user guide),
        // other @-keywords (e.g. @id, @graph) are JSON-LD machinery.
        '^schema:': {},
        '^@': {}
      },
      additionalProperties: false,
      definitions: DEFINITIONS
    }

    const outFile = path.join(versionDir, 'schema.json')
    await writeFile(outFile, JSON.stringify(schema, null, 2) + '\n', 'utf8')
    console.log(`OK ${version}: ${terms.length} terms -> ${path.relative(process.cwd(), outFile)}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
