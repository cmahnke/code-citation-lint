import type {LintFinding, LintOptions, LintResult} from '../types.js'
import {getSchema, getVersions, normalizeVersion} from '../registry.js'
import {detectCodemetaVersion, detectTypeAndVersion} from '../detect.js'
import {createAjv} from '../ajv.js'
import {addFinding, ajvErrorsToFindings, emptyResult, finalize, finding} from '../findings.js'
import {isSpdxId, spdxLicenseListVersion} from '../spdx.js'
import {orcidProblem} from '../orcid.js'

const compiled = new WeakMap<object, (data: unknown) => boolean>()

function getValidator(schema: object): (data: unknown) => boolean {
  const cached = compiled.get(schema)
  if (cached) return cached
  const ajv = createAjv(schema as {$schema?: string})
  const validate = ajv.compile(schema)
  compiled.set(schema, validate)
  return validate
}

const SPDX_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+.-]*$/
const SPDX_URL_PATTERN = /^https?:\/\/spdx\.org\/licenses\/[A-Za-z0-9+.-]+/

/**
 * Field synonyms across CodeMeta versions: CodeMeta 1.0 uses its own
 * vocabulary (`title`, `licenseId`, `person`/`agents`) while 2.0+ uses the
 * schema.org-style terms (`name`, `license`, `author`).
 */
const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'title'],
  author: ['author', 'creator', 'agents', 'person'],
  license: ['license', 'licenseId'],
  version: ['softwareVersion', 'version'],
  repository: ['codeRepository'],
  description: ['description']
}

function hasAny(document: Record<string, unknown>, synonyms: string[]): boolean {
  return synonyms.some(key => {
    const value = document[key]
    return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)
  })
}

/** Runs the lint rules for CodeMeta documents. */
function runCodeMetaRules(document: Record<string, unknown>, detectionDetail?: string): LintFinding[] {
  const findings: LintFinding[] = []

  if (!hasAny(document, ['@context'])) {
    findings.push(finding('warning', 'codemeta/no-context', 'No @context found. A codemeta.json should declare its CodeMeta context.'))
  } else if (detectionDetail) {
    findings.push(finding('warning', 'codemeta/context-unrecognized', detectionDetail))
  }
  if (!hasAny(document, ['@type'])) {
    findings.push(finding('warning', 'codemeta/no-type', 'No @type found. Expected "SoftwareSourceCode" or "SoftwareApplication".'))
  }
  if (!hasAny(document, SYNONYMS.name ?? [])) {
    findings.push(finding('warning', 'codemeta/missing-name', 'No name specified. The software name is required for useful citations.'))
  }
  if (!hasAny(document, SYNONYMS.description ?? [])) {
    findings.push(finding('warning', 'codemeta/missing-description', 'No description specified.'))
  }
  if (!hasAny(document, SYNONYMS.author ?? [])) {
    findings.push(finding('warning', 'codemeta/missing-author', 'No author specified. Authors are required for useful citations.'))
  }
  if (!hasAny(document, SYNONYMS.license ?? [])) {
    findings.push(finding('warning', 'codemeta/missing-license', 'No license specified. Use an SPDX identifier or SPDX URL.'))
  }
  if (!hasAny(document, SYNONYMS.repository ?? [])) {
    findings.push(finding('info', 'codemeta/missing-repository', 'No codeRepository specified.'))
  }
  if (!hasAny(document, SYNONYMS.version ?? [])) {
    findings.push(finding('info', 'codemeta/missing-version', 'No softwareVersion specified.'))
  }

  // ORCID format in agent-like fields
  const agentFields = ['author', 'contributor', 'editor', 'maintainer', 'publisher', 'provider', 'sponsor', 'funder', 'copyrightHolder']
  for (const field of agentFields) {
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
          finding('warning', 'codemeta/orcid-format', `ORCID "${id}" does not match https://orcid.org/XXXX-XXXX-XXXX-XXXX[9X].`, `/${field}/${index}/@id`)
        )
      } else if (problem === 'check-digit') {
        findings.push(
          finding('warning', 'codemeta/orcid-format', `ORCID "${id}" does not pass the ORCID check digit (ISO 7064 MOD 11-2).`, `/${field}/${index}/@id`)
        )
      }
    })
  }

  // License shape
  const license = document.license
  if (typeof license === 'string' && license.length > 0) {
    const looksLikeUrl = /^https?:\/\//.test(license)
    if (!looksLikeUrl && !SPDX_ID_PATTERN.test(license)) {
      findings.push(finding('info', 'codemeta/license-spdx', `License "${license}" does not look like an SPDX identifier.`))
    } else if (looksLikeUrl && !SPDX_URL_PATTERN.test(license)) {
      findings.push(finding('info', 'codemeta/license-spdx', `License URL "${license}" is not an SPDX license URL; consider using an SPDX identifier.`))
    } else if (!looksLikeUrl && !isSpdxId(license)) {
      findings.push(
        finding('info', 'codemeta/license-spdx', `License "${license}" is well-formed but not in the SPDX license list (v${spdxLicenseListVersion()}).`)
      )
    }
  }

  return findings
}

