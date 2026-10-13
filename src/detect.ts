import type {Format} from './types.js'
import {
  CODEMETA_VERSIONS,
  getLatestVersion,
  getVersions,
  isVersionRegistered,
  normalizeVersion
} from './registry.js'

/**
 * Extracts a CodeMeta version from a context URL, e.g.
 * - https://w3id.org/codemeta/3.0            -> 3.0
 * - https://doi.org/10.5063/schema/codemeta-2.0 -> 2.0
 * - https://raw.githubusercontent.com/codemeta/codemeta/2.0-rc/codemeta.jsonld -> 2.0-rc
 */
export function versionFromContextUrl(url: string): string | undefined {
  const match = /codemeta[-/](v?\d+\.\d+(?:-rc)?)/i.exec(url)
  const raw = match?.[1]
  return raw !== undefined ? normalizeVersion(raw) : undefined
}

/** Unversioned context URLs that resolve to the latest released context. */
export function isUnversionedContextUrl(url: string): boolean {
  return (
    /w3id\.org\/codemeta\/?$/i.test(url) || /codemeta\/(master|main)\/codemeta\.jsonld/i.test(url)
  )
}

/** Context URLs pointing at schema.org itself (any version, any scheme). */
export function isSchemaOrgContextUrl(url: string): boolean {
  return /^https?:\/\/schema\.org(\/version\/[\w.]+)?\/?$/i.test(url)
}

/** Heuristic codemeta-only terms, used when no recognizable @context exists. */
const VERSION_SPECIFIC_TERMS: {term: string; version: string}[] = [
  {term: 'hasSourceCode', version: '3.0'},
  {term: 'continuousIntegration', version: '3.0'},
  {term: 'isSourceCodeOf', version: '3.0'},
  {term: 'contIntegration', version: '2.0'},
  {term: 'embargoDate', version: '2.0'},
  {term: 'buildInstructions', version: '2.0'}
]

export interface DetectionOutcome {
  type?: Format
  version?: string
  versionSource: 'detected' | 'unknown'
  /** Details about how detection went, e.g. an unrecognized context. */
  detail?: string
}

/**
 * Detects the document type and, for codemeta, the context version.
 * Heuristics (in order):
 * - documents with `cff-version` -> cff
 * - documents with a recognizable codemeta `@context` -> codemeta
 * - documents with a schema.org context and a code `@type` -> schemaorg
 * - otherwise falls back to term sniffing
 */
export function detectTypeAndVersion(document: unknown): DetectionOutcome {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return {versionSource: 'unknown', detail: 'Document is not a JSON object.'}
  }
  const record = document as Record<string, unknown>

  if ('cff-version' in record) {
    return {type: 'cff', version: String(record['cff-version']), versionSource: 'detected'}
  }

  const codemeta = detectCodemetaVersion(record)
  if (codemeta.version) {
    return {type: 'codemeta', ...codemeta}
  }

  const schemaOrg = detectSchemaOrg(record)
  if (schemaOrg !== undefined) {
    return {type: 'schemaorg', version: 'latest', versionSource: 'detected'}
  }

  const sniffed = sniffVersionFromTerms(record)
  if (sniffed) {
    return {
      type: 'codemeta',
      version: sniffed,
      versionSource: 'unknown',
      detail: 'Version guessed from terms; no recognizable @context found.'
    }
  }
  if (looksLikeCodemeta(record)) {
    return {
      type: 'codemeta',
      version: getLatestVersion('codemeta'),
      versionSource: 'unknown',
      detail: 'Codemeta-like document without a recognizable @context; using the latest version.'
    }
  }
  return {versionSource: 'unknown', detail: 'Could not detect the document type.'}
}

/** Detects plain schema.org documents (no codemeta context involved). Code-relevant or not, the profile validation flags non-software @types. */
export function detectSchemaOrg(record: Record<string, unknown>): 'schemaorg' | undefined {
  const context = record['@context']
  if (context === undefined) return undefined
  const candidates = Array.isArray(context)
    ? context.filter((entry): entry is string => typeof entry === 'string')
    : typeof context === 'string'
      ? [context]
      : []
  return candidates.some(isSchemaOrgContextUrl) ? 'schemaorg' : undefined
}

function looksLikeCodemeta(record: Record<string, unknown>): boolean {
  const terms = [
    'name',
    'description',
    'author',
    'license',
    'codeRepository',
    'softwareVersion',
    'identifier'
  ]
  return Object.keys(record).some((key) => terms.includes(key))
}

function sniffVersionFromTerms(record: Record<string, unknown>): string | undefined {
  const ordering = CODEMETA_VERSIONS.map((info) => info.version)
  let best: {version: string; index: number} | undefined
  for (const {term, version} of VERSION_SPECIFIC_TERMS) {
    const index = ordering.indexOf(version)
    if (term in record && (best === undefined || index > best.index)) {
      best = {version, index}
    }
  }
  return best?.version
}

/** Detects the codemeta version from `@context` (string or array). */
export function detectCodemetaVersion(record: Record<string, unknown>): {
  version?: string
  versionSource: 'detected' | 'unknown'
  detail?: string
} {
  const context = record['@context']
  if (context === undefined) {
    return {versionSource: 'unknown', detail: 'No @context found.'}
  }
  const candidates = Array.isArray(context)
    ? context.filter((entry): entry is string => typeof entry === 'string')
    : typeof context === 'string'
      ? [context]
      : []
  if (candidates.length === 0) {
    return {versionSource: 'unknown', detail: 'No string context entries found in @context.'}
  }

  for (const candidate of candidates) {
    const version = versionFromContextUrl(candidate)
    if (version !== undefined) {
      if (isVersionRegistered('codemeta', version)) {
        return {version, versionSource: 'detected'}
      }
      const available = getVersions('codemeta')
        .map((info: {version: string}) => info.version)
        .join(', ')
      return {
        versionSource: 'unknown',
        detail: `Context references CodeMeta ${version}, which is not supported (available: ${available}).`
      }
    }
  }

  if (candidates.some(isUnversionedContextUrl)) {
    return {
      version: getLatestVersion('codemeta'),
      versionSource: 'detected',
      detail:
        'Unversioned context; resolved to the latest release. Consider pinning the context version.'
    }
  }
  return {versionSource: 'unknown', detail: `Unrecognized @context: ${candidates.join(', ')}`}
}
