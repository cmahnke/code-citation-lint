import {describe, expect, it} from 'vitest'
import {crossCheck} from '../../src/crosscheck.js'
import {
  registerVersion,
  getSchema,
  getVersions,
  isVersionRegistered,
  normalizeVersion,
  applyRuleConfig
} from '../../src/registry.js'
import {lintObject} from '../../src/lint.js'
import type {LintFinding, LintOptions} from '../../src/types.js'

describe('crossCheck', () => {
  it('passes for consistent documents', () => {
    const codemeta = {
      name: 'Tool',
      softwareVersion: '1.2.3',
      license: 'MIT',
      codeRepository: 'https://github.com/org/tool'
    }
    const cff = {
      title: 'Tool',
      version: '1.2.3',
      license: 'MIT',
      'repository-code': 'https://github.com/org/tool'
    }
    expect(crossCheck(codemeta, cff)).toEqual([])
  })

  it('reports name, version, license and repository mismatches', () => {
    const codemeta = {
      name: 'Alpha',
      softwareVersion: '2.0.0',
      license: 'MIT',
      codeRepository: 'https://github.com/org/alpha'
    }
    const cff = {
      title: 'Beta',
      version: '1.0.0',
      license: 'Apache-2.0',
      'repository-code': 'https://github.com/org/beta'
    }
    const findings = crossCheck(codemeta, cff)
    expect(findings.map((finding) => finding.rule)).toEqual([
      'crosscheck/name-mismatch',
      'crosscheck/version-mismatch',
      'crosscheck/license-mismatch',
      'crosscheck/repository-mismatch'
    ])
    expect(findings[3]?.severity).toBe('info')
  })

  it('normalizes SPDX license URLs and .git repository suffixes', () => {
    const codemeta = {
      license: 'https://spdx.org/licenses/MIT',
      codeRepository: 'https://github.com/org/tool'
    }
    const cff = {license: 'MIT', 'repository-code': 'https://github.com/org/tool.git'}
    expect(crossCheck(codemeta, cff)).toEqual([])
  })

  it('uses CodeMeta 1.0 synonyms (title, licenseId)', () => {
    const codemeta = {title: 'Tool', licenseId: 'MIT', version: '1.0.0'}
    const cff = {title: 'Tool', license: 'MIT', version: '1.0.0'}
    expect(crossCheck(codemeta, cff)).toEqual([])
  })
})

describe('registry', () => {
  it('registers a custom schema and uses it for validation', () => {
    registerVersion('codemeta', '9.9-test', {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {name: {type: 'string'}},
      required: ['name'],
      additionalProperties: false
    })
    expect(isVersionRegistered('codemeta', '9.9-test')).toBe(true)
    expect(getSchema('codemeta', '9.9-test')).toBeDefined()
    expect(getVersions('codemeta').map((info) => info.version)).toContain('9.9-test')

    const result = lintObject({name: 'custom'}, {version: '9.9-test'})
    expect(result.version).toBe('9.9-test')
    expect(result.valid).toBe(true)

    const invalid = lintObject({wrong: true}, {version: '9.9-test'})
    expect(invalid.valid).toBe(false)
  })

  it('normalizes versions', () => {
    expect(normalizeVersion(' V1.2.0 ')).toBe('1.2.0')
    expect(normalizeVersion('1.2.0-RC')).toBe('1.2.0-rc')
  })

  it('applies rule config with severity overrides', () => {
    const finding: LintFinding = {severity: 'warning', rule: 'cff/missing-license', message: 'x'}
    expect(applyRuleConfig(finding, {severities: {'cff/missing-license': 'error'}})?.severity).toBe(
      'error'
    )
    expect(applyRuleConfig(finding, {disable: ['cff/missing-license']})).toBeNull()
    expect(applyRuleConfig(finding, {severities: {cff: 'info'}})?.severity).toBe('info')
    expect(applyRuleConfig(finding, {severities: {'*': 'error'}})?.severity).toBe('error')
  })

  it('respects crosscheck disabling via lint options', () => {
    const options: LintOptions = {crosscheck: false}
    expect(options.crosscheck).toBe(false)
  })
})