/** Validates a parsed CodeMeta object against the generated schema and rules. */
export function lintCodeMetaObject(document: unknown, options: LintOptions = {}): LintResult {
  const result = emptyResult('codemeta', options.file)

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    addFinding(result, finding('error', 'codemeta/parse', 'CodeMeta document must be a JSON object.'))
    return finalize(result, options)
  }
  const record = document as Record<string, unknown>

  // Version detection: explicit option wins, then @context, then sniffing
  const normalizedOption = options.version !== undefined ? normalizeVersion(options.version) : undefined
  const detection = detectCodemetaVersion(record)
  const sniffed = detectTypeAndVersion(record)
  let version = normalizedOption ?? detection.version ?? sniffed.version
  let versionSource: LintResult['versionSource'] = options.version ? 'specified' : (detection.version !== undefined ? 'detected' : 'unknown')

  const unversioned = !options.version && isUnversionedDetail(detection.detail)
  if (unversioned) {
    addFinding(result, finding('warning', 'codemeta/context-unversioned', detection.detail ?? 'Unversioned context.'))
  }

  // When the version comes from term sniffing or the codemeta-like fallback,
  // surface an explicit warning that includes the detection detail.
  if (!options.version && detection.version === undefined && sniffed.version !== undefined && sniffed.type === 'codemeta') {
    addFinding(
      result,
      finding('warning', 'codemeta/version-guessed', sniffed.detail ?? `Version guessed as ${sniffed.version}; no recognizable @context found.`)
    )
  }

  if (version !== undefined && !getSchema('codemeta', version)) {
    const available = getVersions('codemeta')
      .map(info => info.version)
      .join(', ')
    addFinding(result, finding('error', 'codemeta/unsupported-version', `Unsupported CodeMeta version ${version} (available: ${available}).`))
    version = undefined
    versionSource = 'unknown'
  }
  result.version = version
  result.versionSource = versionSource

  // Schema validation
  const schema = version !== undefined ? (getSchema('codemeta', version) as object) : undefined
  if (schema) {
    const validate = getValidator(schema)
    if (!validate(record)) {
      // typed lazily to keep ajv typing local; validate.errors is available after a failed run
      const ajvValidate = validate as unknown as {errors: {instancePath?: string; message?: string}[] | null}
      for (const schemaFinding of ajvErrorsToFindings(ajvValidate.errors ?? [], record)) {
        addFinding(result, schemaFinding)
      }
    }
  }

  for (const rule of runCodeMetaRules(record, detection.version === undefined ? detection.detail : undefined)) {
    addFinding(result, rule)
  }

  return finalize(result, options)
}

function isUnversionedDetail(detail: string | undefined): boolean {
  return typeof detail === 'string' && detail.toLowerCase().includes('unversioned')
}

/** Lints CodeMeta content (JSON text). */
export function lintCodeMetaContent(content: string, options: LintOptions = {}): LintResult {
  const result = emptyResult('codemeta', options.file)
  let document: unknown
  try {
    document = JSON.parse(content)
  } catch (error) {
    addFinding(result, finding('error', 'codemeta/parse', `Invalid JSON: ${(error as Error).message}`))
    if (options.version !== undefined) {
      result.version = normalizeVersion(options.version)
      result.versionSource = 'specified'
    }
    return finalize(result, options)
  }
  return lintCodeMetaObject(document, options)
}
