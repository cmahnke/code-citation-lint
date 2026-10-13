# CLI usage

The CLI uses subcommands; when no subcommand is given, `lint` runs.

```console
code-citation-lint [lint] [options] [targets...]
code-citation-lint convert [options] <input> <output>
code-citation-lint init [dir] [--force]
code-citation-lint list-versions
```

## lint

```console
code-citation-lint lint [options] [targets...]
```

### Targets

| Target | Behavior |
|---|---|
| file | lints the file; type by name (`CITATION.cff`/`*.cff`, `codemeta.json`/`*.codemeta.json`, `schemaorg.json`/`*.schemaorg.json`/`schema.json`, case-insensitively) or content sniffing |
| directory | auto-discovers `codemeta.json`, `CITATION.cff` and `schemaorg.json` files in the directory; with `-r` recursively (skips `node_modules`, `.git`, `dist`, `dist-browser`, `coverage`, `site`, `.venv`, `venv`, `__pycache__` and dot-directories) |
| URL | fetches and lints the file |
| GitHub repository URL | fetches `codemeta.json` and `CITATION.cff` from the default branch (GitHub API, falls back to `main`/`master`) |

## Options

```
-t, --type <auto|codemeta|cff|schemaorg>  document type (default: auto)
-v, --version <version>          force a schema version instead of autodetection
-r, --recursive                  search directories recursively
-f, --format <text|json>         output format (default: text)
-s, --strict                     treat warnings as errors (exit code 1)
    --stdin                      read a document from stdin
    --rules <json|@file>         rule configuration (JSON or @path/to/file.json)
    --no-crosscheck              disable cross-file consistency checks
-q, --quiet                      no output, exit code only
-h, --help                       help
```

`lint` is the default subcommand: `code-citation-lint .` behaves like `code-citation-lint lint .`, including with leading options (`code-citation-lint -s .`).

Lint requires at least one target unless `--stdin` is used:

- with no targets and without `--stdin`, the CLI prints an error and usage to stderr and exits `2`
- `--stdin` cannot be combined with positional targets (exit `2`)
- `--format` accepts `text`/`json` case-insensitively; any other value is an `InvalidArgumentError` (exit `2`)

Linting a directory with no discoverable metadata keeps a `discovery/none-found` warning (the result stays `valid: true`) but the CLI exits `2`. Non-recursive empty discovery also adds an info hint (`discovery/suggest-recursive`) suggesting `-r`.

`lint` reports go to stdout in both `text` and `json` formats; only fatal argument errors use stderr.

### Examples

```console
# auto-discovery in the current directory
code-citation-lint .

# recursive monorepo lint, machine readable
code-citation-lint -r -f json .

# force a schema version
code-citation-lint -v 3.0 codemeta.json

# lint a schema.org document
code-citation-lint schemaorg.json

# lint a GitHub repository
code-citation-lint https://github.com/codemeta/codemeta

# custom rules
code-citation-lint --rules '{"disable": ["cff/missing-license"]}' CITATION.cff
```

## convert

Converts CITATION.cff to CodeMeta/schema.org/Zenodo, or codemeta.json to CITATION.cff — see [convert.md](convert.md) for the full mappings, issues and options.

```console
code-citation-lint convert [--to codemeta|schemaorg|zenodo|cff] [--codemeta-version <v>] [--cff-version <v>] <input> <output|->
```

Input types are autodetected: CFF inputs convert to codemeta/schema.org/zenodo, CodeMeta (or schema.org) inputs convert to cff. `--to` accepts a comma-separated list (e.g. `--to codemeta,schemaorg`), case-insensitively.

`convert` also accepts the shared `-t/--type`, `-v/--version`, `--rules` and `-q/--quiet` options, plus `--minify` (minified JSON output; ignored for the `cff`/YAML target).

Stdout carries only the serialized converted document(s) (JSON, or YAML for the `cff` target, preserving `--minify` formatting). Everything else goes to stderr: `# <target>` markers for multi-target stdout output, `Wrote <target> conversion to <file>` messages for file output, conversion issues/warnings, and failures. `--quiet` suppresses the markers, `Wrote` messages and findings (failures still go to stderr and set the exit code).

Output path rules:

- `-` means stdout.
- An existing directory or a path with a trailing slash is treated as a directory; converted files are written inside it as `codemeta.json` / `schemaorg.json` / `.zenodo.json` / `CITATION.cff`.
- A non-existing path with a single `--to` target is an explicit file (parent directories are created automatically).
- Multiple targets require a directory or `-`: a non-existing multi-target path without a file extension is created as a directory (e.g. `out/` or extensionless `out`); a non-existing multi-target path with a file extension (e.g. `out.json` without a trailing slash) exits `2` without creating surprising directories. The same applies when the output is an existing file.

## init

Scaffolds metadata files for a project:

```console
code-citation-lint init [dir] [--force]
```

- reads `package.json` in `dir` (default: current directory) and generates `CITATION.cff` + `codemeta.json` from it (name, description, version, license, repository, author/contributors, keywords, homepage)
- without a `package.json`, minimal placeholder templates with `TODO` markers are generated (informational message on stdout)
- existing files are skipped unless `--force` is given (informational `Skipped ...` message on stdout; read/write errors stay on stderr)
- the generated files are linted immediately and the findings are printed (self-check); when the scaffolded content still contains `TODO` placeholders, `init/todo-placeholder` warnings are added to the self-check output

## list-versions

Prints all supported schema versions (CFF, CodeMeta and the schema.org profile).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | no findings (or only info findings; `init` TODO self-check warnings also exit `0` when there are no errors) |
| 1 | error findings, warnings under `--strict`, conversion of an invalid document, or an unregistered `--codemeta-version`/`--cff-version` |
| 2 | input/output errors (missing paths, fetch failures, input/target mismatches, lint with no targets, `--stdin` with positional targets, invalid `--format`/`--type`/`--to`/`--rules`, unknown options, missing arguments, empty-directory `discovery/none-found`, multi-target output that is not a directory or `-`) |

## JSON output

`--format json` emits an array of `LintResult` objects (same shape as the library API), one per document:

```json
[
  {
    "file": "CITATION.cff",
    "type": "cff",
    "version": "1.2.0",
    "versionSource": "detected",
    "valid": true,
    "errors": [],
    "warnings": [],
    "infos": [{"severity": "info", "rule": "cff/missing-repository-code", "message": "…"}]
  }
]
```
