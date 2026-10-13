import type {Format, LintFinding, RuleConfig, Severity} from './types.js'
import cff103 from '../schemas/cff/1.0.3/schema.json'
import cff110 from '../schemas/cff/1.1.0/schema.json'
import cff120 from '../schemas/cff/1.2.0/schema.json'
import cff130 from '../schemas/cff/1.3.0-draft/schema.json'
import codemeta10 from '../schemas/codemeta/1.0/schema.json'
import codemeta20rc from '../schemas/codemeta/2.0-rc/schema.json'
import codemeta20 from '../schemas/codemeta/2.0/schema.json'
import codemeta21 from '../schemas/codemeta/2.1/schema.json'
import codemeta30 from '../schemas/codemeta/3.0/schema.json'
import codemeta31 from '../schemas/codemeta/3.1/schema.json'
import codemeta40 from '../schemas/codemeta/4.0/schema.json'
import schemaorgSoftware from '../schemas/schemaorg/software.json'

export interface VersionInfo {
  version: string
  /** Draft versions are not officially released upstream yet. */
  status: 'released' | 'draft'
}

/** All supported CFF schema versions, oldest first. */
export const CFF_VERSIONS: VersionInfo[] = [
  {version: '1.0.3', status: 'released'},
  {version: '1.1.0', status: 'released'},
  {version: '1.2.0', status: 'released'},
  {version: '1.3.0', status: 'draft'}
]

/** All supported CodeMeta schema versions, oldest first. */
export const CODEMETA_VERSIONS: VersionInfo[] = [
  {version: '1.0', status: 'released'},
  {version: '2.0-rc', status: 'released'},
  {version: '2.0', status: 'released'},
  {version: '2.1', status: 'released'},
  {version: '3.0', status: 'released'},
  {version: '3.1', status: 'released'},
  {version: '4.0', status: 'released'}
]

/** The schema.org software profile: a single curated profile, no version axis. */
export const SCHEMAORG_VERSIONS: VersionInfo[] = [{version: 'latest', status: 'released'}]

/** Canonical CodeMeta context URL per version, used for conversions. */
const CODEMETA_CONTEXT_URLS: Record<string, string> = {
  '1.0': 'https://doi.org/10.5063/schema/codemeta-1.0',
  '2.0-rc': 'https://raw.githubusercontent.com/codemeta/codemeta/2.0-rc/codemeta.jsonld',
  '2.0': 'https://doi.org/10.5063/schema/codemeta-2.0',
  '2.1': 'https://raw.githubusercontent.com/codemeta/codemeta/2.1/codemeta.jsonld',
  '3.0': 'https://w3id.org/codemeta/3.0',
  '3.1': 'https://w3id.org/codemeta/3.1',
  '4.0': 'https://w3id.org/codemeta/4.0'
}

/** Returns the canonical context URL for a registered CodeMeta version. */
export function codemetaContextUrl(version: string): string {
  return CODEMETA_CONTEXT_URLS[version] ?? CODEMETA_CONTEXT_URLS['4.0']!
}

type SchemaRegistry = Record<Format, Record<string, object>>

const bundledSchemas: SchemaRegistry = {
  cff: {
    '1.0.3': cff103,
    '1.1.0': cff110,
    '1.2.0': cff120,
    '1.3.0': cff130
  },
  codemeta: {
    '1.0': codemeta10,
    '2.0-rc': codemeta20rc,
    '2.0': codemeta20,
    '2.1': codemeta21,
    '3.0': codemeta30,
    '3.1': codemeta31,
    '4.0': codemeta40
  },
  schemaorg: {
    latest: schemaorgSoftware
  }
}

const customSchemas: SchemaRegistry = {cff: {}, codemeta: {}, schemaorg: {}}

/** Returns all registered versions for a format (bundled + custom). */
export function getVersions(format: Format): VersionInfo[] {
  const bundled =
    format === 'cff' ? CFF_VERSIONS : format === 'codemeta' ? CODEMETA_VERSIONS : SCHEMAORG_VERSIONS
  const custom = Object.keys(customSchemas[format] ?? {})
    .filter((version) => !bundled.some((info) => info.version === version))
    .map((version) => ({version, status: 'draft' as const}))
  return [...bundled, ...custom]
}

/** Returns the JSON Schema for a format/version, if registered. */
export function getSchema(format: Format, version: string): object | undefined {
  return customSchemas[format]?.[version] ?? bundledSchemas[format]?.[version]
}

/** The latest registered (and released, if any) version for a format. */
export function getLatestVersion(format: Format): string {
  const versions = getVersions(format)
  const released = versions.filter((info) => info.status === 'released')
  return (released.at(-1) ?? versions.at(-1))?.version ?? ''
}

/**
 * Registers a custom schema for a format at runtime, e.g. for new upstream
 * drafts or in-house restrictions. Later registrations win.
 */
export function registerVersion(
  format: Format,
  version: string,
  schema: object,
  options?: {status?: 'released' | 'draft'}
): void {
  customSchemas[format]![version] = schema
  if (options?.status === 'released') {
    const registry =
      format === 'cff'
        ? CFF_VERSIONS
        : format === 'codemeta'
          ? CODEMETA_VERSIONS
          : SCHEMAORG_VERSIONS
    if (!registry.some((info) => info.version === version)) {
      registry.push({version, status: 'released'})
    }
  }
}

export function isVersionRegistered(format: Format, version: string): boolean {
  return getSchema(format, version) !== undefined
}

/** Normalizes a version string like `v1.2.0` or `1.2.0-rc1` to the registry key. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').toLowerCase()
}

/** Applies rule configuration to a finding: returns null when the finding is filtered out. */
export function applyRuleConfig(finding: LintFinding, rules?: RuleConfig): LintFinding | null {
  if (!rules) return finding
  const {rule} = finding
  const base = rule.split('/')[0] ?? rule
  // Resolution order: exact rule id, `base/*`, bare base name, `*`
  const lookup = (): Severity | 'off' | undefined =>
    rules.severities?.[rule] ??
    rules.severities?.[`${base}/*`] ??
    rules.severities?.[base] ??
    rules.severities?.['*']
  const explicitOff =
    rules.disable?.includes(rule) ||
    rules.disable?.includes(base) ||
    rules.disable?.includes(`${base}/*`)
  const severity = lookup()
  if (explicitOff || severity === 'off') return null
  if (severity) return {...finding, severity}
  return finding
}
