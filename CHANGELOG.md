# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-13

### Added

- CLI `list-rules` subcommand printing the full rule catalog (text or `-f json`), with the generated catalog documented in `docs/rules.md` (`npm run docs:rules`)
- ORCID check-digit validation: the `*/orcid-format` rules now also verify the ISO 7064 MOD 11-2 check digit of well-formed orcid.org URLs
- SPDX license list validation: `*/license-spdx` rules report well-formed but unknown license ids against a vendored SPDX id list (`schemas/spdx/ids.json`, fetched by `npm run schemas:fetch`)
- Library exports: `RULE_CATALOG`/`getRuleInfo`/`ruleIds`, `orcidProblem`/`ORCID_PATTERN`, `isSpdxId`/`allSpdxIds`/`spdxLicenseListVersion` (also from the `/browser` entry point)
- CLI tests for `--rules @file`, GitHub URL resolution (branch fallback, repository expansion, blob URL rewriting) and the new subcommands

### Fixed

- `code-citation-lint --version` (and `-V`) prints the package version instead of failing with exit 2 — the flag was documented but not implemented (`-v/--version` as schema version forcing on `lint`/`convert` is unchanged)
- Author metadata corrected: Christian Mahnke with ORCID `0009-0003-1361-4159` in package.json, codemeta.json, CITATION.cff, LICENSE and README

### Changed

- `npm run lint` now runs `prettier --check .` before eslint; the repository is prettier-formatted (existing code style pinned via `bracketSpacing: false`), with vendored/generated files and fixtures excluded via `.prettierignore`
- Removed the unused `normalizeCodeMetaVersion` alias from `src/codemeta/lint.ts` (it was never part of the public `index.ts` API)
- CLI contract: no targets without `--stdin` prints an error/usage to stderr and exits `2`; `--stdin` with positional targets is rejected with exit `2`; `--format` is validated case-insensitively (`text`/`json`, otherwise `InvalidArgumentError`)
- CLI `convert`: stdout carries only the serialized converted document(s); `# <target>` markers, `Wrote ...` messages, issues and failures go to stderr
- CLI `convert` output paths: existing directories and trailing-slash paths are directories; non-existing single-target paths stay explicit files; multi-target outputs require a directory or `-` (extensionless paths are created, file-like `*.json` typo paths exit `2` without creating directories)
- CLI `init`: `No package.json` and `Skipped existing file` messages go to stdout; errors stay on stderr; scaffolded `TODO` placeholders add `init/todo-placeholder` warnings to the self-check output
- CLI empty-directory discovery keeps the `discovery/none-found` warning with `valid: true` but exits `2`; non-recursive empty discovery adds a `discovery/suggest-recursive` info hint for `-r`
- CI workflows: `actions/setup-node` v7 with Node 24 and npm cache; CI matrix is now `[24]`

## [0.1.0] - 2026-10-13

### Added

- Library for linting and validating CodeMeta (`codemeta.json`) and Citation File Format (`CITATION.cff`) documents
- Support for all released CFF versions (1.0.3, 1.1.0, 1.2.0) plus the 1.3.0 draft, converted from the upstream pykwalify schemas where needed
- Support for all released CodeMeta versions (1.0, 2.0-rc, 2.0, 2.1, 3.0, 3.1, 4.0) with per-version JSON Schemas generated from the official JSON-LD contexts
- schema.org software profile linting (strict curated Thing/CreativeWork/SoftwareSourceCode/SoftwareApplication profile)
- Conversions from CITATION.cff to CodeMeta (latest), schema.org and Zenodo JSON (cffconvert parity), and from codemeta.json back to CITATION.cff, with information-loss issues
- `init` subcommand scaffolding CITATION.cff + codemeta.json from package.json (or minimal placeholder templates)
- CLI subcommands: `lint` (default), `convert <input> <output>`, `init [dir]` and `list-versions`
- Lint rules for recommended fields, ORCID/SPDX/date formats and cross-file consistency between codemeta.json and CITATION.cff
- Configurable rule severities and disables (`rules` option / `--rules`)
- Auto-detection of document type and schema version, with overrides
- CLI inputs: files, directories (auto-discovery, recursive), URLs and GitHub repositories; text and JSON output
- Browser bundle and hosted demo page
- Synthetic test fixtures and suites (vitest), including CLI integration tests
- GitHub Actions for CI, npm + GitHub Packages publishing and GitHub Pages deployment
- Project's own codemeta.json and CITATION.cff, validated by the test suite and CI
