import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {lintCffContent, lintCffObject} from '../../src/cff/lint.js'
import {CFF_VERSIONS} from '../../src/registry.js'

const fixtures = path.resolve(import.meta.dirname, '../fixtures')

describe('CFF schema validation (all versions)', () => {
  for (const version of CFF_VERSIONS.map((info) => info.version)) {
    it(`accepts a valid CFF ${version} document`, () => {
      const content = readFileSync(path.join(fixtures, `cff/valid-${version}.cff`), 'utf8')
      const result = lintCffContent(content)
      expect(result.version).toBe(version)
      expect(result.versionSource).toBe('detected')
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })
  }

  it('rejects an unknown key and a malformed email in a CFF 1.2.0 document', () => {
    const content = readFileSync(path.join(fixtures, 'cff/invalid-schema.cff'), 'utf8')
    const result = lintCffContent(content)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some(
        (error) => error.message.includes('"invalid-key"') && error.path === '/invalid-key'
      )
    ).toBe(true)
    expect(result.errors.some((error) => error.path === '/authors/0/email')).toBe(true)
  })

  it('surfaces unknown keys as warnings for the lenient 1.0.3 schema', () => {
    const result = lintCffObject(
      {
        'cff-version': '1.0.3',
        message: 'm',
        title: 't',
        authors: [{'given-names': 'A', 'family-names': 'B'}],
        version: '1.0',
        'date-released': '2020-01-01',
        bogus: 'x'
      },
      {}
    )
    expect(result.valid).toBe(true)
    expect(
      result.warnings.some(
        (warning) => warning.rule === 'cff/unknown-key' && warning.path === '/bogus'
      )
    ).toBe(true)
  })

  it('reports an unsupported cff-version as an error', () => {
    const content = readFileSync(path.join(fixtures, 'cff/unsupported-version.cff'), 'utf8')
    const result = lintCffContent(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.rule === 'cff/unsupported-version')).toBe(true)
  })

  it('reports YAML parse failures', () => {
    const content = readFileSync(path.join(fixtures, 'cff/invalid-yaml.cff'), 'utf8')
    const result = lintCffContent(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.rule === 'cff/parse')).toBe(true)
  })
})

describe('CFF lint rules', () => {
  it('warns about a missing license and infos about missing repository-code', () => {
    const content = readFileSync(path.join(fixtures, 'cff/warnings.cff'), 'utf8')
    const result = lintCffContent(content)
    expect(result.valid).toBe(true)
    expect(result.warnings.some((warning) => warning.rule === 'cff/missing-license')).toBe(true)
    expect(result.infos.some((info) => info.rule === 'cff/missing-repository-code')).toBe(true)
    expect(result.infos.some((info) => info.rule === 'cff/version-date-consistency')).toBe(true)
  })

  it('flags a missing cff-version', () => {
    const result = lintCffObject({message: 'm', title: 't', authors: [{'given-names': 'A'}]}, {})
    expect(result.errors.some((error) => error.rule === 'cff/no-version')).toBe(true)
  })

  it('warns when the forced version differs from the declared one', () => {
    const result = lintCffObject(
      {'cff-version': '1.2.0', message: 'm', title: 't', authors: [{'given-names': 'A'}]},
      {version: '1.1.0'}
    )
    expect(result.version).toBe('1.1.0')
    expect(result.versionSource).toBe('specified')
    expect(result.warnings.some((warning) => warning.rule === 'cff/version-mismatch')).toBe(true)
    // The 1.1.0 schema requires version/date-released
    expect(result.valid).toBe(false)
  })

  it('respects rule configuration: disable and severity overrides', () => {
    const content = readFileSync(path.join(fixtures, 'cff/warnings.cff'), 'utf8')
    const disabled = lintCffContent(content, {rules: {disable: ['cff/missing-license']}})
    expect(disabled.warnings.some((warning) => warning.rule === 'cff/missing-license')).toBe(false)

    const promoted = lintCffContent(content, {
      rules: {severities: {'cff/missing-license': 'error'}}
    })
    expect(promoted.valid).toBe(false)
    expect(promoted.errors.some((error) => error.rule === 'cff/missing-license')).toBe(true)
  })
})
