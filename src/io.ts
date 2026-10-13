import type {Format, LintFinding, LintOptions, LintResult} from './types.js'
import {applyRuleConfig} from './registry.js'
import {crossCheck} from './crosscheck.js'
import {addFinding, emptyResult, finalize, finding} from './findings.js'
import {lintObject, parseDocument} from './lint.js'
import {detectCodemetaVersion, detectSchemaOrg} from './detect.js'

/** Well-known metadata file names. */
export const CODEMETA_FILE = 'codemeta.json'
export const CITATION_FILE = 'CITATION.cff'

/** Classifies a file by name; returns undefined for content sniffing. */
export function classifyByName(fileName: string): Format | undefined {
  const lower = fileName.toLowerCase()
  if (lower === CODEMETA_FILE || lower.endsWith('.codemeta.json')) return 'codemeta'
  if (lower === CITATION_FILE.toLowerCase() || lower.endsWith('.cff')) return 'cff'
  if (lower === 'schemaorg.json' || lower.endsWith('.schemaorg.json') || lower === 'schema.json') return 'schemaorg'
  return undefined
}

export function sniffType(document: unknown): Format | undefined {
  if (document !== null && typeof document === 'object') {
    const record = document as Record<string, unknown>
    if ('cff-version' in record) return 'cff'
    if ('@context' in record || 'name' in record) {
      // codemeta contexts win; plain schema.org contexts describe schema.org documents
      if (detectCodemetaVersion(record).version !== undefined) return 'codemeta'
      if (detectSchemaOrg(record) === 'schemaorg') return 'schemaorg'
      return 'codemeta'
    }
  }
  return undefined
}

/** Converts github blob URLs to raw URLs; other URLs are used as-is. */
export function normalizeFileUrl(url: string): string {
  return url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i, 'https://raw.githubusercontent.com/$1/$2/')
}

/** GitHub repository URL -> owner/repo parts, or undefined. */
export function parseGitHubRepo(url: string): {owner: string; repo: string; branch?: string} | undefined {
  const match = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\/tree\/([\w./-]+))?\/?$/i.exec(url)
  if (!match) return undefined
  return {owner: match[1] ?? '', repo: (match[2] ?? '').replace(/\.git$/, ''), branch: match[3]}
}

/** Resolves the default branch of a GitHub repo, with main/master fallbacks. */
export async function resolveBranches(repo: {owner: string; repo: string; branch?: string}): Promise<string[]> {
  if (repo.branch !== undefined) return [repo.branch]
  const fallbacks = ['main', 'master']
  try {
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`)
    if (response.ok) {
      const data = (await response.json()) as {default_branch?: string}
      if (typeof data.default_branch === 'string' && data.default_branch.length > 0) {
        return [data.default_branch, ...fallbacks.filter(candidate => candidate !== data.default_branch)]
      }
    }
  } catch {
    // Offline or rate limited: fall through to the fallbacks
  }
  return fallbacks
}

interface FetchedFile {
  url: string
  content: string
}

async function fetchText(url: string): Promise<FetchedFile> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return {url, content: await response.text()}
}

/** Fetches and lints a URL; GitHub repo URLs are expanded to their metadata files. */
export async function lintUrl(url: string, options: LintOptions = {}): Promise<LintResult[]> {
  const repo = parseGitHubRepo(url)
  let fetched: FetchedFile[] = []
  let lastError: string | undefined

  if (repo !== undefined) {
    for (const branch of await resolveBranches(repo)) {
      const base = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch}`
      const candidates = await Promise.allSettled([fetchText(`${base}/${CODEMETA_FILE}`), fetchText(`${base}/${CITATION_FILE}`)])
      fetched = candidates
        .map(candidate => (candidate.status === 'fulfilled' ? candidate.value : null))
        .filter((item): item is FetchedFile => item !== null)
      if (fetched.length > 0) break
      lastError = `no ${CODEMETA_FILE} or ${CITATION_FILE} on branch ${branch}`
    }
  } else {
    try {
      fetched = [await fetchText(normalizeFileUrl(url))]
    } catch (error) {
      lastError = (error as Error).message
    }
  }

  if (fetched.length === 0) {
    const result = emptyResult(options.type ?? 'codemeta', url)
    addFinding(result, finding('error', 'fetch/failed', `Could not fetch ${url}${lastError ? `: ${lastError}` : ''}.`))
    return [result]
  }

  const results: LintResult[] = []
  for (const file of fetched) {
    const parsed = parseDocument(file.content)
    if (parsed.document === undefined) {
      const result = emptyResult(options.type ?? 'codemeta', file.url)
      addFinding(result, finding('error', 'lint/parse', parsed.error ?? 'Could not parse the document.'))
      results.push(finalize(result, options))
      continue
    }
    const fileName = file.url.split('/').pop() ?? ''
    const type = options.type ?? classifyByName(fileName) ?? sniffType(parsed.document)
    results.push(lintObject(parsed.document, {...options, type, file: file.url}))
  }
  return results
}

/** Cross-checks a pair of already-linted documents, extending their findings in place. */
export function applyCrosscheck(
  codemeta: {result: LintResult; document?: unknown},
  cff: {result: LintResult; document?: unknown},
  rules?: LintOptions['rules']
): void {
  if (codemeta.document === undefined || cff.document === undefined) return
  const findings = crossCheck(codemeta.document, cff.document)
  const filtered =
    rules !== undefined
      ? findings
          .map(item => applyRuleConfig(item, rules))
          .filter((item): item is LintFinding => item !== null)
      : findings
  if (filtered.length > 0) {
    for (const entry of [codemeta, cff]) {
      entry.result.warnings.push(...filtered.filter(item => item.severity === 'warning'))
      entry.result.infos.push(...filtered.filter(item => item.severity === 'info'))
    }
  }
}
