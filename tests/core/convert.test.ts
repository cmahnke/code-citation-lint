import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {cffToCodemeta, cffToSchemaOrg, cffToZenodo, convertContent, convertDocument, authorToSchemaOrg} from '../../src/convert.js'
import {parse as parseYaml} from 'yaml'
import {codemetaContextUrl, getLatestVersion} from '../../src/registry.js'

const fixtures = path.resolve(import.meta.dirname, '../fixtures')

describe('cffToCodemeta / cffToSchemaOrg', () => {
  const source = readFileSync(path.join(fixtures, 'convert/source.cff'), 'utf8')

  it('matches the expected codemeta output', () => {
    const outcome = convertContent(source, 'codemeta')
    expect(outcome.target).toBe('codemeta')
    expect(outcome.version).toBe('4.0')
    expect(outcome.document).toEqual(JSON.parse(readFileSync(path.join(fixtures, 'convert/expected-codemeta.json'), 'utf8')))
  })

  it('matches the expected schema.org output', () => {
    const outcome = convertContent(source, 'schemaorg')
    expect(outcome.target).toBe('schemaorg')
    expect(outcome.document).toEqual(JSON.parse(readFileSync(path.join(fixtures, 'convert/expected-schemaorg.json'), 'utf8')))
  })

  it('round-trips: converted documents pass their own linter', () => {
    for (const target of ['codemeta', 'schemaorg'] as const) {
      const outcome = convertContent(source, target)
      expect(outcome.result?.valid).toBe(true)
      expect(outcome.result?.errors).toEqual([])
    }
  })

  it('targets the requested codemeta version', () => {
    const cff = {'cff-version': '1.2.0', title: 't', message: 'm', authors: []}
    expect((cffToCodemeta(cff, {codemetaVersion: '3.0'}) as Record<string, unknown>)['@context']).toBe('https://w3id.org/codemeta/3.0')
    expect((cffToCodemeta(cff) as Record<string, unknown>)['@context']).toBe(codemetaContextUrl(getLatestVersion('codemeta')))
  })

  it('prefers doi identifiers over the top-level doi', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      doi: '10.5281/zenodo.111',
      identifiers: [{type: 'doi', value: '10.5281/zenodo.222'}]
    }
    expect((cffToSchemaOrg(cff) as Record<string, unknown>).identifier).toBe('https://doi.org/10.5281/zenodo.222')
  })

  it('resolves codeRepository/url with the cffconvert precedence', () => {
    const base = {'cff-version': '1.2.0', title: 't'}
    expect(cffToSchemaOrg({...base, 'repository-code': 'rc', repository: 'r', url: 'u'})).toMatchObject({codeRepository: 'rc', url: 'u'})
    expect(cffToSchemaOrg({...base, repository: 'r', url: 'u'})).toMatchObject({codeRepository: 'r', url: 'u'})
    expect(cffToSchemaOrg({...base, 'repository-code': 'rc', repository: 'r'})).toMatchObject({codeRepository: 'rc', url: 'r'})
    expect(cffToSchemaOrg({...base, 'repository-code': 'rc'})).toMatchObject({codeRepository: 'rc', url: 'rc'})
    expect(cffToSchemaOrg({...base, 'repository-artifact': 'a'})).toMatchObject({url: 'a'})
    expect(cffToSchemaOrg(base)).not.toHaveProperty('codeRepository')
    expect(cffToSchemaOrg(base)).not.toHaveProperty('url')
  })

  it('converts datasets without codeRepository and with @type Dataset', () => {
    const cff = {'cff-version': '1.2.0', title: 't', type: 'dataset', 'repository-code': 'rc'}
    const output = cffToSchemaOrg(cff) as Record<string, unknown>
    expect(output['@type']).toBe('Dataset')
    expect(output).not.toHaveProperty('codeRepository')
  })

  it('uses url-typed identifiers for url when present', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      url: 'https://landing',
      identifiers: [{type: 'url', value: 'https://archive'}]
    }
    expect((cffToSchemaOrg(cff) as Record<string, unknown>).url).toBe('https://archive')
  })

  it('maps entity authors to Organization and person authors to Person', () => {
    expect(authorToSchemaOrg({name: 'Org', alias: 'a', email: 'e@x.org', orcid: 'https://orcid.org/0000-0002-1825-0097'})).toEqual({
      '@type': 'Organization',
      '@id': 'https://orcid.org/0000-0002-1825-0097',
      name: 'Org',
      alternateName: 'a',
      email: 'e@x.org'
    })
    expect(authorToSchemaOrg({'given-names': 'A'})).toEqual({'@type': 'Person', givenName: 'A'})
  })

  it('throws on unparseable content', () => {
    expect(() => convertContent('{broken', 'codemeta')).toThrow()
    expect(() => convertContent('', 'codemeta')).toThrow()
  })

  it('skips linting when asked to', () => {
    const cff = {'cff-version': '1.2.0', title: 't'}
    const outcome = convertDocument(cff, 'schemaorg', {lint: false})
    expect(outcome.result).toBeUndefined()
  })
})

