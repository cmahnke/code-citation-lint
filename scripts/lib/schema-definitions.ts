/** Shared JSON Schema building blocks used by the schema generators. */

export type JsonSchemaNode = Record<string, unknown>

export const AGENT_TERMS = new Set([
  'author',
  'contributor',
  'editor',
  'maintainer',
  'producer',
  'publisher',
  'provider',
  'sponsor',
  'funder',
  'copyrightHolder'
])

export const DEFINITIONS: Record<string, JsonSchemaNode> = {
  stringOrStringArray: {
    anyOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}]
  },
  dateOrDateArray: {
    anyOf: [
      {type: 'string', format: 'date'},
      {type: 'array', items: {type: 'string', format: 'date'}}
    ]
  },
  agentOrArray: {
    anyOf: [
      {$ref: '#/definitions/agent'},
      {type: 'array', items: {$ref: '#/definitions/agent'}}
    ]
  },
  agent: {
    type: 'object',
    properties: {
      '@type': {type: 'string', enum: ['Person', 'Organization', 'Role']},
      '@id': {type: 'string'},
      id: {type: 'string'},
      name: {$ref: '#/definitions/stringOrStringArray'},
      givenName: {$ref: '#/definitions/stringOrStringArray'},
      familyName: {$ref: '#/definitions/stringOrStringArray'},
      alternateName: {$ref: '#/definitions/stringOrStringArray'},
      email: {$ref: '#/definitions/stringOrStringArray'},
      affiliation: {$ref: '#/definitions/agentOrArray'},
      roleName: {$ref: '#/definitions/stringOrStringArray'},
      startDate: {type: 'string', format: 'date'},
      endDate: {type: 'string', format: 'date'}
    },
    // Agents may carry further schema.org properties; keep permissive here,
    // deeper checks are handled by lint rules.
    additionalProperties: true
  }
}

/** Classifies a term into a schema constraint for the generators. */
export function termToSchema(term: string, definition: Record<string, unknown>): JsonSchemaNode {
  if (AGENT_TERMS.has(term)) {
    return {$ref: '#/definitions/agentOrArray'}
  }
  const jsonLdType = definition['@type']
  if (jsonLdType === 'schema:Date' || jsonLdType === 'schema:DateTime') {
    return {$ref: '#/definitions/dateOrDateArray'}
  }
  // Everything else: allow strings, numbers, booleans, objects or arrays of those
  // (JSON-LD allows single values or arrays; schema.org has Boolean/Number types)
  return {
    anyOf: [
      {type: 'string'},
      {type: 'number'},
      {type: 'boolean'},
      {type: 'object'},
      {type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}, {type: 'boolean'}, {type: 'object'}]}}
    ]
  }
}
