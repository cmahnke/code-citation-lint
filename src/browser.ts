/**
 * Browser entry point: exports the linting core and URL fetching without any
 * Node.js (filesystem) dependencies, so it can be bundled for the demo page.
 */

export {lintContent, lintObject, parseDocument} from './lint.js'
export {lintCffContent, lintCffObject} from './cff/lint.js'
export {lintCodeMetaContent, lintCodeMetaObject} from './codemeta/lint.js'
export {lintSchemaOrgContent, lintSchemaOrgObject} from './schemaorg/lint.js'
export {crossCheck} from './crosscheck.js'
export {CFF_VERSIONS, CODEMETA_VERSIONS, SCHEMAORG_VERSIONS, getVersions, getSchema, getLatestVersion, isVersionRegistered, codemetaContextUrl} from './registry.js'
export {detectTypeAndVersion, detectCodemetaVersion, detectSchemaOrg} from './detect.js'
export {cffToCodemeta, cffToSchemaOrg, cffToZenodo, codemetaToCff, convertContent, convertDocument} from './convert.js'
export type {ConvertOptions, ConvertOutcome, ConvertTarget} from './convert.js'
export {lintUrl, normalizeFileUrl, classifyByName, CODEMETA_FILE, CITATION_FILE} from './io.js'
export type {Format, LintFinding, LintOptions, LintResult, RuleConfig, Severity} from './types.js'
