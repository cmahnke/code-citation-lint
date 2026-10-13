/**
 * Catalog of all lint and infrastructure rule ids with their default
 * severities. The `list-rules` CLI command and `docs/rules.md` are generated
 * from this list.
 */

import type {Severity} from './types.js'

/** Rule groups: one per metadata format, plus cross-cutting groups. */
export type RuleGroup =
  'cff' | 'codemeta' | 'schemaorg' | 'crosscheck' | 'discovery' | 'init' | 'convert' | 'general'

export interface RuleInfo {
  rule: string
  group: RuleGroup
  /** Severity the rule is emitted with unless overridden via `--rules`. */
  severity: Severity
  description: string
}

/** All rule ids, grouped by metadata format, then cross-cutting groups. */
export const RULE_CATALOG: RuleInfo[] = [
  // CFF (CITATION.cff)
  {
    rule: 'cff/parse',
    group: 'cff',
    severity: 'error',
    description: 'CITATION.cff is not valid YAML or not a mapping.'
  },
  {
    rule: 'cff/no-version',
    group: 'cff',
    severity: 'error',
    description: 'No `cff-version` specified.'
  },
  {
    rule: 'cff/unsupported-version',
    group: 'cff',
    severity: 'error',
    description: 'The declared `cff-version` is not supported.'
  },
  {
    rule: 'cff/version-mismatch',
    group: 'cff',
    severity: 'warning',
    description: 'The forced schema version differs from the declared `cff-version`.'
  },
  {
    rule: 'cff/unknown-key',
    group: 'cff',
    severity: 'warning',
    description: 'Unknown key (lenient handling for CFF 1.0.x/1.1.0 schemas).'
  },
  {
    rule: 'cff/missing-license',
    group: 'cff',
    severity: 'warning',
    description: 'No `license` specified; an SPDX identifier is recommended.'
  },
  {
    rule: 'cff/missing-repository-code',
    group: 'cff',
    severity: 'info',
    description: 'No `repository-code` specified.'
  },
  {
    rule: 'cff/version-date-consistency',
    group: 'cff',
    severity: 'info',
    description: 'Only one of `version` and `date-released` is set.'
  },

  // CodeMeta (codemeta.json)
  {
    rule: 'codemeta/parse',
    group: 'codemeta',
    severity: 'error',
    description: 'Invalid JSON or not an object.'
  },
  {
    rule: 'codemeta/unsupported-version',
    group: 'codemeta',
    severity: 'error',
    description: 'The detected or forced CodeMeta version is not supported.'
  },
  {
    rule: 'codemeta/no-context',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `@context` declared.'
  },
  {
    rule: 'codemeta/context-unrecognized',
    group: 'codemeta',
    severity: 'warning',
    description: 'The `@context` is not a recognized CodeMeta context URL.'
  },
  {
    rule: 'codemeta/context-unversioned',
    group: 'codemeta',
    severity: 'warning',
    description: 'The `@context` URL does not pin a CodeMeta version.'
  },
  {
    rule: 'codemeta/version-guessed',
    group: 'codemeta',
    severity: 'warning',
    description: 'The version was guessed from document terms; no recognizable `@context`.'
  },
  {
    rule: 'codemeta/no-type',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `@type` found.'
  },
  {
    rule: 'codemeta/missing-name',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `name` (CodeMeta 1.0: `title`) specified.'
  },
  {
    rule: 'codemeta/missing-description',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `description` specified.'
  },
  {
    rule: 'codemeta/missing-author',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `author` (CodeMeta 1.0: `creator`/`agents`/`person`) specified.'
  },
  {
    rule: 'codemeta/missing-license',
    group: 'codemeta',
    severity: 'warning',
    description: 'No `license` (CodeMeta 1.0: `licenseId`) specified.'
  },
  {
    rule: 'codemeta/missing-repository',
    group: 'codemeta',
    severity: 'info',
    description: 'No `codeRepository` specified.'
  },
  {
    rule: 'codemeta/missing-version',
    group: 'codemeta',
    severity: 'info',
    description: 'No `softwareVersion` specified.'
  },
  {
    rule: 'codemeta/orcid-format',
    group: 'codemeta',
    severity: 'warning',
    description:
      'ORCID in an agent field does not match the URL pattern or fails the ISO 7064 MOD 11-2 check digit.'
  },
  {
    rule: 'codemeta/license-spdx',
    group: 'codemeta',
    severity: 'info',
    description:
      'License is not an SPDX identifier/URL, or the identifier is not in the bundled SPDX license list.'
  },

  // schema.org (software profile)
  {
    rule: 'schemaorg/parse',
    group: 'schemaorg',
    severity: 'error',
    description: 'Invalid JSON or not an object.'
  },
  {
    rule: 'schemaorg/no-context',
    group: 'schemaorg',
    severity: 'warning',
    description: 'No `@context` declared.'
  },
  {
    rule: 'schemaorg/no-type',
    group: 'schemaorg',
    severity: 'warning',
    description: 'No `@type` found.'
  },
  {
    rule: 'schemaorg/missing-name',
    group: 'schemaorg',
    severity: 'warning',
    description: 'No `name` specified.'
  },
  {
    rule: 'schemaorg/missing-description',
    group: 'schemaorg',
    severity: 'warning',
    description: 'No `description` specified.'
  },
  {
    rule: 'schemaorg/missing-author',
    group: 'schemaorg',
    severity: 'warning',
    description: 'No `author` specified.'
  },
  {
    rule: 'schemaorg/orcid-format',
    group: 'schemaorg',
    severity: 'warning',
    description:
      'ORCID in an agent field does not match the URL pattern or fails the ISO 7064 MOD 11-2 check digit.'
  },
  {
    rule: 'schemaorg/license-spdx',
    group: 'schemaorg',
    severity: 'info',
    description:
      'License is not an SPDX identifier/URL, or the identifier is not in the bundled SPDX license list.'
  },
  {
    rule: 'schemaorg/version-ignored',
    group: 'schemaorg',
    severity: 'warning',
    description: 'A version was forced, but the schema.org profile has no version axis.'
  },

  // Cross-file consistency
  {
    rule: 'crosscheck/name-mismatch',
    group: 'crosscheck',
    severity: 'warning',
    description: '`name` differs between codemeta.json and CITATION.cff.'
  },
  {
    rule: 'crosscheck/version-mismatch',
    group: 'crosscheck',
    severity: 'warning',
    description: '`version` differs between codemeta.json and CITATION.cff.'
  },
  {
    rule: 'crosscheck/license-mismatch',
    group: 'crosscheck',
    severity: 'warning',
    description: 'License differs between codemeta.json and CITATION.cff.'
  },
  {
    rule: 'crosscheck/repository-mismatch',
    group: 'crosscheck',
    severity: 'info',
    description: 'Repository URL differs between codemeta.json and CITATION.cff.'
  },

  // Directory discovery
  {
    rule: 'discovery/none-found',
    group: 'discovery',
    severity: 'warning',
    description: 'No metadata files found in the target directory (CLI exits 2).'
  },
  {
    rule: 'discovery/suggest-recursive',
    group: 'discovery',
    severity: 'info',
    description: 'Non-recursive discovery found nothing; `-r` searches subdirectories.'
  },

  // Scaffolding
  {
    rule: 'init/todo-placeholder',
    group: 'init',
    severity: 'warning',
    description: 'Generated scaffold still contains TODO placeholders.'
  },

  // Conversion
  {
    rule: 'convert/unmapped',
    group: 'convert',
    severity: 'info',
    description: 'A source key could not be mapped to the conversion target and was dropped.'
  },
  {
    rule: 'convert/missing-required',
    group: 'convert',
    severity: 'error',
    description: 'A required key (`name`/`author`) is missing for the CFF target.'
  },

  // Infrastructure
  {
    rule: 'schema',
    group: 'general',
    severity: 'error',
    description: 'JSON Schema validation failure.'
  },
  {
    rule: 'lint/parse',
    group: 'general',
    severity: 'error',
    description: 'The document could not be parsed.'
  },
  {
    rule: 'lint/undetected',
    group: 'general',
    severity: 'error',
    description: 'The document type could not be detected.'
  },
  {
    rule: 'fetch/failed',
    group: 'general',
    severity: 'error',
    description: 'A URL target could not be fetched.'
  },
  {rule: 'io/read', group: 'general', severity: 'error', description: 'A file could not be read.'},
  {
    rule: 'io/not-found',
    group: 'general',
    severity: 'error',
    description: 'A target path does not exist.'
  }
]

/** Returns the catalog entry for a rule id, if present. */
export function getRuleInfo(rule: string): RuleInfo | undefined {
  return RULE_CATALOG.find((info) => info.rule === rule)
}

/** All rule ids in the catalog. */
export function ruleIds(): string[] {
  return RULE_CATALOG.map((info) => info.rule)
}
