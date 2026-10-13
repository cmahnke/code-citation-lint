import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {lintCodeMetaContent, lintCodeMetaObject} from '../../src/codemeta/lint.js'
import {CODEMETA_VERSIONS} from '../../src/registry.js'
import {versionFromContextUrl, isUnversionedContextUrl} from '../../src/detect.js'

const fixtures = path.resolve(import.meta.dirname, '../fixtures')

const CONTEXTS: {version: string; file: string}[] = CODEMETA_VERSIONS.map(info => ({version: info.version, file: `valid-${info.version}.json`}))

describe('CodeMeta schema validation (all versions)', () => {
  for (const {version, file} of CONTEXTS) {
    it(`accepts a valid CodeMeta ${version} document`, () => {
      const content = readFileSync(path.join(fixtures, `codemeta/${file}`), 'utf8')
      const result = lintCodeMetaContent(content)
      expect(result.version).toBe(version)
      expect(result.versionSource).toBe('detected')
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
      // A complete document should not produce warnings either
      expect(result.warnings).toEqual([])
    })
  }

  it('rejects terms that are not part of the detected version', () => {
    const content = readFileSync(path.join(fixtures, 'codemeta/invalid-schema.json'), 'utf8')
    const result = lintCodeMetaContent(content)
    expect(result.valid).toBe(false)
    expect(result.version).toBe('3.0')
    const messages = result.errors.map(error => error.message).join('\n')
    expect(messages).toContain('contIntegration')
    expect(messages).toContain('thisIsNotARealTerm')
  })

  it('accepts an array @context', () => {
    const content = readFileSync(path.join(fixtures, 'codemeta/array-context.json'), 'utf8')
    const result = lintCodeMetaContent(content)
    expect(result.version).toBe('3.0')
    expect(result.valid).toBe(true)
  })

  it('reports JSON parse failures', () => {
    const content = readFileSync(path.join(fixtures, 'codemeta/invalid-json.json'), 'utf8')
    const result = lintCodeMetaContent(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.rule === 'codemeta/parse')).toBe(true)
  })
})

describe('CodeMeta lint rules', () => {
  it('warns about missing recommended fields', () => {
    const content = readFileSync(path.join(fixtures, 'codemeta/warnings.json'), 'utf8')
    const result = lintCodeMetaContent(content)
    expect(result.valid).toBe(true)
    const rules = result.warnings.map(warning => warning.rule)
    expect(rules).toContain('codemeta/missing-description')
    expect(rules).toContain('codemeta/missing-license')
    expect(result.warnings.some(warning => warning.rule === 'codemeta/orcid-format')).toBe(true)
  })

  it('treats an unrecognized @context as a warning', () => {
    const result = lintCodeMetaObject({'@context': 'https://example.org/not-codemeta', name: 'x'}, {})
    expect(result.warnings.some(warning => warning.rule === 'codemeta/context-unrecognized')).toBe(true)
  })

  it('warns about unversioned contexts', () => {
    const result = lintCodeMetaObject({'@context': 'https://w3id.org/codemeta', name: 'x'}, {})
    expect(result.version).toBe('4.0')
    expect(result.warnings.some(warning => warning.rule === 'codemeta/context-unversioned')).toBe(true)
  })

  it('detects a codemeta-like document without @context', () => {
    const result = lintCodeMetaObject({name: 'x', description: 'y', author: []}, {})
    expect(result.type ?? 'codemeta').toBe('codemeta')
    expect(result.warnings.some(warning => warning.rule === 'codemeta/no-context')).toBe(true)
  })
})

describe('context URL detection', () => {
  it.each([
    ['https://w3id.org/codemeta/3.0', '3.0'],
    ['https://doi.org/10.5063/schema/codemeta-2.0', '2.0'],
    ['http://doi.org/10.5063/schema/codemeta-1.0', '1.0'],
    ['https://raw.githubusercontent.com/codemeta/codemeta/2.0-rc/codemeta.jsonld', '2.0-rc'],
    ['https://raw.githubusercontent.com/codemeta/codemeta/2.1/codemeta.jsonld', '2.1'],
    ['https://w3id.org/codemeta/4.0', '4.0'],
    ['https://w3id.org/codemeta/3.1', '3.1']
  ])('maps %s to %s', (url, expected) => {
    expect(versionFromContextUrl(url)).toBe(expected)
  })

  it.each([
    ['https://w3id.org/codemeta', true],
    ['https://raw.githubusercontent.com/codemeta/codemeta/master/codemeta.jsonld', true],
    ['https://w3id.org/codemeta/3.0', false]
  ])('unversioned check for %s', (url, expected) => {
    expect(isUnversionedContextUrl(url)).toBe(expected)
  })
})
