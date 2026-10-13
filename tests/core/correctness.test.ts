import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {
  cffToCodemeta,
  cffToSchemaOrg,
  codemetaToCff,
  convertContent,
  convertDocument,
  doiFromIdentifier,
  extractDoi
} from '../../src/convert.js'
import {lintCffContent, lintCffObject, stringifyDates} from '../../src/cff/lint.js'
import {lintCodeMetaContent, lintCodeMetaObject} from '../../src/codemeta/lint.js'
import {lintSchemaOrgContent, lintSchemaOrgObject} from '../../src/schemaorg/lint.js'
import {parseDocument} from '../../src/lint.js'

const fixtures = path.resolve(import.meta.dirname, '../fixtures')

describe('1. CFF conversion URL priority (repository-artifact fallback)', () => {
  it('uses repository-artifact as codeRepository fallback', () => {
    const base = {'cff-version': '1.2.0', title: 't'}
    expect(
      cffToSchemaOrg({...base, 'repository-artifact': 'https://example.org/artifact'})
    ).toMatchObject({
      codeRepository: 'https://example.org/artifact',
      url: 'https://example.org/artifact'
    })
  })

  it('preserves existing priority: repository-code > repository > artifact', () => {
    const base = {'cff-version': '1.2.0', title: 't'}
    expect(
      cffToSchemaOrg({
        ...base,
        'repository-code': 'rc',
        repository: 'r',
        'repository-artifact': 'a'
      })
    ).toMatchObject({
      codeRepository: 'rc'
    })
    expect(cffToSchemaOrg({...base, repository: 'r', 'repository-artifact': 'a'})).toMatchObject({
      codeRepository: 'r'
    })
  })

  it('preserves url priority and drops codeRepository for datasets', () => {
    const base = {'cff-version': '1.2.0', title: 't'}
    // url priority unchanged: identifiers[type=url] > url > repository > repository-code > artifact
    expect(
      (cffToSchemaOrg({...base, url: 'u', 'repository-artifact': 'a'}) as Record<string, unknown>)
        .url
    ).toBe('u')
    const dataset = cffToSchemaOrg({
      ...base,
      type: 'dataset',
      'repository-code': 'rc',
      'repository-artifact': 'a'
    }) as Record<string, unknown>
    expect(dataset['@type']).toBe('Dataset')
    expect(dataset).not.toHaveProperty('codeRepository')
  })
})

describe('2. license-url fallback', () => {
  it('maps license-url to license when license is absent', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      'license-url': 'https://example.org/custom-license'
    }
    expect((cffToSchemaOrg(cff) as Record<string, unknown>).license).toBe(
      'https://example.org/custom-license'
    )
    expect((cffToCodemeta(cff) as Record<string, unknown>).license).toBe(
      'https://example.org/custom-license'
    )
  })

  it('prefers license over license-url and does not report license-url as unmapped', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      license: 'MIT',
      'license-url': 'https://example.org/other'
    }
    expect((cffToSchemaOrg(cff) as Record<string, unknown>).license).toBe(
      'https://spdx.org/licenses/MIT'
    )
    const outcome = convertDocument(cff, 'codemeta', {lint: false})
    expect(
      outcome.issues.some((i) => i.rule === 'convert/unmapped' && i.message.includes('license-url'))
    ).toBe(false)
  })

  it('converts the license-url fixture', () => {
    const source = readFileSync(path.join(fixtures, 'convert/cff-license-url.cff'), 'utf8')
    const outcome = convertContent(source, 'codemeta', {lint: false})
    expect((outcome.document as Record<string, unknown>).license).toBe(
      'https://example.org/custom-license'
    )
  })
})

