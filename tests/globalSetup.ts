import {existsSync, statSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/**
 * Builds the library before the CLI integration tests run. Skipped when a
 * fresh build is already present (e.g. in CI, where build runs as its own step).
 */
export default function setup(): void {
  const root = path.resolve(import.meta.dirname, '..')
  const cli = path.join(root, 'dist/cli.js')
  const index = path.join(root, 'dist/index.js')
  if (!existsSync(cli) || !existsSync(index)) {
    rebuild(root)
    return
  }
  const newestSource = Math.max(
    mtime(path.join(root, 'src/index.ts')),
    mtime(path.join(root, 'src/cli.ts')),
    mtime(path.join(root, 'src/lint.ts'))
  )
  if (newestSource > mtime(index)) {
    rebuild(root)
  }
}

function rebuild(root: string): void {
  process.stdout.write('[globalSetup] building library...\n')
  execFileSync('npm', ['run', 'build'], {cwd: root, stdio: 'inherit'})
}

function mtime(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}
