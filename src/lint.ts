import {parse as parseYaml} from 'yaml'
import type {LintOptions, LintResult} from './types.js'
import {detectTypeAndVersion} from './detect.js'
import {lintCffContent, lintCffObject} from './cff/lint.js'
import {lintCodeMetaObject} from './codemeta/lint.js'
import {lintSchemaOrgObject} from './schemaorg/lint.js'
import {addFinding, emptyResult, finalize, finding} from './findings.js'

/** Parses JSON first (fast path), falling back to YAML. */
export function parseDocument(content: string): {document?: unknown; error?: string} {
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {error: 'Empty document.'}
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return {document: JSON.parse(content)}
    } catch (error) {
      const jsonError = error as Error
      try {
        return {document: parseYaml(content)}
      } catch {
        return {error: `Invalid JSON: ${jsonError.message}`}
      }
    }
  }
  try {
    return {document: parseYaml(content)}
  } catch (error) {
    return {error: `Invalid YAML: ${(error as Error).message}`}
  }
}

/** Lints a parsed document, autodetecting type unless overridden. */
export function lintObject(document: unknown, options: LintOptions = {}): LintResult {
  let type = options.type
  let detected: ReturnType<typeof detectTypeAndVersion> | undefined
  if (type === undefined) {
    detected = detectTypeAndVersion(document)
    type = detected.type
  }
  if (type === 'cff') {
    return lintCffObject(document, options)
  }
  if (type === 'schemaorg') {
    return lintSchemaOrgObject(document, options)
  }
  if (type === 'codemeta') {
    return lintCodeMetaObject(document, options)
  }
  const result = emptyResult('codemeta', options.file)
  addFinding(
    result,
    finding(
      'error',
      'lint/undetected',
      detected?.detail ?? 'Could not detect the document type; specify --type.'
    )
  )
  return finalize(result, options)
}

/** Lints content (JSON or YAML text), autodetecting type unless overridden. */
export function lintContent(content: string, options: LintOptions = {}): LintResult {
  if (options.type === 'cff') {
    return lintCffContent(content, options)
  }
  const parsed = parseDocument(content)
  if (parsed.document === undefined) {
    const result = emptyResult(options.type ?? 'codemeta', options.file)
    addFinding(
      result,
      finding('error', 'lint/parse', parsed.error ?? 'Could not parse the document.')
    )
    return finalize(result, options)
  }
  if (options.type === 'codemeta') {
    return lintCodeMetaObject(parsed.document, options)
  }
  return lintObject(parsed.document, options)
}
