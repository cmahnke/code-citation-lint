import type {ValidateFunction} from 'ajv'
import {parse as parseYaml} from 'yaml'
import type {LintFinding, LintOptions, LintResult} from '../types.js'
import {getSchema, getVersions, normalizeVersion} from '../registry.js'
import {createAjv} from '../ajv.js'
import {addFinding, ajvErrorsToFindings, emptyResult, finalize, finding} from '../findings.js'

/** Compiled validators keyed by schema object identity; registerVersion swaps objects and busts the cache. */
const compiled = new WeakMap<object, ValidateFunction>()

function getValidator(schema: object): ValidateFunction {
  const cached = compiled.get(schema)
  if (cached) return cached
  const ajv = createAjv(schema as {$schema?: string})
  const validate = ajv.compile(schema)
  compiled.set(schema, validate)
  return validate
}

const LICENSE_HINT = 'The license should be an SPDX identifier (see https://spdx.org/licenses/).'

/** Runs the lint rules for CFF documents. */
function runCffRules(document: Record<string, unknown>, schema: object): LintFinding[] {
  const findings: LintFinding[] = []
  const has = (key: string): boolean => document[key] !== undefined && document[key] !== null

  if (!has('license')) {
    findings.push(
      finding('warning', 'cff/missing-license', `No license specified. ${LICENSE_HINT}`)
    )
  }
  if (!has('repository-code')) {
    findings.push(
      finding(
        'info',
        'cff/missing-repository-code',
        'No repository-code specified. Pointing to the source code repository helps others find your work.'
      )
    )
  }
  if (has('version') !== has('date-released')) {
    findings.push(
      finding(
        'info',
        'cff/version-date-consistency',
        'Only one of "version" and "date-released" is present. Providing both makes the citation more precise.'
      )
    )
  }

  // Lenient converted schemas (CFF 1.0.x/1.1.0) allow additional properties;
  // surface unknown keys as warnings there.
  const rootSchema = schema as {
    additionalProperties?: boolean
    properties?: Record<string, unknown>
  }
  if (rootSchema.additionalProperties === true) {
    const known = new Set(Object.keys(rootSchema.properties ?? {}))
    for (const key of Object.keys(document)) {
      if (!known.has(key)) {
        findings.push(
          finding(
            'warning',
            'cff/unknown-key',
            `"${key}" is not a valid key for this CFF version.`,
            `/${key}`
          )
        )
      }
    }
  }
  return findings
}

/** YAML date nodes may surface as Date objects; the CFF schema expects strings. */
export function stringifyDates(value: unknown): unknown {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (Array.isArray(value)) {
    return value.map(stringifyDates)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = stringifyDates(item)
    }
    return out
  }
  return value
}

function parseCff(content: string): unknown {
  return stringifyDates(parseYaml(content))
}

/** Lints CFF content (YAML text). */
export function lintCffContent(content: string, options: LintOptions = {}): LintResult {
  const result = emptyResult('cff', options.file)
  let document: unknown
  try {
    document = parseCff(content)
  } catch (error) {
    addFinding(result, finding('error', 'cff/parse', `Invalid YAML: ${(error as Error).message}`))
    if (options.version !== undefined) {
      result.version = normalizeVersion(options.version)
      result.versionSource = 'specified'
    }
    return finalize(result, options)
  }
  return lintCffObject(document, options)
}

/** Validates a parsed CFF object against the CFF schema and rules. */
export function lintCffObject(document: unknown, options: LintOptions = {}): LintResult {
  const result = emptyResult('cff', options.file)

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    addFinding(result, finding('error', 'cff/parse', 'CFF document must be a mapping.'))
    return finalize(result, options)
  }
  const record = document as Record<string, unknown>

  // Version handling
  const detected =
    typeof record['cff-version'] === 'string' ? normalizeVersion(record['cff-version']) : undefined
  const normalizedOption =
    options.version !== undefined ? normalizeVersion(options.version) : undefined
  let version = normalizedOption ?? detected
  let versionSource: LintResult['versionSource'] = options.version
    ? 'specified'
    : detected
      ? 'detected'
      : 'unknown'
  if (detected && normalizedOption && normalizedOption !== detected) {
    addFinding(
      result,
      finding(
        'warning',
        'cff/version-mismatch',
        `Document declares cff-version ${detected}, validating against ${normalizedOption}.`
      )
    )
  }
  if (!detected && !options.version) {
    addFinding(
      result,
      finding(
        'error',
        'cff/no-version',
        'No cff-version found. A CITATION.cff must declare its CFF version.'
      )
    )
  }
  if (version && !getSchema('cff', version)) {
    const available = getVersions('cff')
      .map((info) => info.version)
      .join(', ')
    addFinding(
      result,
      finding(
        'error',
        'cff/unsupported-version',
        `Unsupported cff-version ${version} (available: ${available}).`
      )
    )
    version = undefined
    versionSource = 'unknown'
  }
  result.version = version
  result.versionSource = versionSource

  // Schema validation
  const schema = version !== undefined ? (getSchema('cff', version) as object) : undefined
  if (schema) {
    const validate = getValidator(schema)
    if (!validate(record)) {
      for (const schemaFinding of ajvErrorsToFindings(validate.errors ?? [], record)) {
        addFinding(result, schemaFinding)
      }
    }
  }

  // Rules
  for (const rule of runCffRules(record, schema ?? {})) {
    addFinding(result, rule)
  }

  return finalize(result, options)
}
