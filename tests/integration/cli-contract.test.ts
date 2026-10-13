import {describe, expect, it} from 'vitest'
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
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

describe('lint CLI contract', () => {
  it('exits 2 with usage on stderr when no targets are given', () => {
    const {status, stderr, stdout} = run([], {allowFailure: true})
    expect(status).toBe(2)
    expect(stderr).toContain('No targets')
    expect(stdout).toBe('')
  })

  it('exits 2 for explicit lint with no targets', () => {
    const {status, stderr} = run(['lint'], {allowFailure: true})
    expect(status).toBe(2)
    expect(stderr).toContain('No targets')
  })

  it('rejects --stdin combined with positional targets with exit 2', () => {
    const content = readFileSync(path.join(fixtures, 'cff/valid-1.2.0.cff'), 'utf8')
    const {status, stderr} = run(['--stdin', path.join(fixtures, 'cff/valid-1.2.0.cff')], {
      input: content,
      allowFailure: true
    })
    expect(status).toBe(2)
    expect(stderr).toContain('--stdin')
  })

  it('rejects invalid --format values with exit 2', () => {
    const {status, stderr} = run(['-f', 'yaml', path.join(fixtures, 'cff/valid-1.2.0.cff')], {
      allowFailure: true
    })
    expect(status).toBe(2)
    expect(stderr).toContain('Invalid format')
  })

  it('accepts --format case-insensitively', () => {
    const {stdout, status} = run(['-f', 'JSON', path.join(fixtures, 'codemeta/valid-3.0.json')])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as unknown[]
    expect(parsed).toHaveLength(1)
  })

  it('exits 2 for an empty directory but keeps valid semantics', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-empty-'))
    try {
      const text = run([dir], {allowFailure: true})
      expect(text.status).toBe(2)
      expect(text.stdout).toContain('discovery/none-found')
      expect(text.stdout).toContain('discovery/suggest-recursive')
      const json = run(['-f', 'json', dir], {allowFailure: true})
      expect(json.status).toBe(2)
      const parsed = JSON.parse(json.stdout) as {
        valid: boolean
        warnings: {rule: string}[]
        infos: {rule: string}[]
      }[]
      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.valid).toBe(true)
      expect(parsed[0]?.warnings.some((w) => w.rule === 'discovery/none-found')).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})

describe('convert stdout purity and output paths', () => {
  const source = path.join(fixtures, 'convert/source.cff')

  it('keeps single-target stdout pure JSON', () => {
    const {stdout, stderr, status} = run(['convert', source, '-'])
    expect(status).toBe(0)
    expect(() => JSON.parse(stdout)).not.toThrow()
    expect(stdout).not.toContain('# codemeta')
    expect(stdout).not.toContain('Wrote')
    // issues/failures belong on stderr, not stdout
    expect(stderr).not.toContain('"@context"')
  })

  it('moves multi-target "# <target>" markers to stderr', () => {
    const {stdout, stderr, status} = run(['convert', '--to', 'codemeta,schemaorg', source, '-'])
    expect(status).toBe(0)
    expect(stdout).not.toContain('# codemeta')
    expect(stdout).not.toContain('# schemaorg')
    expect(stderr).toContain('# codemeta')
    expect(stderr).toContain('# schemaorg')
    // stdout is only serialized documents (two JSON blobs concatenated)
    expect(stdout).toContain('"@context"')
  })

  it('moves "Wrote ..." messages to stderr for file output', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const file = path.join(dir, 'output.json')
      const {stdout, stderr, status} = run(['convert', source, file])
      expect(status).toBe(0)
      expect(stdout).toBe('')
      expect(stderr).toContain('Wrote')
      expect(existsSync(file)).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('treats trailing-slash paths as directories for multiple targets', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const output = path.join(dir, 'new-out') + '/'
      const {status} = run(['convert', '--to', 'codemeta,schemaorg', source, output])
      expect(status).toBe(0)
      expect(existsSync(path.join(output, 'codemeta.json'))).toBe(true)
      expect(existsSync(path.join(output, 'schemaorg.json'))).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('rejects file-like multi-target outputs with exit 2 and creates nothing surprising', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const output = path.join(dir, 'typo-output.json')
      const {status, stderr} = run(['convert', '--to', 'codemeta,schemaorg', source, output], {
        allowFailure: true
      })
      expect(status).toBe(2)
      expect(stderr).toContain('requires a directory')
      expect(existsSync(output)).toBe(false)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('keeps explicit-file behavior for a single non-existing target', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const file = path.join(dir, 'single.json')
      const {status} = run(['convert', source, file])
      expect(status).toBe(0)
      expect(existsSync(file)).toBe(true)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('fails clearly when multiple targets target an existing file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const file = path.join(dir, 'existing.json')
      writeFileSync(file, '{}\n', 'utf8')
      const {status, stderr} = run(['convert', '--to', 'codemeta,schemaorg', source, file], {
        allowFailure: true
      })
      expect(status).toBe(2)
      expect(stderr).toContain('requires the output to be a directory')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})

describe('init messaging and TODO self-check', () => {
  it('prints "No package.json" to stdout and warns about TODO placeholders', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      const {stdout, stderr, status} = run(['init', dir])
      expect(status).toBe(0)
      expect(stdout).toContain('No package.json')
      expect(stderr).not.toContain('No package.json')
      expect(stdout).toContain('init/todo-placeholder')
      expect(stdout).toContain('TODO')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('adds TODO warnings for partial package.json scaffolds', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'partial'}), 'utf8')
      const {stdout, status} = run(['init', dir])
      expect(status).toBe(0)
      expect(stdout).toContain('init/todo-placeholder')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('keeps real errors on stderr', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-init-'))
    try {
      writeFileSync(path.join(dir, 'package.json'), '{broken', 'utf8')
      const {status, stderr} = run(['init', dir], {allowFailure: true})
      expect(status).toBe(2)
      expect(stderr).toContain('Could not read')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  it('writes existing-directory convert outputs inside the directory', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ccl-convert-'))
    try {
      const output = path.join(dir, 'out')
      mkdirSync(output, {recursive: true})
      const source = path.join(fixtures, 'convert/source.cff')
      const {status, stderr} = run(['convert', '--to', 'codemeta', source, output])
      expect(status).toBe(0)
      expect(existsSync(path.join(output, 'codemeta.json'))).toBe(true)
      expect(stderr).toContain('Wrote')
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
