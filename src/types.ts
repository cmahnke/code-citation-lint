export type Format = 'codemeta' | 'cff' | 'schemaorg'

export type Severity = 'error' | 'warning' | 'info'

export type VersionSource = 'detected' | 'specified' | 'unknown'

/** A single lint/validation finding. */
export interface LintFinding {
  severity: Severity
  /** Rule identifier, e.g. `cff/missing-license`, `schema` for schema violations. */
  rule: string
  /** Human readable message. */
  message: string
  /** JSON pointer-ish path into the document, if known. */
  path?: string
}

/** Rule configuration: disable rules or override their severity. */
export interface RuleConfig {
  disable?: string[]
  /** Map rule ids (or `*`) to a severity, or `'off'` to disable. */
  severities?: Record<string, Severity | 'off'>
}

export interface LintOptions {
  /** Force a schema version instead of autodetecting it. */
  version?: string
  /** Force the document type instead of autodetecting it. */
  type?: Format
  /** Rule configuration (disable rules, change severities). */
  rules?: RuleConfig
  /** File name or source description attached to the result. */
  file?: string
  /** Include cross-file consistency checks when both documents are known. */
  crosscheck?: boolean
  /** Recursive directory discovery (filesystem targets only). */
  recursive?: boolean
}

export interface LintResult {
  /** File name or source the document came from (when known). */
  file?: string
  type: Format
  /** Schema version used (may come from autodetection or options). */
  version?: string
  versionSource: VersionSource
  /** True when the document has no `error`-level findings. */
  valid: boolean
  errors: LintFinding[]
  warnings: LintFinding[]
  infos: LintFinding[]
}

export interface CrosscheckFindingSource {
  codemeta?: LintResult
  cff?: LintResult
}

/** Shape of an ajv error object (structural, avoids importing ajv in shared types). */
export interface AjvError {
  instancePath?: string
  message?: string
  keyword?: string
  params?: Record<string, unknown>
}
