/**
 * Fetches upstream schemas and contexts, and writes them to `schemas/`.
 *
 * Sources:
 * - CFF 1.2.0: official JSON schema (citation-file-format.github.io)
 * - CFF 1.3.0: draft JSON schema vendored by cffconvert (unreleased upstream)
 * - CFF 1.0.3/1.1.0: pykwalify YAML schemas from cffconvert, converted to JSON Schema
 * - CodeMeta: JSON-LD contexts from the codemeta/codemeta repository tags
 *
 * A `sources.json` manifest records the origin and date of every file.
 */

import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pykwalifyToJsonSchema} from './lib/pykwalify-to-jsonschema.js'

const SCHEMA_DIR = path.resolve(import.meta.dirname, '../schemas')

interface Source {
  url: string
  target: string
  transform?: 'pykwalify'
  status?: 'released' | 'draft'
}

const SOURCES: Source[] = [
  {
    url: 'https://raw.githubusercontent.com/citation-file-format/cffconvert/main/src/cffconvert/schemas/1.0.3/schema.yaml',
    target: 'cff/1.0.3',
    transform: 'pykwalify',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/citation-file-format/cffconvert/main/src/cffconvert/schemas/1.1.0/schema.yaml',
    target: 'cff/1.1.0',
    transform: 'pykwalify',
    status: 'released'
  },
  {
    url: 'https://citation-file-format.github.io/1.2.0/schema.json',
    target: 'cff/1.2.0',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/citation-file-format/cffconvert/main/src/cffconvert/schemas/1.3.0/schema.json',
    target: 'cff/1.3.0-draft',
    status: 'draft'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/1.0/codemeta.jsonld',
    target: 'codemeta/1.0',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/2.0-rc/codemeta.jsonld',
    target: 'codemeta/2.0-rc',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/2.0/codemeta.jsonld',
    target: 'codemeta/2.0',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/2.1/codemeta.jsonld',
    target: 'codemeta/2.1',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/3.0/codemeta.jsonld',
    target: 'codemeta/3.0',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/3.1/codemeta.jsonld',
    target: 'codemeta/3.1',
    status: 'released'
  },
  {
    url: 'https://raw.githubusercontent.com/codemeta/codemeta/4.0/codemeta.jsonld',
    target: 'codemeta/4.0',
    status: 'released'
  }
]

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function main(): Promise<void> {
  const manifest: Record<string, unknown>[] = []
  for (const source of SOURCES) {
    const targetDir = path.join(SCHEMA_DIR, source.target)
    await mkdir(targetDir, {recursive: true})
    const raw = await fetchText(source.url)
    const isYaml = source.transform === 'pykwalify'
    const outFile = path.join(targetDir, isYaml ? 'schema.json' : path.basename(source.url))
    let content: string
    if (isYaml) {
      const converted = pykwalifyToJsonSchema(
        raw,
        `Citation File Format ${path.basename(source.target)} (converted from pykwalify)`
      )
      content = JSON.stringify(converted, null, 2) + '\n'
    } else if (outFile.endsWith('.json')) {
      content = JSON.stringify(JSON.parse(raw), null, 2) + '\n'
    } else {
      content = raw.endsWith('\n') ? raw : raw + '\n'
    }
    await writeFile(outFile, content, 'utf8')
    manifest.push({
      target: source.target,
      file: path.basename(outFile),
      url: source.url,
      status: source.status ?? 'released',
      fetched: new Date().toISOString().slice(0, 10)
    })
    console.log(`OK ${source.url} -> ${path.relative(SCHEMA_DIR, outFile)}`)
  }
  await writeFile(
    path.join(SCHEMA_DIR, 'sources.json'),
    JSON.stringify({fetched: new Date().toISOString().slice(0, 10), sources: manifest}, null, 2) + '\n',
    'utf8'
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