describe('cffToZenodo', () => {
  const source = readFileSync(path.join(fixtures, 'convert/source.cff'), 'utf8')

  it('matches the expected zenodo output', () => {
    const outcome = convertContent(source, 'zenodo')
    expect(outcome.target).toBe('zenodo')
    expect(outcome.document).toEqual(JSON.parse(readFileSync(path.join(fixtures, 'convert/expected-zenodo.json'), 'utf8')))
  })

  it('uses creators, bare orcid ids and license ids', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      authors: [
        {'given-names': 'A', 'name-particle': 'von', 'family-names': 'Lovelace', affiliation: 'Org', orcid: 'https://orcid.org/0000-0002-1825-0097'},
        {name: 'Org'}
      ],
      license: 'MIT'
    }
    const output = cffToZenodo(cff) as Record<string, unknown>
    expect(output.creators).toEqual([
      {affiliation: 'Org', name: 'von Lovelace, A', orcid: '0000-0002-1825-0097'},
      {name: 'Org'}
    ])
    expect(output.license).toEqual({id: 'MIT'})
    expect(output.upload_type).toBe('software')
  })

  it('collects related identifiers from identifiers, doi and urls without duplicates', () => {
    const cff = {
      'cff-version': '1.2.0',
      title: 't',
      doi: '10.5281/zenodo.111',
      identifiers: [{type: 'doi', value: '10.5281/zenodo.111'}, {type: 'other', value: 'ignored'}],
      url: 'https://u',
      'repository-code': 'https://u'
    }
    const output = cffToZenodo(cff) as Record<string, unknown>
    expect(output.related_identifiers).toEqual([
      {identifier: '10.5281/zenodo.111', relation: 'isSupplementedBy', scheme: 'doi'},
      {identifier: 'https://u', relation: 'isSupplementedBy', scheme: 'url'}
    ])
  })

  it('reports dropped cff keys as unmapped info issues', () => {
    const outcome = convertDocument({'cff-version': '1.2.0', title: 't', commit: 'abc', references: []}, 'zenodo', {lint: false})
    const dropped = outcome.issues.filter(issue => issue.rule === 'convert/unmapped')
    expect(dropped.map(issue => issue.message)).toEqual([
      'The CFF key "commit" has no Zenodo equivalent and was dropped.',
      'The CFF key "references" has no Zenodo equivalent and was dropped.'
    ])
  })
})

describe('codemetaToCff (reverse conversion)', () => {
  it('matches the expected cff output', () => {
    const source = readFileSync(path.join(fixtures, 'convert/codemeta-source.json'), 'utf8')
    const outcome = convertContent(source, 'cff')
    expect(outcome.target).toBe('cff')
    expect(outcome.version).toBe('1.2.0')
    expect(outcome.document).toEqual(parseYaml(readFileSync(path.join(fixtures, 'convert/expected-cff.cff'), 'utf8')))
  })

  it('round-trips: the generated cff passes its own linter', () => {
    const source = readFileSync(path.join(fixtures, 'convert/codemeta-source.json'), 'utf8')
    const outcome = convertContent(source, 'cff')
    expect(outcome.result?.valid).toBe(true)
  })

  it('reports unmapped codemeta terms as info issues', () => {
    const source = readFileSync(path.join(fixtures, 'convert/codemeta-source.json'), 'utf8')
    const outcome = convertContent(source, 'cff')
    const rules = outcome.issues.map(issue => issue.message)
    expect(rules).toContain('The CodeMeta term "readme" has no CFF equivalent and was dropped.')
    expect(rules).toContain('The CodeMeta term "issueTracker" has no CFF equivalent and was dropped.')
  })

  it('normalizes SPDX URLs, DOI identifiers and ISO dates', () => {
    const outcome = convertDocument(
      {
        name: 't',
        license: 'https://spdx.org/licenses/Apache-2.0',
        identifier: 'https://doi.org/10.5281/zenodo.5',
        datePublished: '2024-06-01T12:00:00Z',
        softwareVersion: '1.0.0'
      },
      'cff',
      {lint: false}
    )
    const document = outcome.document as Record<string, unknown>
    expect(document.license).toBe('Apache-2.0')
    expect(document.doi).toBe('10.5281/zenodo.5')
    expect(document['date-released']).toBe('2024-06-01')
  })

  it('errors when required cff fields are missing', () => {
    const outcome = convertDocument({'@context': 'https://w3id.org/codemeta/4.0', description: 'x'}, 'cff')
    const errors = outcome.issues.filter(issue => issue.rule === 'convert/missing-required')
    expect(errors).toHaveLength(2)
    expect(errors.every(issue => issue.severity === 'error')).toBe(true)
  })

  it('rejects a cff input for the cff target', () => {
    expect(() => convertDocument({'cff-version': '1.2.0', title: 't'}, 'cff')).toThrow('requires a CodeMeta document')
  })
})