describe('3. reverse conversion vocabulary (CodeMeta 1.0 synonyms)', () => {
  it('maps licenseId, tags, version, title, dateModified', () => {
    const outcome = convertDocument(
      {
        title: 'Syn Title',
        licenseId: 'MIT',
        tags: ['a', 'b'],
        version: '1.0.0',
        dateModified: '2024-06-01T12:00:00Z'
      },
      'cff',
      {lint: false}
    )
    const doc = outcome.document as Record<string, unknown>
    expect(doc.title).toBe('Syn Title')
    expect(doc.license).toBe('MIT')
    expect(doc.keywords).toEqual(['a', 'b'])
    expect(doc.version).toBe('1.0.0')
    expect(doc['date-released']).toBe('2024-06-01')
  })

  it('maps author/creator/agents/person synonyms and normalizes single objects', () => {
    const single = convertDocument(
      {name: 't', author: {givenName: 'Ada', familyName: 'Lovelace'}},
      'cff',
      {lint: false}
    )
    expect((single.document as Record<string, unknown>).authors).toEqual([
      {'given-names': 'Ada', 'family-names': 'Lovelace'}
    ])

    for (const key of ['author', 'creator', 'agents', 'person']) {
      const outcome = convertDocument({name: 't', [key]: [{givenName: 'A'}]}, 'cff', {lint: false})
      const doc = outcome.document as Record<string, unknown>
      expect(doc.authors).toEqual([{'given-names': 'A'}])
      expect(
        outcome.issues.some((i) => i.rule === 'convert/unmapped' && i.message.includes(`"${key}"`))
      ).toBe(false)
    }
  })

  it('consumes all mapped synonym keys (no unmapped for valid mapped fields)', () => {
    const source = readFileSync(path.join(fixtures, 'convert/codemeta-synonyms.json'), 'utf8')
    const outcome = convertContent(source, 'cff', {lint: false})
    const unmapped = outcome.issues
      .filter((i) => i.rule === 'convert/unmapped')
      .map((i) => i.message)
    for (const term of [
      'title',
      'person',
      'licenseId',
      'version',
      'dateModified',
      'tags',
      'codeRepository',
      'url'
    ]) {
      expect(unmapped.some((m) => m.includes(`"${term}"`))).toBe(false)
    }
    const doc = outcome.document as Record<string, unknown>
    expect(doc.title).toBe('Synonym Source')
    expect(doc.license).toBe('MIT')
    expect(doc.keywords).toEqual(['synonym', 'test'])
  })

  it('maps name/title, softwareVersion/version, datePublished/dateModified, codeRepository/url', () => {
    const byName = convertDocument(
      {
        name: 'N',
        softwareVersion: '2.0',
        datePublished: '2024-01-02',
        codeRepository: 'https://example.org/r'
      },
      'cff',
      {lint: false}
    )
    expect((byName.document as Record<string, unknown>).title).toBe('N')
    const byTitle = convertDocument(
      {title: 'T', version: '3.0', dateModified: '2024-01-03', url: 'https://example.org/u'},
      'cff',
      {lint: false}
    )
    const doc = byTitle.document as Record<string, unknown>
    expect(doc.title).toBe('T')
    expect(doc.version).toBe('3.0')
    expect(doc['date-released']).toBe('2024-01-03')
    expect(doc.url).toBe('https://example.org/u')
  })
})

describe('4. DOI parsing', () => {
  it.each([
    ['https://doi.org/10.5281/zenodo.5', '10.5281/zenodo.5'],
    ['http://doi.org/10.5281/zenodo.5', '10.5281/zenodo.5'],
    ['https://dx.doi.org/10.5281/zenodo.5', '10.5281/zenodo.5'],
    ['http://dx.doi.org/10.5281/zenodo.5', '10.5281/zenodo.5'],
    ['doi:10.5281/zenodo.5', '10.5281/zenodo.5'],
    ['10.5281/zenodo.5', '10.5281/zenodo.5']
  ])('parses %s as %s', (input, expected) => {
    expect(doiFromIdentifier(input)).toBe(expected)
    expect(extractDoi(input)).toBe(expected)
  })

  it('maps DOI identifiers to doi and consumes the key', () => {
    const outcome = convertDocument({name: 't', identifier: 'doi:10.5281/zenodo.5'}, 'cff', {
      lint: false
    })
    expect((outcome.document as Record<string, unknown>).doi).toBe('10.5281/zenodo.5')
    expect(
      outcome.issues.some(
        (i) => i.rule === 'convert/unmapped' && i.message.includes('"identifier"')
      )
    ).toBe(false)
  })

  it('leaves non-DOI identifiers for unmapped reporting', () => {
    const outcome = convertDocument(
      {name: 't', author: [{givenName: 'A'}], identifier: 'https://example.org/not-a-doi'},
      'cff',
      {lint: false}
    )
    expect((outcome.document as Record<string, unknown>).doi).toBeUndefined()
    expect(
      outcome.issues.some(
        (i) => i.rule === 'convert/unmapped' && i.message.includes('"identifier"')
      )
    ).toBe(true)
  })
})

