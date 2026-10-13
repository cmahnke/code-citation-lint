/**
 * Conversions between CITATION.cff and CodeMeta / schema.org / Zenodo.
 *
 * The field mapping follows the reference implementation cffconvert
 * (github.com/citation-file-format/cffconvert, MIT licensed): its codemeta
 * writer is the schema.org writer with a different @context, so a single
 * mapping serves both targets:
 *
 * - title           -> name
 * - abstract        -> description
 * - keywords        -> keywords
 * - version         -> version
 * - date-released   -> datePublished
 * - license         -> https://spdx.org/licenses/{license}
 * - doi/identifiers -> identifier as https://doi.org/... (doi identifiers win)
 * - type            -> @type SoftwareSourceCode, or Dataset for type: dataset
 *                      (datasets lose codeRepository, as in cffconvert)
 * - repository-code > repository > repository-artifact -> codeRepository
 * - identifiers[type=url].value > url > repository > repository-code >
 *   repository-artifact                  -> url
 * - person authors  -> {@type: Person, givenName, familyName (incl. name
 *                      particle/suffix), affiliation, alternateName, email, @id}
 * - entity authors  -> {@type: Organization, name, alternateName, email, @id}
 *
 * The zenodo writer mirrors cffconvert's Zenodo JSON output, and the reverse
 * conversion (codemeta -> cff) follows the field mapping of
 * caltechlibrary/codemeta2cff, reporting information loss as issues.
 */

import type {LintFinding, LintResult} from './types.js'
import {codemetaContextUrl, getLatestVersion, getVersions, isVersionRegistered, normalizeVersion} from './registry.js'
import {stringifyDates} from './cff/lint.js'
import {lintCodeMetaObject} from './codemeta/lint.js'
import {lintSchemaOrgObject} from './schemaorg/lint.js'
import {lintCffObject} from './cff/lint.js'
import {parseDocument} from './lint.js'
import {versionFromContextUrl} from './detect.js'
import {finding} from './findings.js'

export type ConvertTarget = 'codemeta' | 'schemaorg' | 'zenodo' | 'cff'

export interface ConvertOptions {
  /** Target CodeMeta version for cff->codemeta conversions (default: latest). */
  codemetaVersion?: string
  /** Target CFF version for codemeta->cff conversions (default: latest released). */
  cffVersion?: string
  /** Attach lint findings of the converted document. */
  lint?: boolean
  file?: string
}

export interface ConvertOutcome {
  document: object
  target: ConvertTarget
  /** Codemeta version used (codemeta target) or CFF version used (cff target). */
  version?: string
  /** Lint result of the converted document (when linting is enabled). */
  result?: LintResult
  /** Information-loss findings: dropped keys, synthesized values, unmapped terms. */
  issues: LintFinding[]
}

interface CffDocument {
  title?: string
  abstract?: string
  keywords?: string[]
  version?: string | number
  'date-released'?: string
  license?: string
  'license-url'?: string
  doi?: string
  identifiers?: {type: string; value: string; description?: string; relation?: string}[]
  type?: string
  'repository-code'?: string
  repository?: string
  'repository-artifact'?: string
  url?: string
  authors?: CffAuthor[]
  commit?: string
  message?: string
  contact?: CffAuthor[]
  [key: string]: unknown
}

interface CffAuthor {
  'given-names'?: string
  'name-particle'?: string
  'family-names'?: string
  'name-suffix'?: string
  alias?: string
  affiliation?: string
  orcid?: string
  email?: string
  name?: string
  [key: string]: unknown
}

/** cffconvert's _get_full_last_name: particle + family names + suffix. */
function fullLastName(author: CffAuthor): string {
  return [author['name-particle'], author['family-names'], author['name-suffix']].filter(part => part !== undefined).join(' ')
}

/** Converts one CFF author (person or entity) to a schema.org agent, mirroring cffconvert. */
export function authorToSchemaOrg(author: CffAuthor): object {
  if (author.name !== undefined) {
    // Entities
    const organization: Record<string, unknown> = {'@type': 'Organization'}
    if (author.orcid !== undefined) organization['@id'] = author.orcid
    organization.name = author.name
    if (author.alias !== undefined) organization.alternateName = author.alias
    if (author.email !== undefined) organization.email = author.email
    return organization
  }
  const person: Record<string, unknown> = {'@type': 'Person'}
  if (author.orcid !== undefined) person['@id'] = author.orcid
  if (author['given-names'] !== undefined) person.givenName = author['given-names']
  if (author['family-names'] !== undefined || author['name-particle'] !== undefined || author['name-suffix'] !== undefined) {
    person.familyName = fullLastName(author)
  }
  if (author.alias !== undefined) person.alternateName = author.alias
  if (author.affiliation !== undefined) {
    person.affiliation = {'@type': 'Organization', name: author.affiliation}
  }
  if (author.email !== undefined) person.email = author.email
  return person
}

