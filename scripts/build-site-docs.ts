/**
 * Builds the documentation part of the GitHub Pages site:
 *
 * - renders README.md and docs/*.md to HTML (marked), reusing page/style.css
 * - generates a docs index page including the TypeDoc API reference link
 * - copies the raw markdown files alongside the rendered pages
 *
 * Usage: npm run build:docs-site [-- --out <dir>]  (default output: site/)
 */

import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {marked} from 'marked'

const ROOT = path.resolve(import.meta.dirname, '..')
const outDir = path.resolve(ROOT, process.argv.includes('--out') ? (process.argv[process.argv.indexOf('--out') + 1] ?? 'site') : 'site')

interface DocPage {
  /** Path relative to the repository root. */
  source: string
  /** Output file name without extension. */
  slug: string
  title: string
}

const DOC_PAGES: DocPage[] = [
  {source: 'README.md', slug: 'readme', title: 'Readme'},
  {source: 'docs/library.md', slug: 'library', title: 'Library'},
  {source: 'docs/cli.md', slug: 'cli', title: 'CLI'},
  {source: 'docs/rules.md', slug: 'rules', title: 'Rule catalog'},
  {source: 'docs/convert.md', slug: 'convert', title: 'Converting CITATION.cff'},
  {source: 'docs/schemas.md', slug: 'schemas', title: 'Schemas and versions'},
  {source: 'docs/page.md', slug: 'page', title: 'Browser demo page'}
]

function renderTemplate(title: string, bodyHtml: string, inDocsDir: boolean): string {
  const prefix = inDocsDir ? '../' : ''
  const docsPrefix = inDocsDir ? '' : 'docs/'
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — code-citation-lint</title>
    <link rel="stylesheet" href="${prefix}style.css" />
  </head>
  <body>
    <header>
      <h1><a href="${prefix}index.html">code-citation-lint</a></h1>
      <nav>
        <a href="${prefix}readme.html">Readme</a> ·
        <a href="${docsPrefix}index.html">Docs</a> ·
        <a href="${docsPrefix}api/index.html">API reference</a> ·
        <a href="https://github.com/cmahnke/code-citation-lint">GitHub</a>
      </nav>
    </header>
    <main class="docs-content">
${bodyHtml}
    </main>
    <footer>
      <p><a href="https://github.com/cmahnke/code-citation-lint">code-citation-lint</a> — MIT licensed.</p>
    </footer>
  </body>
</html>
`
}

function stylePatch(): string {
  // Reuse the demo page styles and add the bits the docs pages need
  return `
nav {
  margin: 0.5rem 0 1.5rem;
  color: var(--muted);
}
nav a {
  color: var(--accent);
}
.docs-content h1,
.docs-content h2 {
  line-height: 1.3;
}
.docs-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05em 0.3em;
}
.docs-content pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
}
.docs-content pre code {
  border: none;
  background: none;
  padding: 0;
}
.docs-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
}
.docs-content th,
.docs-content td {
  border: 1px solid var(--border);
  padding: 0.35rem 0.6rem;
  text-align: left;
}
.docs-content blockquote {
  border-left: 3px solid var(--border);
  margin-left: 0;
  padding-left: 1rem;
  color: var(--muted);
}
`
}

async function main(): Promise<void> {
  const docsDir = path.join(outDir, 'docs')
  await mkdir(docsDir, {recursive: true})

  // Extend the demo page stylesheet with docs-specific rules
  const baseStyle = await readFile(path.join(ROOT, 'page/style.css'), 'utf8')
  await writeFile(path.join(outDir, 'style.css'), baseStyle + stylePatch(), 'utf8')
  await mkdir(outDir, {recursive: true})

  for (const page of DOC_PAGES) {
    const markdown = await readFile(path.join(ROOT, page.source), 'utf8')
    const body = String(await marked.parse(markdown, {async: true}))
    const inDocs = page.slug !== 'readme'
    const html = renderTemplate(page.title, body, inDocs)
    const target = inDocs ? path.join(docsDir, `${page.slug}.html`) : path.join(outDir, `${page.slug}.html`)
    await writeFile(target, html, 'utf8')
    const rawTarget = inDocs ? path.join(docsDir, path.basename(page.source)) : path.join(outDir, 'README.md')
    await writeFile(rawTarget, markdown, 'utf8')
    console.log(`OK ${page.source} -> ${path.relative(outDir, target)}`)
  }

  const items = DOC_PAGES.map(page => {
    const href = page.slug === 'readme' ? '../readme.html' : `${page.slug}.html`
    return `      <li><a href="${href}">${page.title}</a> <span class="hint">(${page.source})</span></li>`
  }).join('\n')
  const indexHtml = renderTemplate(
    'Documentation',
    `<h2>Documentation</h2>
    <ul>
${items}
      <li><a href="api/index.html">API reference</a> <span class="hint">(TypeDoc)</span></li>
    </ul>`,
    true
  )
  await writeFile(path.join(docsDir, 'index.html'), indexHtml, 'utf8')
  console.log(`OK docs index -> docs/index.html`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
