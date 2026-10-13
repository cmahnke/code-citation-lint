import {describe, expect, it} from 'vitest'
import {ORCID_PATTERN, orcidProblem} from '../../src/orcid.js'
import {lintCodeMetaContent} from '../../src/codemeta/lint.js'
import {lintSchemaOrgContent} from '../../src/schemaorg/lint.js'

describe('orcid helpers', () => {
  it('accepts well-formed ORCIDs with valid check digits', () => {
    expect(orcidProblem('https://orcid.org/0000-0002-1825-0097')).toBeUndefined()
    expect(orcidProblem('https://orcid.org/0009-0003-1361-4159')).toBeUndefined()
    expect(orcidProblem('http://orcid.org/0000-0002-9079-593X')).toBeUndefined()
  })

  it('rejects malformed ORCID URLs', () => {
    expect(orcidProblem('https://orcid.org/0000-0002')).toBe('format')
    expect(orcidProblem('https://orcid.org/0000-0002-1825-00977')).toBe('format')
    expect(orcidProblem('https://orcid.org/xxxx-0002-1825-0097')).toBe('format')
  })

  it('detects wrong check digits, including the all-zeros placeholder', () => {
    expect(orcidProblem('https://orcid.org/0000-0002-1825-0098')).toBe('check-digit')
    expect(orcidProblem('https://orcid.org/0000-0000-0000-0000')).toBe('check-digit')
  })

  it('leaves non-ORCID identifiers alone', () => {
    expect(orcidProblem('https://github.com/someone')).toBeUndefined()
    expect(orcidProblem('https://example.org/0000-0002-1825-0097')).toBeUndefined()
    expect(orcidProblem('0000-0002-1825-0097')).toBeUndefined()
  })

  it('keeps the canonical URL pattern exported', () => {
    expect(ORCID_PATTERN.test('https://orcid.org/0000-0002-1825-0097')).toBe(true)
    expect(ORCID_PATTERN.test('https://orcid.org/0000-0002-1825-00977')).toBe(false)
  })
})

describe('orcid lint rules', () => {
  const codemetaWith = (id: string): string =>
    JSON.stringify({
      '@context': 'https://w3id.org/codemeta/4.0',
      '@type': 'SoftwareSourceCode',
      name: 'Demo',
      author: [{'@type': 'Person', '@id': id, givenName: 'A', familyName: 'B'}]
    })

  it('passes valid ORCIDs in codemeta documents', () => {
    const result = lintCodeMetaContent(codemetaWith('https://orcid.org/0000-0002-1825-0097'))
    expect(result.warnings.filter(warning => warning.rule === 'codemeta/orcid-format')).toEqual([])
  })

  it('flags wrong check digits in codemeta documents', () => {
    const result = lintCodeMetaContent(codemetaWith('https://orcid.org/0000-0002-1825-0098'))
    const findings = result.warnings.filter(warning => warning.rule === 'codemeta/orcid-format')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('check digit')
  })

  it('flags wrong check digits in schema.org documents', () => {
    const result = lintSchemaOrgContent(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'Demo',
        author: [{'@type': 'Person', '@id': 'https://orcid.org/0000-0000-0000-0000'}]
      })
    )
    const findings = result.warnings.filter(warning => warning.rule === 'schemaorg/orcid-format')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('check digit')
  })
})