function firstDoi(cff: CffDocument): string | undefined {
  for (const identifier of cff.identifiers ?? []) {
    if (identifier.type === 'doi' && identifier.value !== undefined) {
      return identifier.value
    }
  }
  return cff.doi
}

function firstIdentifierUrl(cff: CffDocument): string | undefined {
  for (const identifier of cff.identifiers ?? []) {
    if (identifier.type === 'url' && identifier.value !== undefined) {
      return identifier.value
    }
  }
  return undefined
}

function defined(value: unknown): boolean {
  return value !== undefined && value !== null
}

/** Resolves codeRepository/url per the cffconvert behavior matrix. */
function resolveUrls(cff: CffDocument): {codeRepository?: string; url?: string} {
  const codeRepository = (cff['repository-code'] ?? cff.repository ?? cff['repository-artifact']) as string | undefined
  const url = (firstIdentifierUrl(cff) ?? cff.url ?? cff.repository ?? cff['repository-code'] ?? cff['repository-artifact']) as string | undefined
  return {
    ...(defined(codeRepository) ? {codeRepository} : {}),
    ...(defined(url) ? {url} : {})
  }
}

/** Formats a Date with the local calendar year/month/day as YYYY-MM-DD. */
function formatLocalDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Normalizes a CFF date value (string or YAML Date) to a YYYY-MM-DD string. */
function cffOutputDate(value: unknown): string | undefined {
  if (value instanceof Date) return formatLocalDate(value)
  if (defined(value)) return value as string
  return undefined
}

/** Converts a CFF document into a plain schema.org document. */
export function cffToSchemaOrg(cff: object): object {
  const record = cff as CffDocument
  const isDataset = record.type === 'dataset'
  const urls = resolveUrls(record)
  const doi = firstDoi(record)
  const datePublished = cffOutputDate(record['date-released'])

  const output: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': isDataset ? 'Dataset' : 'SoftwareSourceCode',
    ...(defined(record.title) ? {name: record.title} : {}),
    ...(defined(record.abstract) ? {description: record.abstract} : {}),
    ...(Array.isArray(record.authors) && record.authors.length > 0
      ? {author: record.authors.map(author => authorToSchemaOrg(author))}
      : {}),
    ...(defined(datePublished) ? {datePublished} : {}),
    ...(defined(doi) ? {identifier: `https://doi.org/${doi}`} : {}),
    ...(Array.isArray(record.keywords) && record.keywords.length > 0 ? {keywords: record.keywords} : {}),
    ...(defined(record.license)
      ? {license: `https://spdx.org/licenses/${record.license}`}
      : defined(record['license-url'])
        ? {license: record['license-url']}
        : {}),
    // schema.org does not specify a codeRepository target for datasets (cffconvert drops it)
    ...(!isDataset && defined(urls.codeRepository) ? {codeRepository: urls.codeRepository} : {}),
    ...(defined(urls.url) ? {url: urls.url} : {}),
    ...(defined(record.version) ? {version: record.version} : {})
  }
  return output
}

/** Converts a CFF document into a CodeMeta document (latest version by default). */
export function cffToCodemeta(cff: object, options: ConvertOptions = {}): object {
  const requested = options.codemetaVersion !== undefined ? normalizeVersion(options.codemetaVersion) : undefined
  if (requested !== undefined && !isVersionRegistered('codemeta', requested)) {
    const available = getVersions('codemeta')
      .map(info => info.version)
      .join(', ')
    throw new Error(`Unsupported CodeMeta version ${requested} (available: ${available}).`)
  }
  const version = requested ?? getLatestVersion('codemeta')
  const document = cffToSchemaOrg(cff) as Record<string, unknown>
  document['@context'] = codemetaContextUrl(version)
  return document
}

