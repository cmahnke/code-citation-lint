import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'
import type {Format, LintOptions, LintResult} from './types.js'
import {applyCrosscheck, classifyByName, sniffType, CODEMETA_FILE, CITATION_FILE} from './io.js'
import {addFinding, emptyResult, finding} from './findings.js'
import {lintObject, parseDocument} from './lint.js'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-browser',
  'coverage',
  'site',
  '.venv',
  'venv',
  '__pycache__'
])

export interface DiscoveredFile {
  path: string
  type?: Format
}

/** Finds metadata files in a directory; recursive mode skips common non-source dirs. */
export async function discover(
  dir: string,
  options: {recursive?: boolean} = {}
): Promise<DiscoveredFile[]> {
  const entries = await readdir(dir, {withFileTypes: true})
  const found: DiscoveredFile[] = []
  const recursive = options.recursive ?? false
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recursive && !IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        found.push(...(await discover(entryPath, options)))
      }
      continue
    }
    if (!entry.isFile()) continue
    const type = classifyByName(entry.name)
    if (type !== undefined) {
      found.push({path: entryPath, type})
    }
  }
  return found
}

interface ReadOutcome {
  result: LintResult
  document?: unknown
}

/** Reads a file, parses it, lints it and returns both result and document. */
async function readAndLint(filePath: string, options: LintOptions): Promise<ReadOutcome> {
  const fileName = path.basename(filePath)
  const byName = classifyByName(fileName)
  const content = await readFile(filePath, 'utf8')
  const parsed = parseDocument(content)
  if (parsed.document === undefined) {
    const result = emptyResult(byName ?? options.type ?? 'codemeta', filePath)
    addFinding(
      result,
      finding('error', 'lint/parse', parsed.error ?? 'Could not parse the document.')
    )
    return {result}
  }
  const type = options.type ?? byName ?? sniffType(parsed.document)
  const result = lintObject(parsed.document, {...options, type, file: filePath})
  return {result, document: parsed.document}
}

/** Lints a single file. */
export async function lintFile(filePath: string, options: LintOptions = {}): Promise<LintResult> {
  try {
    return (await readAndLint(filePath, options)).result
  } catch (error) {
    const result = emptyResult(options.type ?? 'codemeta', filePath)
    addFinding(
      result,
      finding('error', 'io/read', `Could not read ${filePath}: ${(error as Error).message}`)
    )
    return result
  }
}

/** Lints discovered files, running cross-file checks within each directory. */
export async function lintDiscovered(
  files: DiscoveredFile[],
  options: LintOptions = {}
): Promise<LintResult[]> {
  const results: LintResult[] = []
  const byDir = new Map<string, {codemeta?: ReadOutcome; cff?: ReadOutcome}>()
  for (const file of files) {
    const outcome = await readAndLint(file.path, options)
    results.push(outcome.result)
    const dir = path.dirname(file.path)
    const bucket = byDir.get(dir) ?? {}
    if (outcome.result.type === 'codemeta' && bucket.codemeta === undefined)
      bucket.codemeta = outcome
    if (outcome.result.type === 'cff' && bucket.cff === undefined) bucket.cff = outcome
    byDir.set(dir, bucket)
  }

  if (options.crosscheck !== false) {
    for (const bucket of byDir.values()) {
      const cm = bucket.codemeta
      const cf = bucket.cff
      if (cm?.document === undefined || cf?.document === undefined) continue
      applyCrosscheck(cm, cf, options.rules)
    }
  }
  for (const result of results) {
    result.valid = result.errors.length === 0
  }
  return results
}

/** Lints a directory: discovers metadata files and lints each one. */
export async function lintDirectory(dir: string, options: LintOptions = {}): Promise<LintResult[]> {
  const files = await discover(dir, {recursive: options.recursive === true})
  if (files.length === 0) {
    const result = emptyResult(options.type ?? 'codemeta', dir)
    addFinding(
      result,
      finding(
        'warning',
        'discovery/none-found',
        `No ${CODEMETA_FILE} or ${CITATION_FILE} found in ${dir}.`
      )
    )
    if (options.recursive !== true) {
      addFinding(
        result,
        finding(
          'info',
          'discovery/suggest-recursive',
          `No metadata files found directly in ${dir} — try again with -r to search subdirectories.`
        )
      )
    }
    result.valid = true
    return [result]
  }
  return lintDiscovered(files, options)
}

/** Lints any target: file, directory, or URL (incl. GitHub repositories). */
export async function lintTarget(target: string, options: LintOptions = {}): Promise<LintResult[]> {
  if (/^https?:\/\//i.test(target)) {
    const {lintUrl} = await import('./io.js')
    return lintUrl(target, options)
  }
  const info = await stat(target).catch(() => undefined)
  if (info === undefined) {
    const result = emptyResult(options.type ?? 'codemeta', target)
    addFinding(result, finding('error', 'io/not-found', `Path does not exist: ${target}.`))
    return [result]
  }
  if (info.isDirectory()) {
    return lintDirectory(target, options)
  }
  return [await lintFile(target, options)]
}
