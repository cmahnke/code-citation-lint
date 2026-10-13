import type {ValidateFunction} from 'ajv'
import type {LintFinding, LintOptions, LintResult} from '../types.js'
import {getSchema, normalizeVersion} from '../registry.js'
import {createAjv} from '../ajv.js'
import {addFinding, ajvErrorsToFindings, emptyResult, finalize, finding} from '../findings.js'
import {parseDocument} from '../lint.js'
import type {AjvError} from '../types.js'
import {isSpdxId, spdxLicenseListVersion} from '../spdx.js'
import {orcidProblem} from '../orcid.js'

const compiled = new WeakMap<object, ValidateFunction>()

function getValidator(schema: object): ValidateFunction {
  const cached = compiled.get(schema)
  if (cached) return cached
  const ajv = createAjv(schema as {$schema?: string})
  const validate = ajv.compile(schema)
  compiled.set(schema, validate)
  return validate
}

const SPDX_URL_PATTERN = /^https?:\/\/spdx\.org\/licenses\/[A-Za-z0-9+.-]+/
const SPDX_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+.-]*$/

const AGENT_FIELDS = ['author', 'contributor', 'editor', 'maintainer', 'producer', 'publisher', 'provider', 'sponsor', 'funder', 'copyrightHolder']

function hasAny(document: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => {
    const value = document[key]
    return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)
  })
}

/** Runs the lint rules for schema.org documents. */
function runSchemaOrgRules(document: Record<string, unknown>): LintFinding[] {
  const findings: LintFinding[] = []

  if (!hasAny(document, ['@context'])) {
    findings.push(finding('warning', 'schemaorg/no-context', 'No @context found. A schema.org document should declare the schema.org context.'))
  }
  if (!hasAny(document, ['@type'])) {
    findings.push(finding('warning', 'schemaorg/no-type', 'No @type found. Expected "SoftwareSourceCode", "SoftwareApplication" or "Dataset".'))
  }
  if (!hasAny(document, ['name'])) {
    findings.push(finding('warning', 'schemaorg/missing-name', 'No name specified. The software name is required for useful citations.'))
  }
  if (!hasAny(document, ['description'])) {
    findings.push(finding('warning', 'schemaorg/missing-description', 'No description specified.'))
  }
  if (!hasAny(document, ['author'])) {
    findings.push(finding('warning', 'schemaorg/missing-author', 'No author specified. Authors are required for useful citations.'))
  }

  // ORCID format in agent-like fields
  for (const field of AGENT_FIELDS) {
    const value = document[field]
    if (value === undefined) continue
    const agents = Array.isArray(value) ? value : [value]
    agents.forEach((agent, index) => {
      if (agent === null || typeof agent !== 'object') return
      const id = (agent as Record<string, unknown>)['@id'] ?? (agent as Record<string, unknown>)['id']
      if (typeof id !== 'string') return
      const problem = orcidProblem(id)
      if (problem === 'format') {
        findings.push(
          finding('warning', 'schemaorg/orcid-format', `ORCID "${id}" does not match https://orcid.org/XXXX-XXXX-XXXX-XXXX[9X].`, `/${field}/${index}/@id`)
        )
      } else if (problem === 'check-digit') {
        findings.push(
          finding('warning', 'schemaorg/orcid-format', `ORCID "${id}" does not pass the ORCID check digit (ISO 7064 MOD 11-2).`, `/${field}/${index}/@id`)
        )
      }
    })
  }

  // License shape: SPDX URL preferred (as emitted by conversions), plain SPDX ids accepted
  const license = document.license
  if (typeof license === 'string' && license.length > 0) {
    const looksLikeUrl = /^https?:\/\//.test(license)
    if (!looksLikeUrl && !SPDX_ID_PATTERN.test(license)) {
      findings.push(finding('info', 'schemaorg/license-spdx', `License "${license}" does not look like an SPDX identifier or SPDX URL.`))
    } else if (looksLikeUrl && !SPDX_URL_PATTERN.test(license) && !/licenses/.test(license)) {
      findings.push(finding('info', 'schemaorg/license-spdx', `License URL "${license}" is not an SPDX license URL; consider using one.`))
    } else if (!looksLikeUrl && !isSpdxId(license)) {
      findings.push(
        finding('info', 'schemaorg/license-spdx', `License "${license}" is well-formed but not in the SPDX license list (v${spdxLicenseListVersion()}).`)
      )
    }
  }

  return findings
}

/** Validates a parsed schema.org object against the software profile and rules. */
export function lintSchemaOrgObject(document: unknown, options: LintOptions = {}): LintResult {
  const result = emptyResult('schemaorg', options.file)

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    addFinding(result, finding('error', 'schemaorg/parse', 'schema.org document must be a JSON object.'))
    return finalize(result, options)
  }
  const record = document as Record<string, unknown>

  // The profile has no version axis; an explicit version is honored when registered.
  const normalizedOption = options.version !== undefined ? normalizeVersion(options.version) : undefined
  let version = 'latest'
  let versionSource: LintResult['versionSource'] = 'detected'
  if (normalizedOption !== undefined && getSchema('schemaorg', normalizedOption)) {
    version = normalizedOption
    versionSource = 'specified'
  } else if (normalizedOption !== undefined && normalizedOption !== 'latest') {
    addFinding(
      result,
      finding('warning', 'schemaorg/version-ignored', `schema.org has no version axis; validating against the curated profile (requested: ${options.version}).`)
    )
  }
  result.version = version
  result.versionSource = versionSource

  // Schema validation
  const schema = getSchema('schemaorg', version) as object | undefined
  if (schema) {
    const validate = getValidator(schema)
    if (!validate(record)) {
      for (const schemaFinding of ajvErrorsToFindings((validate.errors ?? []) as AjvError[], record)) {
        addFinding(result, schemaFinding)
      }
    }
  }

  for (const rule of runSchemaOrgRules(record)) {
    addFinding(result, rule)
  }

  return finalize(result, options)
}

/** Lints schema.org content (JSON text). */
export function lintSchemaOrgContent(content: string, options: LintOptions = {}): LintResult {
  const result = emptyResult('schemaorg', options.file)
  const parsed = parseDocument(content)
  if (parsed.document === undefined) {
    addFinding(result, finding('error', 'schemaorg/parse', parsed.error ?? 'Could not parse the document.'))
    const normalized = options.version !== undefined ? normalizeVersion(options.version) : undefined
    if (normalized !== undefined && getSchema('schemaorg', normalized)) {
      result.version = normalized
      result.versionSource = 'specified'
    } else {
      result.version = 'latest'
      result.versionSource = 'detected'
    }
    return finalize(result, options)
  }
  return lintSchemaOrgObject(parsed.document, options)
}