/** Converts one CFF author to a Zenodo creator, mirroring cffconvert's ZenodoAuthor. */
function authorToZenodo(author: CffAuthor): Record<string, unknown> | undefined {
  const orcid = author.orcid !== undefined ? author.orcid.replace('https://orcid.org/', '') : undefined
  if (author.name !== undefined) {
    return {
      ...(defined(author.affiliation) ? {affiliation: author.affiliation} : {}),
      name: author.name,
      ...(orcid !== undefined ? {orcid} : {})
    }
  }
  if (author['given-names'] !== undefined) {
    const hasLast = author['family-names'] !== undefined || author['name-particle'] !== undefined || author['name-suffix'] !== undefined
    const name = hasLast ? `${fullLastName(author)}, ${author['given-names']}` : author['given-names']
    return {
      ...(defined(author.affiliation) ? {affiliation: author.affiliation} : {}),
      name,
      ...(orcid !== undefined ? {orcid} : {})
    }
  }
  if (author['family-names'] !== undefined || author['name-particle'] !== undefined || author['name-suffix'] !== undefined) {
    return {
      ...(defined(author.affiliation) ? {affiliation: author.affiliation} : {}),
      name: fullLastName(author),
      ...(orcid !== undefined ? {orcid} : {})
    }
  }
  if (author.alias !== undefined) {
    return {
      ...(defined(author.affiliation) ? {affiliation: author.affiliation} : {}),
      name: author.alias,
      ...(orcid !== undefined ? {orcid} : {})
    }
  }
  if (orcid !== undefined) {
    return {orcid}
  }
  if (author.affiliation !== undefined) {
    return {affiliation: author.affiliation}
  }
  return undefined
}

/** Zenodo relation types (relation is lowercased-first for CFF 1.3+ identifiers). */
const ZENODO_RELATION_TYPES = new Set([
  'HasMetadata',
  'HasVersion',
  'IsMetadataFor',
  'IsOriginalFormOf',
  'IsVariantFormOf',
  'IsVersionOf'
])

function mapZenodoRelation(relation: string | undefined): string | undefined {
  if (relation === undefined || ZENODO_RELATION_TYPES.has(relation)) return undefined
  return relation.charAt(0).toLowerCase() + relation.slice(1)
}

/** Converts a CFF document into a Zenodo JSON document (.zenodo.json), mirroring cffconvert. */
export function cffToZenodo(cff: object): object {
  const record = cff as CffDocument
  const seen: string[] = []
  const relatedIdentifiers: Record<string, string>[] = []
  for (const identifier of record.identifiers ?? []) {
    if (identifier.type === 'other' || seen.includes(identifier.value)) continue
    relatedIdentifiers.push({
      identifier: identifier.value,
      relation: mapZenodoRelation(identifier.relation) ?? 'isSupplementedBy',
      scheme: identifier.type
    })
    seen.push(identifier.value)
  }
  if (record.doi !== undefined && !seen.includes(record.doi)) {
    relatedIdentifiers.push({identifier: record.doi, relation: 'isSupplementedBy', scheme: 'doi'})
    seen.push(record.doi)
  }
  for (const cffKey of ['repository', 'repository-artifact', 'repository-code', 'url'] as const) {
    const url = record[cffKey]
    if (!defined(url) || seen.includes(url as string)) continue
    relatedIdentifiers.push({identifier: url as string, relation: 'isSupplementedBy', scheme: 'url'})
    seen.push(url as string)
  }

  const publicationDate = (record['date-released'] as unknown) instanceof Date
    ? formatLocalDate(record['date-released'] as unknown as Date)
    : record['date-released']
  const output: Record<string, unknown> = {
    ...(defined(record.title) ? {title: record.title} : {}),
    ...(Array.isArray(record.authors) && record.authors.length > 0
      ? {creators: record.authors.map(author => authorToZenodo(author)).filter(creator => creator !== undefined)}
      : {}),
    ...(defined(record.abstract) ? {description: record.abstract} : {}),
    ...(Array.isArray(record.keywords) && record.keywords.length > 0 ? {keywords: record.keywords} : {}),
    ...(defined(record.license) ? {license: {id: record.license}} : {}),
    ...(defined(publicationDate) ? {publication_date: publicationDate} : {}),
    ...(relatedIdentifiers.length > 0 ? {related_identifiers: relatedIdentifiers} : {}),
    ...(defined(record.version) ? {version: record.version} : {}),
    upload_type: record.type === 'dataset' ? 'dataset' : 'software'
  }
  return output
}

