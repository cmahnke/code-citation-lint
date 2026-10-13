import {describe, expect, it} from 'vitest'
import {lintContent, lintObject, parseDocument} from '../../src/lint.js'
import {detectTypeAndVersion} from '../../src/detect.js'

const codemeta = JSON.stringify({
  '@context': 'https://w3id.org/codemeta/3.0',
  '@type': 'SoftwareSourceCode',
  name: 'x',
  description: 'y',
  author: [{givenName: 'A'}],
  license: 'MIT'
})

const cff = [
  'cff-version: 1.2.0',
  'message: m',
  'title: t',
  'authors:',
  '  - given-names: A',
  '    family-names: B',
  'license: MIT'
].join('\n')

describe('type autodetection', () => {
  it('detects codemeta from @context', () => {
    const outcome = detectTypeAndVersion(JSON.parse(codemeta))
    expect(outcome.type).toBe('codemeta')
    expect(outcome.version).toBe('3.0')
    expect(outcome.versionSource).toBe('detected')
  })

  it('detects cff from cff-version', () => {
    const outcome = detectTypeAndVersion({['cff-version']: '1.2.0'})
    expect(outcome.type).toBe('cff')
    expect(outcome.version).toBe('1.2.0')
  })

  it('routes parsed content through lintContent', () => {
    const cmResult = lintContent(codemeta)
    expect(cmResult.type).toBe('codemeta')
    expect(cmResult.valid).toBe(true)
    const cffResult = lintContent(cff)
    expect(cffResult.type).toBe('cff')
    expect(cffResult.valid).toBe(true)
  })

  it('falls back to sniffing when @context is missing', () => {
    const result = lintObject({name: 'x', description: 'y'}, {})
    expect(result.versionSource).toBe('unknown')
    expect(result.errors.some(error => error.rule === 'lint/undetected')).toBe(false)
  })

  it('reports undetectable documents', () => {
    const result = lintObject({foo: 'bar'}, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.rule === 'lint/undetected')).toBe(true)
  })
})

describe('parseDocument', () => {
  it('parses JSON and YAML', () => {
    expect((parseDocument('{"a": 1}').document as {a: number}).a).toBe(1)
    expect((parseDocument('a: 1')?.document as {a: number}).a).toBe(1)
    expect(parseDocument('').error).toContain('Empty')
    expect(parseDocument('{invalid').error).toContain('Invalid')
  })
})

describe('rule configuration', () => {
  it('supports disabling rules with wildcards', () => {
    const result = lintContent(cff, {rules: {disable: ['cff/*']}})
    expect(result.warnings).toEqual([])
    expect(result.infos).toEqual([])
  })

  it('supports severity overrides via wildcard', () => {
    const result = lintContent(cff, {rules: {severities: {cff: 'info'}}})
    expect(result.warnings).toEqual([])
    expect(result.infos.length).toBeGreaterThan(0)
  })
})
