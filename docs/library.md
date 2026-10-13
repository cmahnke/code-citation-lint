# Library usage

The package is ESM-only. Import the main entry in Node.js or bundlers, the `/browser` subpath for browser-safe code (no Node.js filesystem dependencies), or use the IIFE bundle (`dist/browser.browser.js`, global `CodeCitationLint`) as a plain script tag.

For browser/bundler use, import the Node-free entry point:

```js
import {lintContent} from '@projektemacher/code-citation-lint/browser'
```

The published IIFE browser bundle remains available as `dist/browser.browser.js` with the global `CodeCitationLint`.

```console
npm install @projektemacher/code-citation-lint
```

## Core functions

All content-level functions are synchronous and dependency-light (schemas are bundled).

### `lintContent(content, options?)`

Lints a JSON or YAML string; type and version are autodetected unless overridden.

```js
import {lintContent} from '@projektemacher/code-citation-lint'

const result = lintContent(yamlOrJsonString, {
  type: 'codemeta',      // 'codemeta' | 'cff' | 'schemaorg' | undefined (autodetect)
  version: '3.0',        // force a schema version (autodetect when omitted; normalized, e.g. 'v3.0' works)
  rules: {disable: ['codemeta/missing-repository']},
  file: 'codemeta.json'  // attached to the result
})
```

### `lintObject(document, options?)`

Same as `lintContent` for an already-parsed object.

### `lintCffContent(content, options?)` / `lintCffObject(document, options?)`

CFF-only linting (YAML string or parsed object).

### `lintCodeMetaContent(content, options?)` / `lintCodeMetaObject(document, options?)`

CodeMeta-only linting (JSON string or parsed object).

### `lintSchemaOrgContent(content, options?)` / `lintSchemaOrgObject(document, options?)`

schema.org software profile linting (JSON string or parsed object). Single curated profile (`version: 'latest'`); unknown terms are rejected.

### `crossCheck(codemetaDoc, cffDoc)`

Compares two parsed documents for consistency (name/title, version, license, repository). Returns findings without a `LintResult` (`name`/`version`/`license` mismatches are warnings, `repository` mismatches are info; missing fields are skipped).

## Conversions

```js
import {cffToCodemeta, cffToSchemaOrg, cffToZenodo, codemetaToCff, convertDocument, convertContent} from '@projektemacher/code-citation-lint'

cffToCodemeta(cffObject, {codemetaVersion: '4.0'}) // @context: https://w3id.org/codemeta/4.0
cffToSchemaOrg(cffObject)                          // @context: https://schema.org
cffToZenodo(cffObject)                             // .zenodo.json content (cffconvert parity)
codemetaToCff(codemetaObject, {cffVersion: '1.2.0'}) // reverse conversion

// With parsing and linting (default: lint enabled):
const outcome = convertContent(cffYaml, 'codemeta')
// outcome: {document, target, version, result: LintResult, issues: LintFinding[]}
```

The mappings follow the reference implementations (cffconvert, codemeta2cff); the full tables are in [convert.md](convert.md). Converted documents are linted (codemeta/schema.org/cff targets) and the CLI fails if the converted document has errors; `issues` reports information loss (dropped keys, synthesized fields) with rule `convert/unmapped` / `convert/missing-required`.

## Scaffolding

```js
import {scaffoldFromPackageJson, minimalScaffold} from '@projektemacher/code-citation-lint'

const {cff, codemeta} = scaffoldFromPackageJson(packageJson) // cff is a YAML string
// or, without any input:
const minimal = minimalScaffold() // placeholder templates with TODO markers
```

### Result shape

```ts
interface LintResult {
  file?: string            // file name/source, when known
  type: 'codemeta' | 'cff' | 'schemaorg'
  version?: string         // schema version used
  versionSource: 'detected' | 'specified' | 'unknown'
  valid: boolean           // no error-level findings
  errors: LintFinding[]    // schema violations etc.
  warnings: LintFinding[]  // recommended fields, formats, crosschecks
  infos: LintFinding[]     // suggestions
}

interface LintFinding {
  severity: 'error' | 'warning' | 'info'
  rule: string             // 'schema', 'cff/missing-license', 'crosscheck/name-mismatch', …
  message: string
  path?: string            // JSON-pointer-ish location in the document
}
```

## I/O helpers

### `lintTarget(target, options?)` — Node.js

Lints a file, directory (auto-discovery for `codemeta.json`/`CITATION.cff`) or URL (including GitHub repository URLs, which expand to their metadata files). Returns `Promise<LintResult[]>`. Directories get cross-file consistency checks when both documents are found in the same directory.

### `lintFile(path, options?)`, `lintDirectory(dir, options?)`, `discover(dir, {recursive})`, `lintDiscovered(files, options?)` — Node.js

Lower-level filesystem helpers. `options` supports `recursive` and `crosscheck: false` besides the core `type`/`version`/`rules`/`file`. Recursive discovery skips `node_modules`, `.git`, `dist`, `dist-browser`, `coverage`, `site`, `.venv`, `venv`, `__pycache__` and dot-directories. Also exported: `classifyByName`, `normalizeFileUrl`, `parseGitHubRepo`, `CODEMETA_FILE`, `CITATION_FILE`, and the `DiscoveredFile` type.

### `lintUrl(url, options?)` — Node.js & browser

Fetches and lints a URL. GitHub `blob` URLs are rewritten to raw URLs; repository URLs (including `/tree/<branch>` forms) resolve the `default_branch` via the GitHub API first, falling back to `main`, then `master`.

## Version registry

```js
import {CFF_VERSIONS, CODEMETA_VERSIONS, SCHEMAORG_VERSIONS, getVersions, getSchema, getLatestVersion, registerVersion, isVersionRegistered, normalizeVersion, applyRuleConfig, codemetaContextUrl} from '@projektemacher/code-citation-lint'

getVersions('cff')          // [{version: '1.0.3', status: 'released'}, …]
getSchema('codemeta', '3.0') // the bundled/generated JSON Schema object
getLatestVersion('codemeta') // '4.0'

// Register a custom schema at runtime (e.g. an upstream draft or house rules)
registerVersion('codemeta', '5.0-draft', schemaObject, {status: 'draft'})
```

Detection helpers (`detectTypeAndVersion`, `detectCodemetaVersion`, `detectSchemaOrg`, `versionFromContextUrl`, `isUnversionedContextUrl`, `isSchemaOrgContextUrl`), conversion functions and their option/result types (`ConvertTarget`, `ConvertOptions`, `ConvertOutcome`), scaffolding (`scaffoldFromPackageJson`, `minimalScaffold`, `ScaffoldResult`, `MinimalPackageJson`) and the core types (`Format`, `LintOptions`, `VersionSource`, `Severity`, `VersionInfo`, `DetectionOutcome`) are exported as well — see the [API reference](api/index.html) for the complete list. Note the `/browser` entry point exports a subset (no filesystem helpers, no `registerVersion`, no scaffolding).

## Rule configuration

```ts
interface RuleConfig {
  disable?: string[]                                // rule ids or prefixes ('crosscheck/*')
  severities?: Record<string, Severity | 'off'>     // exact id, 'base/*', 'base' or '*'
}
```

Resolution order: exact rule id → `base/*` → bare base (`cff`) → `*`.
