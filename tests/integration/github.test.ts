import {afterEach, describe, expect, it, vi} from 'vitest'
import {lintUrl, normalizeFileUrl, parseGitHubRepo, resolveBranches} from '../../src/io.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseGitHubRepo', () => {
  it('parses plain repository URLs', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo')).toEqual({owner: 'owner', repo: 'repo', branch: undefined})
    expect(parseGitHubRepo('http://github.com/owner/repo/')).toEqual({owner: 'owner', repo: 'repo', branch: undefined})
  })

  it('parses tree URLs and strips .git suffixes', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo/tree/develop')).toEqual({owner: 'owner', repo: 'repo', branch: 'develop'})
    expect(parseGitHubRepo('https://github.com/owner/repo.git')).toEqual({owner: 'owner', repo: 'repo', branch: undefined})
  })

  it('rejects non-repository URLs', () => {
    expect(parseGitHubRepo('https://github.com/owner')).toBeUndefined()
    expect(parseGitHubRepo('https://gitlab.com/owner/repo')).toBeUndefined()
    expect(parseGitHubRepo('https://github.com/owner/repo/blob/main/codemeta.json')).toBeUndefined()
  })
})

describe('normalizeFileUrl', () => {
  it('rewrites blob URLs to raw URLs', () => {
    expect(normalizeFileUrl('https://github.com/owner/repo/blob/main/codemeta.json')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/codemeta.json'
    )
  })

  it('keeps other URLs as-is', () => {
    expect(normalizeFileUrl('https://raw.githubusercontent.com/owner/repo/main/codemeta.json')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/codemeta.json'
    )
    expect(normalizeFileUrl('https://example.com/codemeta.json')).toBe('https://example.com/codemeta.json')
  })
})

describe('resolveBranches', () => {
  it('prefers the default branch from the API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({default_branch: 'develop'})
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveBranches({owner: 'owner', repo: 'repo'})).toEqual(['develop', 'main', 'master'])
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo')
  })

  it('falls back to main/master when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: false, status: 404, statusText: 'Not Found'}))
    )
    expect(await resolveBranches({owner: 'owner', repo: 'repo'})).toEqual(['main', 'master'])
  })

  it('falls back to main/master when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    expect(await resolveBranches({owner: 'owner', repo: 'repo'})).toEqual(['main', 'master'])
  })

  it('uses an explicit branch without any API call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveBranches({owner: 'owner', repo: 'repo', branch: 'v1'})).toEqual(['v1'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('lintUrl repository expansion', () => {
  const codemeta = JSON.stringify({
    '@context': 'https://w3id.org/codemeta/4.0',
    '@type': 'SoftwareSourceCode',
    name: 'Demo',
    description: 'Demo software',
    author: [{givenName: 'A', familyName: 'B'}],
    license: 'MIT',
    codeRepository: 'https://github.com/owner/repo',
    softwareVersion: '1.0.0'
  })

  function routeFetch(routes: Record<string, {status: number; body?: string}>): unknown {
    return vi.fn(async (url: string) => {
      const route = routes[url]
      if (route === undefined || route.status !== 200) {
        return {ok: false, status: 404, statusText: 'Not Found', json: async () => ({})}
      }
      return {ok: true, status: 200, text: async () => route.body ?? '', json: async () => ({})}
    })
  }

  it('fetches CITATION.cff from the default branch', async () => {
    const cff = 'cff-version: 1.2.0\nmessage: cite me\ntitle: Demo\nauthors:\n  - given-names: A\n    family-names: B\n'
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'https://api.github.com/repos/owner/repo': {status: 200, body: JSON.stringify({default_branch: 'main'})},
        'https://raw.githubusercontent.com/owner/repo/main/codemeta.json': {status: 404},
        'https://raw.githubusercontent.com/owner/repo/main/CITATION.cff': {status: 200, body: cff}
      })
    )
    const results = await lintUrl('https://github.com/owner/repo')
    expect(results).toHaveLength(1)
    expect(results[0]?.type).toBe('cff')
    expect(results[0]?.valid).toBe(true)
  })

  it('falls back to master when a branch has no metadata', async () => {
    const cff = 'cff-version: 1.2.0\nmessage: cite me\ntitle: Demo\nauthors:\n  - given-names: A\n    family-names: B\n'
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'https://api.github.com/repos/owner/repo': {status: 404},
        'https://raw.githubusercontent.com/owner/repo/main/CITATION.cff': {status: 404},
        'https://raw.githubusercontent.com/owner/repo/master/CITATION.cff': {status: 200, body: cff}
      })
    )
    const results = await lintUrl('https://github.com/owner/repo')
    expect(results[0]?.type).toBe('cff')
    expect(results[0]?.valid).toBe(true)
  })

  it('reports fetch/failed when no metadata exists on any branch', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'https://api.github.com/repos/owner/repo': {status: 404}
      })
    )
    const results = await lintUrl('https://github.com/owner/repo')
    expect(results).toHaveLength(1)
    expect(results[0]?.errors.some(error => error.rule === 'fetch/failed')).toBe(true)
  })

  it('fetches plain URLs and lints the content', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'https://example.com/codemeta.json': {status: 200, body: codemeta}
      })
    )
    const results = await lintUrl('https://example.com/codemeta.json')
    expect(results).toHaveLength(1)
    expect(results[0]?.type).toBe('codemeta')
    expect(results[0]?.valid).toBe(true)
  })
})
