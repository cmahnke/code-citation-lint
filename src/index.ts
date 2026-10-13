/**
 * code-citation-lint: lint and validate CodeMeta (`codemeta.json`) and
 * Citation File Format (`CITATION.cff`) metadata documents.
 *
 * All released schema versions are bundled; see `docs/schemas.md` for details.
 */

// Core (works in Node and the browser)
export {lintContent, lintObject, parseDocument} from './lint.js'
export {lintCffContent, lintCffObject} from './cff/lint.js'
export {lintCodeMetaContent, lintCodeMetaObject} from './codemeta/lint.js'
export {lintSchemaOrgContent, lintSchemaOrgObject} from './schemaorg/lint.js'
export {crossCheck} from './crosscheck.js'
export {RULE_CATALOG, getRuleInfo, ruleIds} from './rules.js'
export type {RuleGroup, RuleInfo} from './rules.js'
export {orcidProblem, ORCID_PATTERN} from './orcid.js'
export {isSpdxId, allSpdxIds, spdxLicenseListVersion} from './spdx.js'
export {
  CFF_VERSIONS,
  CODEMETA_VERSIONS,
  SCHEMAORG_VERSIONS,
  getVersions,
  getSchema,
  getLatestVersion,
  registerVersion,
  isVersionRegistered,
  normalizeVersion,
  applyRuleConfig,
  codemetaContextUrl
} from './registry.js'
export type {VersionInfo} from './registry.js'
export {
  detectTypeAndVersion,
  detectCodemetaVersion,
  detectSchemaOrg,
  versionFromContextUrl,
  isUnversionedContextUrl,
  isSchemaOrgContextUrl
} from './detect.js'
export type {DetectionOutcome} from './detect.js'

// Conversions (CFF -> codemeta / schema.org / zenodo, codemeta -> CFF)
export {
  cffToCodemeta,
  cffToSchemaOrg,
  cffToZenodo,
  codemetaToCff,
  convertContent,
  convertDocument
} from './convert.js'
export type {ConvertOptions, ConvertOutcome, ConvertTarget} from './convert.js'

// Scaffolding (init)
export {scaffoldFromPackageJson, minimalScaffold} from './scaffold.js'
export type {ScaffoldResult, MinimalPackageJson} from './scaffold.js'
export type {
  Format,
  LintFinding,
  LintOptions,
  LintResult,
  RuleConfig,
  Severity,
  VersionSource
} from './types.js'

// I/O
export {
  lintUrl,
  normalizeFileUrl,
  classifyByName,
  CODEMETA_FILE,
  CITATION_FILE,
  parseGitHubRepo
} from './io.js'

// Node-only (filesystem)
export {discover, lintFile, lintDirectory, lintDiscovered, lintTarget} from './fs-io.js'
export type {DiscoveredFile} from './fs-io.js'