describe('5. object safety (license/affiliation)', () => {
  it('prefers @id/id/url/name for license objects and omits opaque objects', () => {
    const withId = convertDocument(
      {name: 't', license: {'@id': 'https://spdx.org/licenses/MIT'}},
      'cff',
      {lint: false}
    )
    expect((withId.document as Record<string, unknown>).license).toBe('MIT')
    const withName = convertDocument({name: 't', license: {name: 'Apache-2.0'}}, 'cff', {
      lint: false
    })
    expect((withName.document as Record<string, unknown>).license).toBe('Apache-2.0')
    const opaque = convertDocument({name: 't', license: {foo: 'bar'}}, 'cff', {lint: false})
    const doc = opaque.document as Record<string, unknown>
    expect(doc.license).toBeUndefined()
    // Ensure no emitted value contains the opaque stringification
    expect(JSON.stringify(doc)).not.toContain('[object Object]')
  })

  it('prefers usable affiliation strings and omits opaque affiliation objects', () => {
    const withOrgId = codemetaToCff(
      {name: 't', author: [{givenName: 'A', affiliation: {'@id': 'https://example.org/org'}}]},
      {cffVersion: '1.2.0'}
    ) as Record<string, unknown>
    expect((withOrgId.authors as Array<Record<string, unknown>>)[0]?.affiliation).toBe(
      'https://example.org/org'
    )

    const opaque = codemetaToCff(
      {name: 't', author: [{givenName: 'A', affiliation: {foo: 'bar'}}]},
      {cffVersion: '1.2.0'}
    ) as Record<string, unknown>
    expect((opaque.authors as Array<Record<string, unknown>>)[0]?.affiliation).toBeUndefined()
    expect(JSON.stringify(opaque)).not.toContain('[object Object]')
  })
})

describe('6. conversion versions throw on unregistered versions', () => {
  it('throws for unknown codemetaVersion naming available versions', () => {
    expect(() =>
      cffToCodemeta({'cff-version': '1.2.0', title: 't'}, {codemetaVersion: '9.9-nope'})
    ).toThrow(/Unsupported CodeMeta version.*available:/)
  })

  it('throws for unknown cffVersion naming available versions', () => {
    expect(() => codemetaToCff({name: 't'}, {cffVersion: '9.9-nope'})).toThrow(
      /Unsupported CFF version.*available:/
    )
  })
})

describe('7. CodeMeta warnings (dedupe + version-guessed)', () => {
  it('emits a single context-unrecognized warning for unrecognized @context', () => {
    const result = lintCodeMetaObject(
      {'@context': 'https://example.org/not-codemeta', name: 'x'},
      {}
    )
    expect(result.warnings.filter((w) => w.rule === 'codemeta/context-unrecognized')).toHaveLength(
      1
    )
  })

  it('emits version-guessed when version comes from term sniffing', () => {
    const result = lintCodeMetaObject(
      {name: 'x', description: 'y', author: [], hasSourceCode: 'https://example.org/repo'},
      {}
    )
    const guessed = result.warnings.filter((w) => w.rule === 'codemeta/version-guessed')
    expect(guessed).toHaveLength(1)
    expect(guessed[0]?.message).toContain('Version guessed')
    expect(result.versionSource).toBe('unknown')
  })

  it('emits version-guessed for codemeta-like fallback including detection detail', () => {
    const result = lintCodeMetaObject({name: 'x', description: 'y', author: []}, {})
    const guessed = result.warnings.filter((w) => w.rule === 'codemeta/version-guessed')
    expect(guessed).toHaveLength(1)
    // The fallback detail mentions latest version usage
    expect(guessed[0]?.message.length).toBeGreaterThan(0)
  })
})