/** CFF keys consumed by the Zenodo conversion (everything else is reported as dropped). */
const ZENODO_CONSUMED_KEYS = new Set([
  'cff-version',
  'title',
  'authors',
  'abstract',
  'keywords',
  'license',
  'date-released',
  'identifiers',
  'doi',
  'repository',
  'repository-artifact',
  'repository-code',
  'url',
  'version',
  'type'
])

/** Normalizes a codemeta date (full ISO timestamps allowed) to a CFF YYYY-MM-DD date. */
function cffDate(value: unknown): string {
  if (value instanceof Date) return formatLocalDate(value)
  const text = String(value)
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  return match ? (match[1] ?? text) : text
}

/** Extracts a usable string from a license/affiliation object, preferring @id/id/url/name. */
function usableString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['@id', 'id', 'url', 'name']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return undefined
  }
  return undefined
}

/** Converts a CodeMeta document into a CFF document (latest released version by default). */
export function codemetaToCff(codemeta: object, options: ConvertOptions = {}): object {
  const record = codemeta as Record<string, unknown>
  const requested = options.cffVersion !== undefined ? normalizeVersion(options.cffVersion) : undefined
  if (requested !== undefined && !isVersionRegistered('cff', requested)) {
    const available = getVersions('cff')
      .map(info => info.version)
      .join(', ')
    throw new Error(`Unsupported CFF version ${requested} (available: ${available}).`)
  }
  const version = requested ?? getLatestVersion('cff')

  const consumed = new Set<string>(['@context', '@type', '@id'])
  const consume = (keys: string[]): void => {
    for (const key of keys) consumed.add(key)
  }

  /** Returns the first defined value among the synonym keys, marking them consumed. */
  const firstOf = (keys: string[]): unknown => {
    for (const key of keys) {
      const value = record[key]
      if (defined(value) && !(Array.isArray(value) && value.length === 0)) {
        consume(keys)
        return value
      }
    }
    consume(keys)
    return undefined
  }

  const title = firstOf(['name', 'title'])
  const description = firstOf(['description', 'abstract'])
  const cffVersion = firstOf(['softwareVersion', 'version'])
  const releaseDate = firstOf(['datePublished', 'dateModified'])
  const licenseRaw = firstOf(['license', 'licenseId'])
  const keywordsRaw = firstOf(['keywords', 'tags'])
  const repository = firstOf(['codeRepository'])
  const url = firstOf(['url'])
  // Identifier is only consumed when it maps to a DOI (see below).
  const identifierRaw = record['identifier']
  const doi = extractDoi(identifierRaw)
  if (doi !== undefined) {
    consume(['identifier'])
  }

  const authors = convertCodemetaAuthors(record)
  consume(['author', 'creator', 'agents', 'person'])

  const licenseString = usableString(licenseRaw)
  const license = licenseString !== undefined ? spdxFromLicense(licenseString) : undefined
  const keywords = normalizeKeywords(keywordsRaw)

  const output: Record<string, unknown> = {
    'cff-version': version,
    message: CFF_DEFAULT_MESSAGE,
    ...(defined(title) ? {title} : {}),
    ...(defined(description) ? {abstract: description} : {}),
    ...(authors.length > 0 ? {authors} : {}),
    ...(defined(cffVersion) ? {version: cffVersion} : {}),
    ...(defined(releaseDate) ? {'date-released': cffDate(releaseDate)} : {}),
    ...(defined(license) ? {license} : {}),
    ...(keywords !== undefined ? {keywords} : {}),
    ...(defined(repository) ? {'repository-code': repository} : {}),
    ...(defined(url) && url !== repository ? {url} : {})
  }
  if (doi !== undefined) {
    output.doi = doi
  }
  return output
}

const CFF_DEFAULT_MESSAGE = 'If you use this software, please cite it using the metadata from this file.'

/** Normalizes a keywords/tags value to a string array, if possible. */
function normalizeKeywords(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') return [value]
  return undefined
}

/**
 * Extracts a bare DOI from a CodeMeta identifier value.
 * Accepts https/http doi.org, dx.doi.org, doi: prefix, and bare 10.xxxx/... values.
 * Handles plain strings, arrays, and objects carrying the identifier in @id/id/url/value.
 */
