# Rule catalog

All rule ids emitted by code-citation-lint, with their default severities.
Severities can be changed and rules disabled via `--rules` (CLI) or the
`rules` option (library) — see [cli.md](cli.md) and [library.md](library.md).

## CFF (CITATION.cff)

| Rule | Default | Description |
|---|---|---|
| `cff/parse` | error | CITATION.cff is not valid YAML or not a mapping. |
| `cff/no-version` | error | No `cff-version` specified. |
| `cff/unsupported-version` | error | The declared `cff-version` is not supported. |
| `cff/version-mismatch` | warning | The forced schema version differs from the declared `cff-version`. |
| `cff/unknown-key` | warning | Unknown key (lenient handling for CFF 1.0.x/1.1.0 schemas). |
| `cff/missing-license` | warning | No `license` specified; an SPDX identifier is recommended. |
| `cff/missing-repository-code` | info | No `repository-code` specified. |
| `cff/version-date-consistency` | info | Only one of `version` and `date-released` is set. |

## CodeMeta (codemeta.json)

| Rule | Default | Description |
|---|---|---|
| `codemeta/parse` | error | Invalid JSON or not an object. |
| `codemeta/unsupported-version` | error | The detected or forced CodeMeta version is not supported. |
| `codemeta/no-context` | warning | No `@context` declared. |
| `codemeta/context-unrecognized` | warning | The `@context` is not a recognized CodeMeta context URL. |
| `codemeta/context-unversioned` | warning | The `@context` URL does not pin a CodeMeta version. |
| `codemeta/version-guessed` | warning | The version was guessed from document terms; no recognizable `@context`. |
| `codemeta/no-type` | warning | No `@type` found. |
| `codemeta/missing-name` | warning | No `name` (CodeMeta 1.0: `title`) specified. |
| `codemeta/missing-description` | warning | No `description` specified. |
| `codemeta/missing-author` | warning | No `author` (CodeMeta 1.0: `creator`/`agents`/`person`) specified. |
| `codemeta/missing-license` | warning | No `license` (CodeMeta 1.0: `licenseId`) specified. |
| `codemeta/missing-repository` | info | No `codeRepository` specified. |
| `codemeta/missing-version` | info | No `softwareVersion` specified. |
| `codemeta/orcid-format` | warning | ORCID in an agent field does not match the URL pattern or fails the ISO 7064 MOD 11-2 check digit. |
| `codemeta/license-spdx` | info | License is not an SPDX identifier/URL, or the identifier is not in the bundled SPDX license list. |

## schema.org (software profile)

| Rule | Default | Description |
|---|---|---|
| `schemaorg/parse` | error | Invalid JSON or not an object. |
| `schemaorg/no-context` | warning | No `@context` declared. |
| `schemaorg/no-type` | warning | No `@type` found. |
| `schemaorg/missing-name` | warning | No `name` specified. |
| `schemaorg/missing-description` | warning | No `description` specified. |
| `schemaorg/missing-author` | warning | No `author` specified. |
| `schemaorg/orcid-format` | warning | ORCID in an agent field does not match the URL pattern or fails the ISO 7064 MOD 11-2 check digit. |
| `schemaorg/license-spdx` | info | License is not an SPDX identifier/URL, or the identifier is not in the bundled SPDX license list. |
| `schemaorg/version-ignored` | warning | A version was forced, but the schema.org profile has no version axis. |

## Cross-file consistency

| Rule | Default | Description |
|---|---|---|
| `crosscheck/name-mismatch` | warning | `name` differs between codemeta.json and CITATION.cff. |
| `crosscheck/version-mismatch` | warning | `version` differs between codemeta.json and CITATION.cff. |
| `crosscheck/license-mismatch` | warning | License differs between codemeta.json and CITATION.cff. |
| `crosscheck/repository-mismatch` | info | Repository URL differs between codemeta.json and CITATION.cff. |

## Directory discovery

| Rule | Default | Description |
|---|---|---|
| `discovery/none-found` | warning | No metadata files found in the target directory (CLI exits 2). |
| `discovery/suggest-recursive` | info | Non-recursive discovery found nothing; `-r` searches subdirectories. |

## Scaffolding (init)

| Rule | Default | Description |
|---|---|---|
| `init/todo-placeholder` | warning | Generated scaffold still contains TODO placeholders. |

## Conversion

| Rule | Default | Description |
|---|---|---|
| `convert/unmapped` | info | A source key could not be mapped to the conversion target and was dropped. |
| `convert/missing-required` | error | A required key (`name`/`author`) is missing for the CFF target. |

## Infrastructure

| Rule | Default | Description |
|---|---|---|
| `schema` | error | JSON Schema validation failure. |
| `lint/parse` | error | The document could not be parsed. |
| `lint/undetected` | error | The document type could not be detected. |
| `fetch/failed` | error | A URL target could not be fetched. |
| `io/read` | error | A file could not be read. |
| `io/not-found` | error | A target path does not exist. |

Total: 47 rule ids.
