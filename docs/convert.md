# Converting CITATION.cff

The `convert` subcommand (and the library conversion API) converts CITATION.cff documents to **CodeMeta** (latest version by default), plain **schema.org**, or **Zenodo JSON** — and converts `codemeta.json` back to **CITATION.cff**. The field mapping follows the reference implementation [cffconvert](https://github.com/citation-file-format/cffconvert) (whose codemeta writer is its schema.org writer with a different `@context`), and the reverse conversion follows [caltechlibrary/codemeta2cff](https://github.com/caltechlibrary/codemeta2cff).

## CLI

```console
# codemeta (latest) to stdout
code-citation-lint convert CITATION.cff -

# schema.org JSON to stdout
code-citation-lint convert --to schemaorg CITATION.cff -

# zenodo JSON (the GitHub <-> Zenodo integration format)
code-citation-lint convert --to zenodo CITATION.cff -

# reverse: codemeta.json -> CITATION.cff
code-citation-lint convert --to cff codemeta.json -

# write next to the input (dir -> codemeta.json / schemaorg.json / .zenodo.json / CITATION.cff inside)
code-citation-lint convert CITATION.cff .
code-citation-lint convert --to codemeta,schemaorg CITATION.cff out/

# explicit output file (single target only)
code-citation-lint convert CITATION.cff output/codemeta.json

# target an older CodeMeta version / a specific CFF version
code-citation-lint convert --codemeta-version 3.0 CITATION.cff -
code-citation-lint convert --to cff --cff-version 1.2.0 codemeta.json -

# minified output
code-citation-lint convert --minify CITATION.cff -
```

Behavior:

- input types are autodetected: CFF inputs convert to `codemeta`/`schemaorg`/`zenodo`, CodeMeta (or schema.org) inputs convert to `cff`; mixing the `cff` target with other targets is an error
- the input must be a **valid document** — invalid input fails with exit 1 and prints the findings
- converted CodeMeta/schema.org documents are linted; their warnings/infos and all information-loss issues are printed to stderr
- the `zenodo` output has no bundled schema to lint against; its dropped keys are reported as issues
- requested but unregistered `--codemeta-version`/`--cff-version` values fail explicitly with exit 1 instead of silently falling back to latest
- requested but unregistered `--codemeta-version`/`--cff-version` values fail explicitly instead of silently falling back to latest
- `<output>` is `-` (stdout), an explicit file path (single target), or a directory (created when missing; per-target file names: `codemeta.json`, `schemaorg.json`, `.zenodo.json`, `CITATION.cff`)
- exit codes: `0` ok, `1` invalid input or converted output, `2` read/write errors or input/target mismatch

## Information-loss issues

Conversions report what they could not map as `issues` (library) / stderr lines (CLI):

- `convert/unmapped` (info): forward conversions report CFF keys without a target equivalent (`message`, `commit`, `contact`, `references`, `preferred-citation`); reverse conversion reports CodeMeta terms without a CFF equivalent (`funding`, `readme`, `issueTracker`, `continuousIntegration`, …). Note `license-url` is mapped for the codemeta/schema.org targets but reported as dropped for `zenodo`.
- `convert/missing-required` (error): reverse conversion emits these when the CodeMeta document has no `name` (CFF requires `title`) or no `author` (CFF requires `authors`); the CLI exits 1.
- The default CFF `message` is always synthesized silently (no issue).

## CFF → CodeMeta / schema.org mapping

| CITATION.cff | Output |
|---|---|
| `title` | `name` |
| `abstract` | `description` |
| `keywords` | `keywords` |
| `version` | `version` |
| `date-released` | `datePublished` |
| `license` | `license` as `https://spdx.org/licenses/{license}`; when `license` is absent, `license-url` is used as-is |
| `doi`, `identifiers[type=doi]` | `identifier` as `https://doi.org/…` (doi identifiers win over the top-level `doi`) |
| `type: dataset` | `@type: Dataset`; datasets lose `codeRepository` (as in cffconvert) |
| `repository-code` → `repository` → `repository-artifact` | `codeRepository` (first present wins) |
| `identifiers[type=url].value` → `url` → `repository` → `repository-code` → `repository-artifact` | `url` |
| person author | `{@type: Person, givenName, familyName, affiliation: {@type: Organization, name}, alternateName, email, @id: orcid}` — fields included as present |
| entity author (`name`) | `{@type: Organization, name, alternateName, email, @id: orcid}` |

Person `familyName` merges `name-particle`, `family-names` and `name-suffix` (as cffconvert's `_get_full_last_name`).

## CFF → Zenodo mapping (cffconvert parity)

| CITATION.cff | `.zenodo.json` |
|---|---|
| `title` | `title` |
| `abstract` | `description` |
| `keywords` | `keywords` |
| `version` | `version` |
| `date-released` | `publication_date` |
| `license` | `license: {id}` |
| `type` | `upload_type: software` or `dataset` |
| person author | `{name: "FullLastName, GivenNames", affiliation, orcid}` (bare ORCID id, `https://orcid.org/` stripped; given-only, family-only, alias-only, orcid-only or affiliation-only authors map to the fields they have) |
| entity author (`name`) | `{name, affiliation, orcid}` (`alias` is ignored when `name` is present) |
| `identifiers` (except `type: other`), then `doi` | `related_identifiers` with `scheme` and relation (identifiers in the known relation set or without a `relation` get `isSupplementedBy`; anything else gets its lowercased-first relation), deduplicated |
| `repository` → `repository-artifact` → `repository-code` → `url` | `related_identifiers` with `scheme: url` |

## CodeMeta → CFF mapping (reverse conversion)

| CodeMeta | CITATION.cff (1.2.0 by default) |
|---|---|
| `name` (or `title`) | `title` |
| `description` (or `abstract`) | `abstract` |
| `softwareVersion` (or `version`) | `version` |
| `datePublished` / `dateModified` | `date-released` (normalized to YYYY-MM-DD) |
| `license` (or `licenseId`) | bare SPDX id (SPDX URLs are reduced; usable object `@id`/`id`/`url`/`name` values are preserved, opaque objects are omitted) |
| `keywords` (or `tags`) | `keywords` |
| `codeRepository` | `repository-code` |
| `url` (only when different from `repository-code`) | `url` |
| `identifier` (DOI URL, `doi:` prefix, `dx.doi.org`, or bare `10.xxxx/...`) | `doi` (bare DOI; non-DOI identifiers stay unmapped) |
| `author` / `creator` / `agents` / `person` Person | `{given-names, family-names, email, affiliation (organization name), orcid (@id)}` |
| `author` Organization (has `name`) | `{name, email}` |
| `author` Role or other shapes | mapped by shape like the cases above (no special Role handling); unusable values are omitted |
| — | `cff-version`, `message` (default text, always synthesized silently) |

## Library

```js
import {cffToCodemeta, cffToSchemaOrg, cffToZenodo, codemetaToCff, convertContent, convertDocument} from '@projektemacher/code-citation-lint'

const document = cffToCodemeta(parsedCff, {codemetaVersion: '4.0'})
const schemaOrg = cffToSchemaOrg(parsedCff)
const zenodo = cffToZenodo(parsedCff)
const cff = codemetaToCff(parsedCodemeta, {cffVersion: '1.2.0'})

// With parsing, linting and issues:
const outcome = convertContent(cffYaml, 'codemeta', {codemetaVersion: '3.0'})
// outcome: {document, target, version?: '3.0', result?: LintResult, issues: LintFinding[]}
// (version is set for codemeta/cff targets, result only for codemeta/schema.org/cff targets)

// From an already-parsed object:
const {document: doc, issues} = convertDocument(parsedCff, 'zenodo')
```