export function extractDoi(value: unknown): string | undefined {
  if (typeof value === 'string') return doiFromIdentifier(value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      const doi = extractDoi(entry)
      if (doi !== undefined) return doi
    }
    return undefined
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['@id', 'id', 'url', 'value', 'name']) {
      const candidate = record[key]
      if (typeof candidate === 'string') {
        const doi = doiFromIdentifier(candidate)
        if (doi !== undefined) return doi
      }
    }
    return undefined
  }
  return undefined
}

/** Parses DOI strings: https/http (dx.)doi.org URLs, doi: prefix, and bare 10.xxxx/... values. */
export function doiFromIdentifier(identifier: string): string | undefined {
  const text = identifier.trim()
  if (text.length === 0) return undefined
  const urlMatch = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i.exec(text)
  if (urlMatch) {
    const doi = (urlMatch[1] ?? '').trim()
    return doi.length > 0 ? doi : undefined
  }
  const prefixMatch = /^doi:\s*(.+)$/i.exec(text)
  if (prefixMatch) {
    const doi = (prefixMatch[1] ?? '').trim()
    return doi.length > 0 ? doi : undefined
  }
  if (/^10\.\d{4,9}\/\S+/i.test(text)) return text
  return undefined
}

/** Reduces an SPDX URL (https://spdx.org/licenses/MIT) or SPDX id to a bare id. */
function spdxFromLicense(license: unknown): string | undefined {
  const text = usableString(license)
  if (text === undefined) return undefined
  const match = /licenses\/([A-Za-z0-9+.-]+)/.exec(text)
  return match ? (match[1] ?? text) : text
}

/** Collects author agents across CodeMeta synonyms, normalizing single objects to arrays. */
function collectAuthorAgents(record: Record<string, unknown>): unknown[] {
  const collected: unknown[] = []
  for (const key of ['author', 'creator', 'agents', 'person']) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      collected.push(...value)
    } else if (typeof value === 'object') {
      collected.push(value)
    } else if (typeof value === 'string' && value.length > 0) {
      collected.push({name: value})
    }
  }
  return collected
}

/** Converts codemeta author entries (Person/Organization/Role) into CFF authors. */
function convertCodemetaAuthors(record: Record<string, unknown>): CffAuthor[] {
  const agents = collectAuthorAgents(record)
  const result: CffAuthor[] = []
  for (const agent of agents) {
    if (agent === null || typeof agent !== 'object') continue
    const entry = agent as Record<string, unknown>
    if (entry.name !== undefined && entry['@type'] !== 'Person') {
      result.push({
        name: String(entry.name),
        ...(defined(entry.email) ? {email: String(entry.email)} : {})
      })
      continue
    }
    const affiliation = affiliationName(entry.affiliation)
    const orcid = typeof entry['@id'] === 'string' ? (entry['@id'] as string) : typeof entry['id'] === 'string' ? (entry['id'] as string) : undefined
    result.push({
      ...(defined(entry.givenName) ? {'given-names': String(entry.givenName)} : {}),
      ...(defined(entry.familyName) ? {'family-names': String(entry.familyName)} : {}),
      ...(affiliation !== undefined ? {affiliation} : {}),
      ...(orcid !== undefined ? {orcid} : {}),
      ...(defined(entry.email) ? {email: String(entry.email)} : {})
    })
  }
  return result
}

function affiliationName(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = affiliationName(entry)
      if (name !== undefined) return name
    }
    return undefined
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['@id', 'id', 'url', 'name']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return undefined
  }
  return undefined
}

/** CFF keys that the reverse conversion consumes. */
export const CFF_CONSUMED_CODEMETA_KEYS = new Set([
  '@context', '@type', '@id', 'name', 'title', 'description', 'abstract', 'author', 'creator', 'agents', 'person',
  'softwareVersion', 'version', 'datePublished', 'dateModified', 'license', 'licenseId', 'keywords', 'tags',
  'codeRepository', 'url', 'identifier'
])

/**
 * Converts a document to the given target and (optionally) lints the result.
 * The source must be a CFF document for codemeta/schemaorg/zenodo targets and
 * a CodeMeta document for the cff target.
 */
