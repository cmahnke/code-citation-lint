import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createServer, type Server} from 'node:http'
import {lintUrl} from '../../src/io.js'

let server: Server
let baseUrl = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? ''
    if (url === '/codemeta.json') {
      response.writeHead(200, {'content-type': 'application/json'})
      response.end(
        JSON.stringify({
          '@context': 'https://w3id.org/codemeta/3.0',
          '@type': 'SoftwareSourceCode',
          name: 'Served Example',
          description: 'Served over HTTP for URL tests.',
          author: [{givenName: 'A'}],
          license: 'MIT'
        })
      )
      return
    }
    if (url === '/broken.json') {
      response.writeHead(200, {'content-type': 'application/json'})
      response.end('{broken')
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
})

describe('lintUrl', () => {
  it('lints a file URL', async () => {
    const results = await lintUrl(`${baseUrl}/codemeta.json`)
    expect(results).toHaveLength(1)
    expect(results[0]?.type).toBe('codemeta')
    expect(results[0]?.valid).toBe(true)
    expect(results[0]?.file).toContain('/codemeta.json')
  })

  it('reports fetch failures', async () => {
    const results = await lintUrl(`${baseUrl}/missing.json`)
    expect(results[0]?.valid).toBe(false)
    expect(results[0]?.errors.some((error) => error.rule === 'fetch/failed')).toBe(true)
  })

  it('reports parse failures for malformed content', async () => {
    const results = await lintUrl(`${baseUrl}/broken.json`)
    expect(results[0]?.valid).toBe(false)
    expect(results[0]?.errors.some((error) => error.rule === 'lint/parse')).toBe(true)
  })
})
