import {describe, expect, it} from 'vitest'
import {scaffoldFromPackageJson, minimalScaffold, parseAuthor} from '../../src/scaffold.js'
import {lintCffContent} from '../../src/cff/lint.js'
import {lintCodeMetaObject} from '../../src/codemeta/lint.js'

describe('parseAuthor', () => {
  it('parses npm author strings and objects', () => {
    expect(parseAuthor('Christoph Mahnke <christoph@example.org> (https://example.org/~cm)')).toEqual({
      name: 'Christoph Mahnke',
      email: 'christoph@example.org',
      url: 'https://example.org/~cm'
    })
    expect(parseAuthor('Grace Hopper')).toEqual({name: 'Grace Hopper'})
    expect(parseAuthor({name: 'Org', email: 'e@x.org', url: 'https://x.org'})).toEqual({
      name: 'Org',
      email: 'e@x.org',
      url: 'https://x.org'
    })
    expect(parseAuthor(42)).toBeUndefined()
    expect(parseAuthor(undefined)).toBeUndefined()
  })
})

describe('scaffoldFromPackageJson', () => {
  const scaffold = scaffoldFromPackageJson({
    name: '@scope/demo-tool',
    description: 'A demo tool.',
    version: '1.2.3',
    license: 'MIT',
    keywords: ['demo'],
    author: 'Christoph Mahnke <christoph@example.org>',
    repository: {type: 'git', url: 'git+https://github.com/org/demo-tool.git'},
    homepage: 'https://example.org'
  })

  it('generates a valid CITATION.cff', () => {
    const result = lintCffContent(scaffold.cff)
    expect(result.valid).toBe(true)
    expect(result.version).toBe('1.2.0')
    expect(result.errors).toEqual([])
  })

  it('generates a valid codemeta.json', () => {
    const result = lintCodeMetaObject(scaffold.codemeta, {})
    expect(result.valid).toBe(true)
    expect(result.version).toBe('4.0')
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('carries over name, description, version, license, repository and keywords', () => {
    const document = scaffold.codemeta as Record<string, unknown>
    expect(document.name).toBe('@scope/demo-tool')
    expect(document.description).toBe('A demo tool.')
    expect(document.softwareVersion).toBe('1.2.3')
    expect(document.license).toBe('MIT')
    expect(document.codeRepository).toBe('https://github.com/org/demo-tool')
    expect(document.keywords).toEqual(['demo'])
    expect(document.url).toBe('https://example.org')
  })

  it('strips git+ and .git from repository urls and splits author names', () => {
    expect(scaffold.cff).toContain('given-names: Christoph')
    expect(scaffold.cff).toContain('family-names: Mahnke')
    expect(scaffold.cff).toContain('repository-code: https://github.com/org/demo-tool')
    expect(scaffold.cff).not.toContain('git+')
  })

  it('treats UNLICENSED as no license', () => {
    const result = scaffoldFromPackageJson({name: 'x', license: 'UNLICENSED'})
    expect(result.codemeta).not.toHaveProperty('license')
  })
})

describe('minimalScaffold', () => {
  it('generates lintable placeholder documents', () => {
    const scaffold = minimalScaffold()
    expect(lintCffContent(scaffold.cff).valid).toBe(true)
    expect(lintCodeMetaObject(scaffold.codemeta, {}).valid).toBe(true)
    expect(scaffold.codemeta).toHaveProperty('name', 'TODO: project title')
  })
})