export function convertDocument(source: object, to: ConvertTarget, options: ConvertOptions = {}): ConvertOutcome {
  const issues: LintFinding[] = []
  const sourceIsCff = typeof (source as Record<string, unknown>)['cff-version'] === 'string'

  if (to === 'cff') {
    if (sourceIsCff) {
      throw new Error('Converting to cff requires a CodeMeta document, but the input is a CFF document.')
    }
    return convertCodemetaToCff(source, options, issues)
  }
  if (!sourceIsCff) {
    throw new Error(`Converting to ${to} requires a CFF document, but the input has no cff-version.`)
  }
  const record = source as CffDocument
  let document: object
  if (to === 'zenodo') {
    document = cffToZenodo(record)
    for (const key of Object.keys(record)) {
      if (!ZENODO_CONSUMED_KEYS.has(key)) {
        issues.push(finding('info', 'convert/unmapped', `The CFF key "${key}" has no Zenodo equivalent and was dropped.`, `/${key}`))
      }
    }
  } else {
    document = to === 'schemaorg' ? cffToSchemaOrg(record) : cffToCodemeta(record, options)
    for (const key of Object.keys(record)) {
      if (!CODEMETA_CONSUMED_KEYS.has(key)) {
        issues.push(finding('info', 'convert/unmapped', `The CFF key "${key}" has no ${to} equivalent and was dropped.`, `/${key}`))
      }
    }
  }
  const outcome: ConvertOutcome = {document, target: to, issues}
  if (to === 'codemeta') {
    const context = String((document as Record<string, unknown>)['@context'])
    outcome.version = versionFromContextUrl(context)
  }
  // Zenodo output has no bundled schema to lint against
  if (options.lint !== false && (to === 'codemeta' || to === 'schemaorg')) {
    outcome.result =
      to === 'codemeta'
        ? lintCodeMetaObject(document, {file: options.file})
        : lintSchemaOrgObject(document, {file: options.file})
  }
  return outcome
}

/** CFF keys consumed by the codemeta/schema.org conversions (everything else is reported as dropped). */
const CODEMETA_CONSUMED_KEYS = new Set([
  'cff-version',
  'title',
  'authors',
  'abstract',
  'keywords',
  'license',
  'license-url',
  'date-released',
  'identifiers',
  'doi',
  'repository',
  'repository-artifact',
  'repository-code',
  'url',
  'version',
  'type'
])

function convertCodemetaToCff(codemeta: object, options: ConvertOptions, issues: LintFinding[]): ConvertOutcome {
  const document = codemetaToCff(codemeta, options)
  const target: ConvertTarget = 'cff'
  const outcome: ConvertOutcome = {document, target, issues}

  // Report unmapped codemeta terms. `identifier` only counts as mapped when it
  // yields a DOI; otherwise it is left for unmapped reporting.
  const record = codemeta as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key === 'identifier') {
      if (extractDoi(record[key]) === undefined) {
        issues.push(finding('info', 'convert/unmapped', `The CodeMeta term "${key}" has no CFF equivalent and was dropped.`, `/${key}`))
      }
      continue
    }
    if (!CFF_CONSUMED_CODEMETA_KEYS.has(key)) {
      issues.push(finding('info', 'convert/unmapped', `The CodeMeta term "${key}" has no CFF equivalent and was dropped.`, `/${key}`))
    }
  }

  // Required CFF fields
  const cffRecord = document as Record<string, unknown>
  if (cffRecord.title === undefined) {
    issues.push(finding('error', 'convert/missing-required', 'The CodeMeta document has no name, but CFF requires a title.'))
  }
  if (cffRecord.authors === undefined) {
    issues.push(finding('error', 'convert/missing-required', 'The CodeMeta document has no author, but CFF requires authors.'))
  }

  if (options.lint !== false) {
    outcome.result = lintCffObject(document, {file: options.file})
    outcome.version = outcome.result.version
  }
  return outcome
}

/** Parses content (YAML or JSON) and converts it to the given target. */
export function convertContent(content: string, to: ConvertTarget, options: ConvertOptions = {}): ConvertOutcome {
  const parsed = parseDocument(content)
  if (parsed.document === undefined || parsed.document === null || typeof parsed.document !== 'object' || Array.isArray(parsed.document)) {
    throw new Error(parsed.error ?? 'Content could not be parsed into an object.')
  }
  let source = parsed.document as Record<string, unknown>
  // YAML dates surface as Date objects; normalize CFF inputs to YYYY-MM-DD
  // strings (local calendar) before conversion and output validation.
  if (typeof source['cff-version'] === 'string') {
    source = stringifyDates(source) as Record<string, unknown>
  }
  return convertDocument(source, to, options)
}
