import {describe, expect, it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {discover, lintDirectory, lintDiscovered} from '../../src/fs-io.js'

const root = path.resolve(import.meta.dirname, '../..')
const fixtures = path.resolve(import.meta.dirname, '../fixtures')
const cli = path.join(root, 'dist/cli.js')

function run(args: string[], options: {input?: string; allowFailure?: boolean} = {}): {stdout: string; status: number} {
  try {
    const stdout = execFileSync('node', [cli, ...args], {
      cwd: root,
      input: options.input,
      encoding: 'utf8'
    })
    return {stdout, status: 0}
  } catch (error) {
    const err = error as {status?: number; stdout?: string}
    if (options.allowFailure && typeof err.status === 'number') {
      return {stdout: err.stdout ?? '', status: err.status}
    }
    throw error
  }
}

describe('discovery', () => {
  it('finds files non-recursively', async () => {
    const files = await discover(path.join(fixtures, 'tree/project-a'))
    const names = files.map(file => path.relative(fixtures, file.path)).sort()
    expect(names).toEqual(['tree/project-a/CITATION.cff', 'tree/project-a/codemeta.json'])
  })

  it('finds nested files recursively but skips node_modules and dot dirs', async () => {
    const files = await discover(path.join(fixtures, 'tree'), {recursive: true})
    const names = files.map(file => path.relative(fixtures, file.path)).sort()
    expect(names).toEqual([
      'tree/nested/project-c/codemeta.json',
      'tree/project-a/CITATION.cff',
      'tree/project-a/codemeta.json',
      'tree/project-b/CITATION.cff'
    ])
  })

  it('lints a directory with matching metadata without crosscheck findings', async () => {
    const results = await lintDirectory(path.join(fixtures, 'tree/project-a'))
    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(result.valid).toBe(true)
      expect(result.warnings).toEqual([])
    }
  })

  it('reports no findings when a directory has no metadata files', async () => {
    const results = await lintDirectory(path.join(fixtures, 'tree/nested/project-c/..'), {recursive: false})
    // nested/ has no direct metadata files
    const empty = results.filter(result => result.warnings.some(warning => warning.rule === 'discovery/none-found'))
    expect(empty).toHaveLength(1)
  })

  it('reports cross-file mismatches', async () => {
    const results = await lintDiscovered(
      [
        {path: path.join(fixtures, 'mismatch/codemeta.json')},
        {path: path.join(fixtures, 'mismatch/CITATION.cff')}
      ],
      {}
    )
    expect(results).toHaveLength(2)
    for (const result of results) {
      const rules = [...result.warnings, ...result.infos].map(finding => finding.rule)
      expect(rules).toContain('crosscheck/name-mismatch')
      expect(rules).toContain('crosscheck/version-mismatch')
      expect(rules).toContain('crosscheck/license-mismatch')
      expect(rules).toContain('crosscheck/repository-mismatch')
    }
  })
})

describe('CLI', () => {
  it('lints a single file', () => {
    const {stdout, status} = run([path.join(fixtures, 'cff/valid-1.2.0.cff')])
    expect(status).toBe(0)
    expect(stdout).toContain('CFF 1.2.0 (detected) — VALID')
  })

  it('exits 1 for invalid files and prints findings', () => {
    const {stdout, status} = run([path.join(fixtures, 'cff/invalid-schema.cff')], {allowFailure: true})
    expect(status).toBe(1)
    expect(stdout).toContain('INVALID')
    expect(stdout).toContain('invalid-key')
  })

  it('lints a directory with auto discovery', () => {
    const {stdout, status} = run([path.join(fixtures, 'tree/project-a')])
    expect(status).toBe(0)
    expect(stdout).toContain('CITATION.cff')
    expect(stdout).toContain('codemeta.json')
  })

  it('lints a directory recursively', () => {
    const {stdout} = run(['-r', path.join(fixtures, 'tree')])
    expect(stdout).toContain('nested/project-c/codemeta.json')
  })

  it('excludes node_modules from recursive discovery', () => {
    const {stdout} = run(['-r', path.join(fixtures, 'tree')])
    expect(stdout).not.toContain('node_modules')
  })

  it('emits machine-readable JSON', () => {
    const {stdout} = run(['-f', 'json', path.join(fixtures, 'codemeta/valid-3.0.json')])
    const parsed = JSON.parse(stdout) as {type: string; version: string; valid: boolean}[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.type).toBe('codemeta')
    expect(parsed[0]?.version).toBe('3.0')
    expect(parsed[0]?.valid).toBe(true)
  })

  it('reads from stdin', () => {
    const content = readFileSync(path.join(fixtures, 'cff/valid-1.2.0.cff'), 'utf8')
    const {stdout} = run(['--stdin'], {input: content})
    expect(stdout).toContain('VALID')
  })

  it('supports forcing a version with --version', () => {
    const {stdout, status} = run(
      ['-v', '1.1.0', path.join(fixtures, 'cff/valid-1.2.0.cff')],
      {allowFailure: true}
    )
    expect(status).toBe(1)
    expect(stdout).toContain('cff-version 1.2.0, validating against 1.1.0')
  })

  it('applies --strict to warnings', () => {
    const {status} = run(['-s', path.join(fixtures, 'cff/warnings.cff')], {allowFailure: true})
    expect(status).toBe(1)
  })

  it('applies rule overrides via --rules', () => {
    const {status} = run(
      ['--rules', JSON.stringify({disable: ['cff/missing-license']}), '-s', path.join(fixtures, 'cff/warnings.cff')],
      {allowFailure: true}
    )
    expect(status).toBe(0)
  })

  it('exits 2 for missing paths', () => {
    const {status} = run(['/does/not/exist/at/all'], {allowFailure: true})
    expect(status).toBe(2)
  })

  it('lists supported versions', () => {
    const {stdout} = run(['list-versions'])
    expect(stdout).toContain('1.0.3')
    expect(stdout).toContain('1.2.0')
    expect(stdout).toContain('1.3.0 (draft)')
    expect(stdout).toContain('4.0')
  })

  it('fails cleanly on an unparseable file', () => {
    const {stdout, status} = run([path.join(fixtures, 'cff/invalid-yaml.cff')], {allowFailure: true})
    expect(status).toBe(1)
    expect(stdout).toContain('Invalid YAML')
  })

  it('reports unsupported versions', () => {
    const {stdout, status} = run([path.join(fixtures, 'cff/unsupported-version.cff')], {allowFailure: true})
    expect(status).toBe(1)
    expect(stdout).toContain('Unsupported cff-version 9.9.9')
  })

  it('self-lints the project metadata files', () => {
    const {stdout, status} = run(['codemeta.json', 'CITATION.cff'])
    expect(status).toBe(0)
    expect(stdout).toContain('VALID')
  })
})
