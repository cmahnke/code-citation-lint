import {describe, expect, it} from 'vitest'
import {spawnSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {parse as parseYaml} from 'yaml'
import {existsSync, readFileSync, mkdtempSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = path.resolve(root, 'tests/fixtures')
const cli = path.join(root, 'dist/cli.js')

function run(
  args: string[],
  options: {input?: string; allowFailure?: boolean} = {}
): {stdout: string; stderr: string; status: number} {
  const result = spawnSync('node', [cli, ...args], {
    cwd: root,
    input: options.input,
    encoding: 'utf8'
  })
  const status = result.status ?? 1
  if (status !== 0 && !options.allowFailure) {
    throw new Error(`CLI exited with ${status}: ${result.stderr}`)
  }
  return {stdout: result.stdout ?? '', stderr: result.stderr ?? '', status}
}

describe('lint subcommand', () => {
  it('is the default when no subcommand is given', () => {
    const {stdout, status} = run([path.join(fixtures, 'cff/valid-1.2.0.cff')])
    expect(status).toBe(0)
    expect(stdout).toContain('VALID')
  })

  it('is the default even with leading options', () => {
    const {stdout, status} = run(['-s', path.join(fixtures, 'cff/warnings.cff')], {
      allowFailure: true
    })
    // the document itself is valid; --strict only escalates the exit code
    expect(status).toBe(1)
    expect(stdout).toContain('VALID')
    expect(stdout).toContain('1 warning')
  })

  it('works when named explicitly', () => {
    const {stdout, status} = run(['lint', path.join(fixtures, 'codemeta/valid-3.0.json')])
    expect(status).toBe(0)
    expect(stdout).toContain('CODEMETA 3.0')
  })

  it('accepts schemaorg as a type', () => {
    const {stdout} = run(['lint', '-t', 'schemaorg', path.join(fixtures, 'schemaorg/valid.json')])
    expect(stdout).toContain('SCHEMAORG latest')
  })
})

describe('convert subcommand', () => {
  const source = path.join(fixtures, 'convert/source.cff')
  const expectedCodemeta = readFileSync(
    path.join(fixtures, 'convert/expected-codemeta.json'),
    'utf8'
  )
  const expectedSchemaorg = readFileSync(
    path.join(fixtures, 'convert/expected-schemaorg.json'),
    'utf8'
  )

  it('writes codemeta to stdout with "-"', () => {
    const {stdout, status} = run(['convert', source, '-'])
    expect(status).toBe(0)
    expect(JSON.parse(stdout)).toEqual(JSON.parse(expectedCodemeta))
  })

  it('writes schema.org to stdout with --to schemaorg', () => {
    const {stdout, status} = run(['convert', '--to', 'schemaorg', source, '-'])
    expect(status).toBe(0)
    expect(JSON.parse(stdout)).toEqual(JSON.parse(expectedSchemaorg))
  })

  it('writes multiple targets into a created directory', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const output = path.join(dir, 'nested', 'out')
      const {status} = run(['convert', '--to', 'codemeta,schemaorg', source, output])
      expect(status).toBe(0)
      expect(JSON.parse(readFileSync(path.join(output, 'codemeta.json'), 'utf8'))).toEqual(
        JSON.parse(expectedCodemeta)
      )
      expect(JSON.parse(readFileSync(path.join(output, 'schemaorg.json'), 'utf8'))).toEqual(
        JSON.parse(expectedSchemaorg)
      )
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('writes to an explicit file path', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const file = path.join(dir, 'output.json')
      const {status} = run(['convert', '--minify', source, file])
      expect(status).toBe(0)
      expect(existsSync(file)).toBe(true)
      // minified output
      expect(readFileSync(file, 'utf8').trim().startsWith('{"@context"')).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('supports --codemeta-version', () => {
    const {stdout} = run(['convert', '--codemeta-version', '3.0', source, '-'])
    expect(JSON.parse(stdout)['@context']).toBe('https://w3id.org/codemeta/3.0')
  })

  it('fails with exit 1 for invalid CFF input', () => {
    const {status, stderr} = run(['convert', path.join(fixtures, 'cff/invalid-schema.cff'), '-'], {
      allowFailure: true
    })
    expect(status).toBe(1)
    expect(stderr).toContain('not a valid CFF document')
  })

  it('fails with exit 2 for missing input files', () => {
    const {status} = run(['convert', '/does/not/exist.cff', '-'], {allowFailure: true})
    expect(status).toBe(2)
  })

  it('respects --quiet for findings but still writes files', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const file = path.join(dir, 'codemeta.json')
      const {stdout, status} = run(
        ['convert', '-q', path.join(fixtures, 'cff/warnings.cff'), file],
        {allowFailure: true}
      )
      expect(status).toBe(0)
      expect(stdout).toBe('')
      expect(existsSync(file)).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})

describe('convert subcommand: zenodo and cff targets', () => {
  const source = path.join(fixtures, 'convert/source.cff')
  const codemetaSource = path.join(fixtures, 'convert/codemeta-source.json')
  const expectedZenodo = readFileSync(path.join(fixtures, 'convert/expected-zenodo.json'), 'utf8')
  const expectedCff = readFileSync(path.join(fixtures, 'convert/expected-cff.cff'), 'utf8')

  it('converts to zenodo on stdout', () => {
    const {stdout, status} = run(['convert', '--to', 'zenodo', source, '-'])
    expect(status).toBe(0)
    expect(JSON.parse(stdout)).toEqual(JSON.parse(expectedZenodo))
  })

  it('writes .zenodo.json into directories', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-zenodo-'))
    try {
      const output = path.join(dir, 'out')
      mkdirSync(output, {recursive: true})
      const {status} = run(['convert', '--to', 'zenodo', source, output])
      expect(status).toBe(0)
      expect(JSON.parse(readFileSync(path.join(output, '.zenodo.json'), 'utf8'))).toEqual(
        JSON.parse(expectedZenodo)
      )
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('converts codemeta to cff on stdout as yaml', () => {
    const {stdout, status} = run(['convert', '--to', 'cff', codemetaSource, '-'])
    expect(status).toBe(0)
    // strip the generated-by header line before comparing
    const yaml = stdout
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
    expect(parseYaml(yaml)).toEqual(parseYaml(expectedCff))
  })

  it('writes CITATION.cff into directories', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-reverse-'))
    try {
      const output = path.join(dir, 'out')
      mkdirSync(output, {recursive: true})
      const {status} = run(['convert', '--to', 'cff', codemetaSource, output])
      expect(status).toBe(0)
      expect(readFileSync(path.join(output, 'CITATION.cff'), 'utf8')).toContain(
        'cff-version: 1.2.0'
      )
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('rejects a cff input for the cff target with exit 2', () => {
    const {status, stderr} = run(['convert', '--to', 'cff', source, '-'], {allowFailure: true})
    expect(status).toBe(2)
    expect(stderr).toContain('requires a codemeta document')
  })

  it('rejects mixing the cff target with other targets', () => {
    const {status, stderr} = run(['convert', '--to', 'cff,codemeta', codemetaSource, '-'], {
      allowFailure: true
    })
    expect(status).toBe(2)
    expect(stderr).toContain('Cannot mix')
  })

  it('fails on an invalid codemeta input with exit 1', () => {
    const {status, stderr} = run(
      ['convert', '--to', 'cff', path.join(fixtures, 'codemeta/invalid-schema.json'), '-'],
      {allowFailure: true}
    )
    expect(status).toBe(1)
    expect(stderr).toContain('not a valid CODEMETA document')
  })

  it('supports --cff-version', () => {
    const {stdout} = run(['convert', '--to', 'cff', '--cff-version', '1.1.0', codemetaSource, '-'])
    expect(stdout).toContain('cff-version: 1.1.0')
  })
})

describe('init subcommand', () => {
  it('scaffolds from a package.json and self-checks the result', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'my-tool',
          description: 'A tool.',
          version: '1.0.0',
          license: 'MIT',
          author: 'Ada Lovelace <ada@example.org>',
          repository: 'https://github.com/org/my-tool'
        }),
        'utf8'
      )
      const {stdout, status} = run(['init', dir])
      expect(status).toBe(0)
      expect(existsSync(path.join(dir, 'CITATION.cff'))).toBe(true)
      expect(existsSync(path.join(dir, 'codemeta.json'))).toBe(true)
      expect(stdout).toContain('2 valid')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('generates minimal placeholders without a package.json', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      const {stdout, stderr, status} = run(['init', dir])
      expect(status).toBe(0)
      expect(stdout).toContain('minimal templates')
      expect(stderr).not.toContain('minimal templates')
      expect(existsSync(path.join(dir, 'CITATION.cff'))).toBe(true)
      expect(readFileSync(path.join(dir, 'codemeta.json'), 'utf8')).toContain('TODO: project title')
      expect(stdout).toContain('VALID')
      expect(stdout).toContain('init/todo-placeholder')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('skips existing files unless --force is given', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      writeFileSync(
        path.join(dir, 'CITATION.cff'),
        'cff-version: 1.2.0\nmessage: keep me\ntitle: keep\nauthors:\n  - name: keep\n',
        'utf8'
      )
      const first = run(['init', dir])
      expect(first.stdout).toContain('Skipped')
      expect(first.stderr).not.toContain('Skipped')
      expect(readFileSync(path.join(dir, 'CITATION.cff'), 'utf8')).toContain('keep me')
      const second = run(['init', '--force', dir])
      expect(second.status).toBe(0)
      expect(readFileSync(path.join(dir, 'CITATION.cff'), 'utf8')).not.toContain('keep me')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('reports an unreadable package.json with exit 2', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      writeFileSync(path.join(dir, 'package.json'), '{broken', 'utf8')
      const {status} = run(['init', dir], {allowFailure: true})
      expect(status).toBe(2)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
