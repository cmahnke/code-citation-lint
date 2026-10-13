import type {AjvError, LintFinding, LintResult, LintOptions, Format} from './types.js'
import {applyRuleConfig} from './registry.js'

export function emptyResult(type: Format, file?: string): LintResult {
  return {file, type, version: undefined, versionSource: 'unknown', valid: false, errors: [], warnings: [], infos: []}
}

export function addFinding(result: LintResult, finding: LintFinding): void {
  result[`${finding.severity}s`].push(finding)
}

/** Applies rule config (disable/severity overrides) and computes validity. */
export function finalize(result: LintResult, options: LintOptions): LintResult {
  if (options.rules) {
    const all = [...result.errors, ...result.warnings, ...result.infos]
      .map(item => applyRuleConfig(item, options.rules))
      .filter((item): item is LintFinding => item !== null)
    result.errors = all.filter(item => item.severity === 'error')
    result.warnings = all.filter(item => item.severity === 'warning')
    result.infos = all.filter(item => item.severity === 'info')
  }
  result.valid = result.errors.length === 0
  return result
}

/** Renders a short, human-readable description of an offending value. */
function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const snippet = value.length > 40 ? `${value.slice(0, 37)}…` : value
    return `"${snippet}"`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object') return 'an object'
  return String(value)
}

/** Resolves a value at an ajv instancePath (JSON pointer) within the document. */
function valueAtPointer(document: unknown, instancePath: string): unknown {
  if (instancePath.length === 0) return document
  let value: unknown = document
  for (const raw of instancePath.split('/').slice(1)) {
    if (value === null || typeof value !== 'object') return undefined
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

/**
 * Converts ajv error objects into schema findings, enriching messages where
 * possible: named property for additionalProperties/required, allowed values
 * for enums, and the offending value for primitive mismatches.
 */
export function ajvErrorsToFindings(errors: AjvError[], document?: unknown): LintFinding[] {
  return errors.map(error => {
    let message = error.message ?? 'Schema validation failed.'
    const params = error.params ?? {}
    let path = error.instancePath

    if (typeof params.additionalProperty === 'string') {
      path = `${path ?? ''}/${params.additionalProperty}`
      message = `"${params.additionalProperty}" ${message}`
    } else if (typeof params.missingProperty === 'string') {
      message = `Missing required property "${params.missingProperty}".`
    } else {
      const allowedValues = params.allowedValues ?? params.values
      if (Array.isArray(allowedValues)) {
        message = `must be one of: ${allowedValues.map(value => String(value)).join(', ')}`
      }
      // Name the offending value wherever it is a primitive; for enum/type/
      // pattern/format errors the parent (additionalProperties/required) is noise.
      const value = document !== undefined && path !== undefined ? valueAtPointer(document, path) : undefined
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        message += ` (got ${describeValue(value)})`
      }
    }
    return {
      severity: 'error' as const,
      rule: 'schema',
      message,
      ...(path ? {path} : {})
    }
  })
}

export function finding(severity: 'error' | 'warning' | 'info', rule: string, message: string, path?: string): LintFinding {
  return {severity, rule, message, ...(path ? {path} : {})}
}
