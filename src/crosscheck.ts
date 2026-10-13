import type {LintFinding} from './types.js'
import {finding} from './findings.js'

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

/** Extracts an SPDX identifier from an SPDX URL (".../licenses/MIT"). */
function normalizeLicense(value: unknown): string {
  const text = normalizeText(value)
  const match = /licenses\/([a-z0-9+.-]+)/.exec(text)
  return match ? (match[1] ?? text) : text
}

function repoUrl(value: unknown): string {
  return normalizeText(value)
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
}

interface Comparison {
  key: string
  mismatchRule: string
  severity: 'warning' | 'info'
}

const COMPARISONS: Comparison[] = [
  {key: 'name', mismatchRule: 'crosscheck/name-mismatch', severity: 'warning'},
  {key: 'version', mismatchRule: 'crosscheck/version-mismatch', severity: 'warning'},
  {key: 'license', mismatchRule: 'crosscheck/license-mismatch', severity: 'warning'},
  {key: 'repository', mismatchRule: 'crosscheck/repository-mismatch', severity: 'info'}
]

function valueOf(document: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = document[key]
    if (value === undefined || value === null || value === '') continue
    return normalizeText(value)
  }
  return undefined
}

/** Field synonyms across CodeMeta versions (CodeMeta 1.0 vs 2.0+ vocabularies). */
const CODEMETA_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'title'],
  version: ['softwareVersion', 'version'],
  license: ['license', 'licenseId'],
  repository: ['codeRepository']
}

const CFF_KEYS: Record<string, string> = {
  name: 'title',
  version: 'version',
  license: 'license',
  repository: 'repository-code'
}

/** Compares a codemeta.json and a CITATION.cff object for consistency. */
export function crossCheck(codemetaDoc: unknown, cffDoc: unknown): LintFinding[] {
  if (
    codemetaDoc === null ||
    cffDoc === null ||
    typeof codemetaDoc !== 'object' ||
    typeof cffDoc !== 'object'
  ) {
    return []
  }
  const cm = codemetaDoc as Record<string, unknown>
  const cf = cffDoc as Record<string, unknown>
  const findings: LintFinding[] = []

  for (const comparison of COMPARISONS) {
    let cmValue = valueOf(cm, CODEMETA_SYNONYMS[comparison.key] ?? [])
    let cfValue = valueOf(cf, [CFF_KEYS[comparison.key] ?? ''])
    if (cmValue === undefined || cfValue === undefined) {
      // Absence in one document is the individual lint rules' job (missing-*),
      // so only compare when both documents define the field.
      continue
    }
    if (comparison.key === 'license') {
      cmValue = normalizeLicense(cmValue)
      cfValue = normalizeLicense(cfValue)
    }
    if (comparison.key === 'repository') {
      cmValue = repoUrl(cmValue)
      cfValue = repoUrl(cfValue)
    }
    if (cmValue !== cfValue) {
      findings.push(
        finding(
          comparison.severity,
          comparison.mismatchRule,
          `The ${comparison.key} differs between codemeta.json ("${cmValue}") and CITATION.cff ("${cfValue}").`
        )
      )
    }
  }

  return findings
}