describe('8. parseDocument YAML fallback', () => {
  it('falls back to YAML for { input that is not valid JSON', () => {
    const parsed = parseDocument('{a: 1}')
    expect((parsed.document as Record<string, unknown>).a).toBe(1)
  })

  it('still returns an error for content that is neither JSON nor YAML', () => {
    expect(parseDocument('{invalid').error).toContain('Invalid')
  })
})

describe('9. version normalization', () => {
  it('normalizes options.version for CFF lookup', () => {
    const result = lintCffObject(
      {'cff-version': '1.2.0', message: 'm', title: 't', authors: [{'given-names': 'A'}]},
      {version: 'V1.2.0'}
    )
    expect(result.version).toBe('1.2.0')
    expect(result.versionSource).toBe('specified')
    expect(result.warnings.some((w) => w.rule === 'cff/version-mismatch')).toBe(false)
  })

  it('normalizes options.version for CodeMeta lookup', () => {
    const result = lintCodeMetaObject(
      {'@context': 'https://w3id.org/codemeta/3.0', '@type': 'SoftwareSourceCode', name: 'x'},
      {version: 'V3.0'}
    )
    expect(result.version).toBe('3.0')
    expect(result.versionSource).toBe('specified')
  })

  it('normalizes options.version for schema.org lookup', () => {
    const result = lintSchemaOrgObject(
      {'@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: 'x'},
      {version: 'Latest'}
    )
    expect(result.version).toBe('latest')
    expect(result.versionSource).toBe('specified')
    expect(result.warnings.some((w) => w.rule === 'schemaorg/version-ignored')).toBe(false)
  })
})

describe('10. parse failures route through finalize', () => {
  it('applies rule config to CFF parse errors and preserves version', () => {
    const content = readFileSync(path.join(fixtures, 'cff/invalid-yaml.cff'), 'utf8')
    const disabled = lintCffContent(content, {rules: {disable: ['cff/parse']}})
    expect(disabled.errors).toEqual([])
    expect(disabled.valid).toBe(true)

    const withVersion = lintCffContent(content, {version: 'V1.2.0'})
    expect(withVersion.version).toBe('1.2.0')
    expect(withVersion.versionSource).toBe('specified')
  })

  it('applies rule config to CodeMeta parse errors and preserves version', () => {
    const content = readFileSync(path.join(fixtures, 'codemeta/invalid-json.json'), 'utf8')
    const disabled = lintCodeMetaContent(content, {rules: {disable: ['codemeta/parse']}})
    expect(disabled.errors).toEqual([])
    expect(disabled.valid).toBe(true)

    const withVersion = lintCodeMetaContent(content, {version: 'V3.0'})
    expect(withVersion.version).toBe('3.0')
    expect(withVersion.versionSource).toBe('specified')
  })

  it('applies rule config to schema.org parse errors and preserves version', () => {
    const disabled = lintSchemaOrgContent('{broken', {rules: {disable: ['schemaorg/parse']}})
    expect(disabled.errors).toEqual([])
    expect(disabled.valid).toBe(true)
    expect(disabled.version).toBe('latest')
  })
})

describe('11. YAML dates (local calendar + CFF conversion)', () => {
  it('formats Date objects with local year/month/day', () => {
    // Constructed with local components; output must round-trip the same calendar date.
    const date = new Date(2024, 5, 1)
    expect(stringifyDates(date)).toBe('2024-06-01')
    expect(stringifyDates({nested: [new Date(2024, 0, 15)]})).toEqual({nested: ['2024-01-15']})
  })

  it('normalizes YAML Date values before CFF conversion and output validation', () => {
    const source = readFileSync(path.join(fixtures, 'convert/cff-date-unquoted.cff'), 'utf8')
    const outcome = convertContent(source, 'codemeta')
    const doc = outcome.document as Record<string, unknown>
    expect(typeof doc.datePublished).toBe('string')
    expect(doc.datePublished).toBe('2024-06-01')
    expect(outcome.result?.valid).toBe(true)
  })

  it('handles Date objects passed directly to cffToSchemaOrg', () => {
    const output = cffToSchemaOrg({
      'cff-version': '1.2.0',
      title: 't',
      'date-released': new Date(2024, 5, 1)
    }) as Record<string, unknown>
    expect(output.datePublished).toBe('2024-06-01')
  })
})
