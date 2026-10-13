# Browser demo page

The hosted demo at <https://cmahnke.github.io/code-citation-lint/> runs the same linting core in the browser.

## Features

- **Input methods**: paste text, drop/choose a file, or fetch by URL
  - GitHub repository URLs are expanded to `codemeta.json`/`CITATION.cff` on the default branch
  - `blob` URLs are rewritten to raw URLs
  - hosts without permissive CORS headers cannot be fetched from the browser
- **Auto-detection** of document type (CodeMeta, CFF, schema.org) and schema version, with manual override (the type dropdown offers all three formats; the version dropdown lists CodeMeta and CFF versions from the registries)
- **Results** show errors/warnings/infos with rule ids and document paths (single-document linting only — no cross-file consistency checks); a Strict checkbox flips the verdict on warnings (display-only)
- Example documents are bundled to try it quickly
- The README, the full documentation and the TypeDoc API reference are rendered on the same site (linked from the page footer)

## How it works

- `page/index.html`, `page/style.css`, `page/main.js` — plain static files, no framework
- `page/main.js` imports the library from `src/browser.ts` (the browser entry without Node.js filesystem dependencies)
- `npm run build:page` bundles everything (library, ajv, YAML parser, **all schemas**) into a single `dist-browser/demo.js`
- `npm run build:docs-site` renders `README.md` and `docs/*.md` to HTML (`scripts/build-site-docs.ts`, using `marked`) with a shared stylesheet and a docs index page; raw markdown files are included as well
- The Pages workflow (`pages.yml`) assembles `page/`, the browser bundle, the rendered docs (readme.html, docs/*.html, docs index) and the TypeDoc API reference (`docs/api/`) into `site/` and deploys it via `actions/upload-pages-artifact` + `actions/deploy-pages`

Because all schemas are bundled, the page also works offline once loaded.
