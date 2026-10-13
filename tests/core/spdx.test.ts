import {describe, expect, it} from 'vitest'
import {allSpdxIds, isSpdxId, spdxLicenseListVersion} from '../../src/spdx.js'
import {lintCodeMetaContent} from '../../src/codemeta/lint.js'
import {lintSchemaOrgContent} from '../../src/schemaorg/lint.js'

describe('spdx helpers', () => {
  it('knows common license ids', () => {
    expect(isSpdxId('MIT')).toBe(true)
    expect(isSpdxId('Apache-2.0')).toBe(true)
    expect(isSpdxId('BSD-3-Clause')).toBe(true)
    expect(isSpdxId('CC-BY-4.0')).toBe(true)
  })

  it('rejects unknown ids', () => {
    expect(isSpdxId('MIT-XYZ')).toBe(false)
    expect(isSpdxId('made-up-license')).toBe(false)
  })

  it('exposes the list version and ids', () => {
    expect(spdxLicenseListVersion()).toMatch(/^\d+\.\d+(\.\d+)?$/)
    expect(allSpdxIds().length).toBeGreaterThan(500)
    expect(allSpdxIds()).toContain('MIT')
  })
})

describe('license-spdx list check', () => {
  it('accepts known SPDX ids in codemeta documents', () => {
    const result = lintCodeMetaContent(
      JSON.stringify({
        '@context': 'https://w3id.org/codemeta/4.0',
        '@type': 'SoftwareSourceCode',
        name: 'Demo',
        author: [{givenName: 'A', familyName: 'B'}],
        license: 'MIT'
      })
    )
    expect(result.infos.filter((info) => info.rule === 'codemeta/license-spdx')).toEqual([])
  })

  it('flags well-formed but unknown SPDX ids in codemeta documents', () => {
    const result = lintCodeMetaContent(
      JSON.stringify({
        '@context': 'https://w3id.org/codemeta/4.0',
        '@type': 'SoftwareSourceCode',
        name: 'Demo',
        author: [{givenName: 'A', familyName: 'B'}],
        license: 'MIT-XYZ'
      })
    )
    const findings = result.infos.filter((info) => info.rule === 'codemeta/license-spdx')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('not in the SPDX license list')
  })

  it('accepts SPDX license URLs in codemeta documents', () => {
    const result = lintCodeMetaContent(
      JSON.stringify({
        '@context': 'https://w3id.org/codemeta/4.0',
        '@type': 'SoftwareSourceCode',
        name: 'Demo',
        author: [{givenName: 'A', familyName: 'B'}],
        license: 'https://spdx.org/licenses/MIT'
      })
    )
    expect(result.infos.filter((info) => info.rule === 'codemeta/license-spdx')).toEqual([])
  })

  it('flags well-formed but unknown SPDX ids in schema.org documents', () => {
    const result = lintSchemaOrgContent(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'Demo',
        author: [{givenName: 'A', familyName: 'B'}],
        license: 'GPL-v3-not-real'
      })
    )
    const findings = result.infos.filter((info) => info.rule === 'schemaorg/license-spdx')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('not in the SPDX license list')
  })
})
