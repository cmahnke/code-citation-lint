import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {lintSchemaOrgContent, lintSchemaOrgObject} from '../../src/schemaorg/lint.js'
import {lintContent} from '../../src/lint.js'
import {detectTypeAndVersion, isSchemaOrgContextUrl} from '../../src/detect.js'
import {getVersions, getSchema} from '../../src/registry.js'

const fixtures = path.resolve(import.meta.dirname, '../fixtures')

describe('schema.org lint', () => {
  it('accepts a valid schema.org software document', () => {
    const content = readFileSync(path.join(fixtures, 'schemaorg/valid.json'), 'utf8')
    const result = lintSchemaOrgContent(content)
    expect(result.type).toBe('schemaorg')
    expect(result.version).toBe('latest')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('accepts versioned schema.org contexts', () => {
    const content = readFileSync(path.join(fixtures, 'schemaorg/context-version.json'), 'utf8')
    const result = lintSchemaOrgContent(content)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects unknown terms and malformed dates in the strict profile', () => {
    const content = readFileSync(path.join(fixtures, 'schemaorg/invalid.json'), 'utf8')
    const result = lintSchemaOrgContent(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.message.includes('thisIsNotASchemaOrgTerm'))).toBe(true)
    expect(result.errors.some(error => error.path === '/datePublished')).toBe(true)
  })

  it('names the offending value and expected values in schema errors', () => {
    const result = lintSchemaOrgObject(
      {'@context': 'https://schema.org', '@type': 'NotACodeType', datePublished: 42},
      {}
    )
    const typeError = result.errors.find(error => error.path === '/@type')
    expect(typeError?.message).toContain('must be one of:')
    expect(typeError?.message).toContain('SoftwareSourceCode')
    expect(typeError?.message).toContain('(got "NotACodeType")')
    const dateError = result.errors.find(error => error.path === '/datePublished')
    expect(dateError?.message).toContain('(got 42)')
  })

  it('warns about missing recommended fields', () => {
    const content = readFileSync(path.join(fixtures, 'schemaorg/warnings.json'), 'utf8')
    const result = lintSchemaOrgContent(content)
    expect(result.valid).toBe(true)
    const rules = result.warnings.map(warning => warning.rule)
    expect(rules).toContain('schemaorg/missing-description')
    expect(rules).toContain('schemaorg/missing-author')
  })

  it('detects schema.org documents via lintContent routing', () => {
    const content = readFileSync(path.join(fixtures, 'schemaorg/valid.json'), 'utf8')
    const result = lintContent(content)
    expect(result.type).toBe('schemaorg')
    expect(result.valid).toBe(true)
  })

  it('prefers codemeta contexts over schema.org ones', () => {
    const outcome = detectTypeAndVersion({
      '@context': ['https://w3id.org/codemeta/3.0', 'http://schema.org/'],
      '@type': 'SoftwareSourceCode'
    })
    expect(outcome.type).toBe('codemeta')
    expect(outcome.version).toBe('3.0')
  })

  it('detects plain schema.org code documents', () => {
    const outcome = detectTypeAndVersion({'@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'x'})
    expect(outcome.type).toBe('schemaorg')
    expect(outcome.version).toBe('latest')
    expect(outcome.versionSource).toBe('detected')
  })

  it('routes non-code schema.org documents to the profile and flags the @type', () => {
    const result = lintContent(JSON.stringify({'@context': 'https://schema.org', '@type': 'Person', name: 'x'}))
    expect(result.type).toBe('schemaorg')
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.path === '/@type')).toBe(true)
  })

  it('exposes a single profile in the registry', () => {
    expect(getVersions('schemaorg').map(info => info.version)).toEqual(['latest'])
    expect(getSchema('schemaorg', 'latest')).toBeDefined()
  })

  it('warns when a version is forced on the version-less profile', () => {
    const result = lintSchemaOrgObject({'@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: 'x'}, {version: '1.0'})
    expect(result.version).toBe('latest')
    expect(result.warnings.some(warning => warning.rule === 'schemaorg/version-ignored')).toBe(true)
  })
})

describe('schema.org context URL detection', () => {
  it.each([
    ['https://schema.org', true],
    ['http://schema.org', true],
    ['https://schema.org/version/15.0/', true],
    ['https://w3id.org/codemeta/3.0', false],
    ['https://example.org/schema.org', false]
  ])('isSchemaOrgContextUrl(%s) = %s', (url, expected) => {
    expect(isSchemaOrgContextUrl(url)).toBe(expected)
  })
})
