# code-citation-lint

Linter, validator, scaffolder and converter for **CodeMeta** (`codemeta.json`), **Citation File Format** (`CITATION.cff`) and **schema.org** software metadata.

- Validates against **all released schema versions** of both formats (schemas bundled — works offline and in the browser)
- Lints **schema.org** software documents (`SoftwareSourceCode`, `SoftwareApplication`, `Dataset`) against a strict curated profile
- **Converts** CITATION.cff → CodeMeta (latest) / schema.org / Zenodo JSON, and codemeta.json → CITATION.cff — following the reference [cffconvert](https://github.com/citation-file-format/cffconvert) / [codemeta2cff](https://github.com/caltechlibrary/codemeta2cff) mappings, with information-loss issues
- **Scaffolds** metadata files from `package.json` (`init`)
- **Lint rules** beyond schema validation: recommended fields, ORCID/SPDX/date formats, cross-file consistency between `codemeta.json` and `CITATION.cff`
- Usable as a **library** (Node.js & browser), via a **CLI**, and in a hosted **web demo**
- Detects document type and schema version automatically, with manual overrides

| | |
|---|---|
| npm | `npm install @projektemacher/code-citation-lint` |
| CLI | `npx @projektemacher/code-citation-lint .` |
| Docs | <https://cmahnke.github.io/code-citation-lint/> |
| Demo | <https://cmahnke.github.io/code-citation-lint/> (page) |
| Issues | <https://github.com/cmahnke/code-citation-lint/issues> |

## Supported versions

| Format | Versions |
|---|---|
| CFF (CITATION.cff) | 1.0.3, 1.1.0, 1.2.0, 1.3.0 (draft) |
| CodeMeta (codemeta.json) | 1.0, 2.0-rc, 2.0, 2.1, 3.0, 3.1, 4.0 |
| schema.org (software profile) | latest (curated Thing/CreativeWork/SoftwareSourceCode/SoftwareApplication profile) |

See [docs/schemas.md](docs/schemas.md) for the schema sources and how they are generated.

## Library usage

```js
import {lintContent, lintTarget, getVersions} from '@projektemacher/code-citation-lint'

// Lint a string (JSON or YAML), type + version autodetected
const result = lintContent('cff-version: 1.2.0\nmessage: cite me\ntitle: Demo\nauthors:\n  - given-names: A\n    family-names: B\n')
console.log(result.valid, result.version, result.warnings)

// Lint a file, directory (auto-discovery) or URL
const results = await lintTarget('.', {recursive: true})
for (const r of results) {
  console.log(r.file, r.valid, r.errors, r.warnings)
}

// All supported versions
console.log(getVersions('cff'), getVersions('codemeta'))
```

See [docs/library.md](docs/library.md) for the full API.

## CLI usage

The CLI has subcommands; `lint` runs when no subcommand is given. `lint` requires targets unless `--stdin` is used (`--stdin` cannot be combined with targets; `--format`, `--type` and `--to` are `text`/`json` etc. case-insensitively).

```console
# lint the current directory (auto-discovers codemeta.json / CITATION.cff)
code-citation-lint lint .
# or equivalently, without the subcommand
code-citation-lint .

# specific files, recursive directories, URLs and GitHub repositories
code-citation-lint codemeta.json CITATION.cff
code-citation-lint -r projects/
code-citation-lint https://github.com/someone/repo

# convert a CITATION.cff to CodeMeta (latest), schema.org and Zenodo JSON
# (stdout carries only the converted document; status messages go to stderr)
code-citation-lint convert CITATION.cff -
code-citation-lint convert --to codemeta,schemaorg CITATION.cff out/
code-citation-lint convert --to zenodo CITATION.cff -

# reverse: codemeta.json -> CITATION.cff
code-citation-lint convert --to cff codemeta.json -

# scaffold metadata from package.json (informational messages on stdout;
# TODO placeholders add init/todo-placeholder warnings to the self-check)
code-citation-lint init .

# force the schema version, strict mode, JSON output
code-citation-lint lint -v 1.2.0 -s -f json CITATION.cff
```

Convert output paths: `-` is stdout; an existing directory or trailing-slash path is a directory; a non-existing single-target path is an explicit file; multiple targets need a directory or `-` (extensionless paths are created, file-like `*.json` typo paths exit `2`).

Exit codes: `0` clean (including `init` TODO warnings without errors), `1` findings (`--strict` also fails on warnings, conversions of invalid documents, unsupported conversion versions), `2` input/output errors (no lint targets, `--stdin` with targets, invalid `--format`/`--type`/`--to`/`--rules`, unknown options, missing arguments, input/target mismatches, empty-directory discovery, bad multi-target output, missing paths, fetch failures, read/write errors).
See [docs/cli.md](docs/cli.md) for all options and [docs/convert.md](docs/convert.md) for the conversion mapping.

## Rule configuration

Rule findings can be disabled or re-severitized via `--rules` (CLI) or the `rules` option (library):

```console
code-citation-lint --rules '{"disable": ["cff/missing-license"], "severities": {"codemeta": "info"}}' .
```

```js
lintContent(content, {rules: {disable: ['crosscheck/*'], severities: {'codemeta/missing-description': 'error'}}})
```

## Web demo

The [hosted demo](https://cmahnke.github.io/code-citation-lint/) runs the same library in the browser: paste a document, drop a file, or fetch by URL. See [docs/page.md](docs/page.md).

## Development

```console
npm install
npm run build        # library + CLI + IIFE browser bundle (tsup)
npm run build:page   # demo page bundle -> dist-browser/demo.js (esbuild)
npm run build:docs-site # render README + docs to HTML for the site
npm run test         # vitest (unit + CLI integration, synthetic fixtures)
npm run test:watch   # vitest in watch mode
npm run lint         # eslint
npm run format       # prettier --write .
npm run typecheck    # tsc --noEmit
npm run self-lint    # lints this repo's own codemeta.json + CITATION.cff
npm run docs         # TypeDoc API reference -> docs/api
npm run schemas:fetch    # re-fetch upstream schemas/contexts
npm run schemas:generate # regenerate CodeMeta JSON Schemas from contexts
```

This repository contains its own `codemeta.json` and `CITATION.cff`; both are validated by the test suite and CI on every commit.

### Deployment

- **npm + GitHub Packages**: publishing runs on GitHub releases (`publish.yml`); see the note about package scopes in the workflow
- **GitHub Pages**: the demo page, docs and TypeDoc API reference deploy on pushes to `main` (`pages.yml`)

## License

[MIT](LICENSE) © Christoph Mahnke
