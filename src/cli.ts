#!/usr/bin/env node
import {Command, CommanderError, InvalidArgumentError} from 'commander'
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {lintTarget} from './fs-io.js'
import {lintContent, lintObject, parseDocument} from './lint.js'
import {convertContent, type ConvertTarget} from './convert.js'
import {scaffoldFromPackageJson, minimalScaffold} from './scaffold.js'
import {detectTypeAndVersion} from './detect.js'
import {getVersions, normalizeVersion} from './registry.js'
import {RULE_CATALOG} from './rules.js'
import {stringify} from 'yaml'
import type {Format, LintResult, RuleConfig, Severity} from './types.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  description: string
  version: string
}

interface LintCliOptions {
  type: Format | 'auto'
  version?: string
  recursive: boolean
  format: 'text' | 'json'
  strict: boolean
  stdin: boolean
  quiet: boolean
  crosscheck: boolean
  rules?: RuleConfig
}

interface ConvertCliOptions {
  type: Format | 'auto'
  version?: string
  to: ConvertTarget[]
  codemetaVersion?: string
  cffVersion?: string
  minify: boolean
  quiet: boolean
  rules?: RuleConfig
}

interface InitCliOptions {
  force: boolean
}

function parseType(value: string): Format | 'auto' {
  const normalized = value.toLowerCase()
  if (
    normalized === 'auto' ||
    normalized === 'codemeta' ||
    normalized === 'cff' ||
    normalized === 'schemaorg'
  )
    return normalized
  throw new InvalidArgumentError(
    `Invalid type "${value}". Use "auto", "codemeta", "cff" or "schemaorg".`
  )
}

function parseFormat(value: string): 'text' | 'json' {
  const normalized = value.toLowerCase()
  if (normalized === 'text' || normalized === 'json') return normalized
  throw new InvalidArgumentError(`Invalid format "${value}". Use "text" or "json".`)
}

function parseConvertTarget(value: string): ConvertTarget {
  const normalized = value.toLowerCase()
  if (
    normalized === 'codemeta' ||
    normalized === 'schemaorg' ||
    normalized === 'zenodo' ||
    normalized === 'cff'
  )
    return normalized
  throw new InvalidArgumentError(
    `Invalid conversion target "${value}". Use "codemeta", "schemaorg", "zenodo" or "cff".`
  )
}

function parseConvertTargets(value: string): ConvertTarget[] {
  const targets: ConvertTarget[] = []
  for (const part of value.split(',')) {
    const target = parseConvertTarget(part.trim())
    if (!targets.includes(target)) targets.push(target)
  }
  return targets
}

function parseRules(value: string): RuleConfig {
  try {
    const parsed = JSON.parse(value) as RuleConfig
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed
  } catch {
    // Allow @file references
    if (value.startsWith('@')) {
      try {
        return JSON.parse(readFileSync(value.slice(1), 'utf8')) as RuleConfig
      } catch (fileError) {
        throw new InvalidArgumentError(`Could not read rules file: ${(fileError as Error).message}`)
      }
    }
    throw new InvalidArgumentError(
      `Rules must be JSON (object with "disable" and/or "severities") or an @file reference.`
    )
  }
}

const SEVERITY_ORDER: Record<Severity, number> = {error: 0, warning: 1, info: 2}

function resultToText(result: LintResult, verbose: boolean): string {
  const lines: string[] = []
  const name = result.file ?? '(input)'
  const version = result.version
    ? `${result.type.toUpperCase()} ${result.version}`
    : result.type.toUpperCase()
  const origin =
    result.versionSource === 'specified'
      ? 'specified'
      : result.versionSource === 'detected'
        ? 'detected'
        : 'unknown'
  const status = result.valid ? 'VALID' : 'INVALID'
  lines.push(`${name} — ${version} (${origin}) — ${status}`)
  const findings = [
    ...result.errors.map((item) => ({item, symbol: '✗'})),
    ...result.warnings.map((item) => ({item, symbol: '⚠'})),
    ...result.infos.map((item) => ({item, symbol: 'ℹ'}))
  ].sort((a, b) => SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity])
  for (const {item, symbol} of findings) {
    const location = item.path ? ` ${item.path}` : ''
    const rule = verbose || item.rule !== 'schema' ? ` [${item.rule}]` : ''
    lines.push(`  ${symbol} ${item.severity}${rule}: ${item.message}${location}`)
  }
  if (findings.length === 0) {
    lines.push('  ✓ no findings')
  }
  return lines.join('\n')
}

function summaryText(results: LintResult[]): string {
  const errors = results.reduce((total, result) => total + result.errors.length, 0)
  const warnings = results.reduce((total, result) => total + result.warnings.length, 0)
  const infos = results.reduce((total, result) => total + result.infos.length, 0)
  const valid = results.filter((result) => result.valid).length
  const parts = [`${results.length} document${results.length === 1 ? '' : 's'}`, `${valid} valid`]
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`)
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`)
  if (infos > 0) parts.push(`${infos} info`)
  return parts.join(', ')
}

function buildResultsJson(results: LintResult[]): string {
  return JSON.stringify(
    results.map((result) => ({
      file: result.file,
      type: result.type,
      version: result.version,
      versionSource: result.versionSource,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      infos: result.infos
    })),
    null,
    2
  )
}

function computeExitCode(results: LintResult[], strict: boolean): 0 | 1 | 2 {
  // Empty-directory discovery keeps valid=true but is a usage error for the CLI.
  for (const result of results) {
    const all = [...result.errors, ...result.warnings, ...result.infos]
    if (all.some((item) => item.rule === 'discovery/none-found')) {
      return 2
    }
  }
  let exitCode: 0 | 1 | 2 = 0
  for (const result of results) {
    for (const finding of result.errors) {
      if (finding.rule === 'discovery/none-found') continue
      if (finding.rule.startsWith('io/') || finding.rule.startsWith('fetch/')) {
        exitCode = 2
        continue
      }
      exitCode = Math.max(exitCode, 1) as 0 | 1 | 2
    }
    if (strict && result.warnings.length > 0 && exitCode < 1) {
      exitCode = 1
    }
  }
  return exitCode
}

async function readInput(target: string): Promise<string> {
  if (/^https?:\/\//i.test(target)) {
    const response = await fetch(target)
    if (!response.ok) {
      throw new Error(`Could not fetch ${target}: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  return readFileSync(target, 'utf8')
}

/** Output file name for a conversion target when the output is a directory. */
function outputFileName(target: ConvertTarget): string {
  switch (target) {
    case 'codemeta':
      return 'codemeta.json'
    case 'schemaorg':
      return 'schemaorg.json'
    case 'zenodo':
      return '.zenodo.json'
    case 'cff':
      return 'CITATION.cff'
  }
}

function lintOptionsFrom(options: LintCliOptions | ConvertCliOptions): {
  type?: Format
  version?: string
  rules?: RuleConfig
} {
  return {
    type: options.type === 'auto' ? undefined : options.type,
    version: options.version !== undefined ? normalizeVersion(options.version) : undefined,
    rules: options.rules
  }
}

async function runLint(targets: string[], rawOptions: LintCliOptions): Promise<void> {
  if (rawOptions.stdin && targets.length > 0) {
    console.error('The --stdin option cannot be combined with positional targets.')
    process.exitCode = 2
    return
  }
  if (targets.length === 0 && !rawOptions.stdin) {
    console.error(
      'No targets given. Provide file, directory or URL targets, or use --stdin to read from standard input.'
    )
    console.error('Usage: code-citation-lint lint [options] [targets...]')
    process.exitCode = 2
    return
  }

  let results: LintResult[] = []

  if (rawOptions.stdin) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    const content = Buffer.concat(chunks).toString('utf8')
    results = [lintContent(content, {...lintOptionsFrom(rawOptions), file: '(stdin)'})]
  }

  for (const target of targets) {
    const targetResults = await lintTarget(target, {
      ...lintOptionsFrom(rawOptions),
      recursive: rawOptions.recursive,
      crosscheck: rawOptions.crosscheck
    })
    results = results.concat(targetResults)
  }

  if (!rawOptions.quiet) {
    if (rawOptions.format === 'json') {
      console.log(buildResultsJson(results))
    } else {
      for (const result of results) {
        console.log(resultToText(result, false))
      }
      console.log(`\n${summaryText(results)}`)
    }
  }
  process.exitCode = computeExitCode(results, rawOptions.strict)
}

async function runConvert(
  input: string,
  output: string,
  rawOptions: ConvertCliOptions
): Promise<void> {
  const lintOptions = lintOptionsFrom(rawOptions)
  let content: string
  try {
    content = await readInput(input)
  } catch (error) {
    console.error(`Could not read ${input}: ${(error as Error).message}`)
    process.exitCode = 2
    return
  }

  // Detect the input type: cff inputs convert to codemeta/schema.org/zenodo,
  // codemeta inputs convert to cff.
  const parsedInput = parseDocument(content)
  const inputDocument = parsedInput.document
  if (
    inputDocument === undefined ||
    inputDocument === null ||
    typeof inputDocument !== 'object' ||
    Array.isArray(inputDocument)
  ) {
    console.error(`${input}: ${parsedInput.error ?? 'Could not parse the document.'}`)
    process.exitCode = 1
    return
  }
  const detected = detectTypeAndVersion(inputDocument)
  const inputType = lintOptions.type ?? detected.type
  const toCff = rawOptions.to.includes('cff')
  const toOthers = rawOptions.to.filter((target) => target !== 'cff')
  if (toCff && toOthers.length > 0) {
    console.error(
      `Cannot mix the "cff" target with other targets for ${input}: cff conversions take a codemeta document and produce CITATION.cff.`
    )
    process.exitCode = 2
    return
  }
  if (toCff && inputType !== 'codemeta' && inputType !== 'schemaorg') {
    console.error(
      `${input}: converting to cff requires a codemeta document, but the input was detected as ${String(inputType)}.`
    )
    process.exitCode = 2
    return
  }
  if (!toCff && inputType !== 'cff') {
    console.error(
      `${input}: converting to ${toOthers.join('/')} requires a CFF document, but the input was detected as ${String(inputType)}.`
    )
    process.exitCode = 2
    return
  }

  // The input must be valid before it can be converted
  const inputLint = lintObject(inputDocument, {...lintOptions, type: inputType, file: input})
  if (inputLint.errors.length > 0) {
    console.error(
      `${input}: the document could not be converted because it is not a valid ${inputLint.type.toUpperCase()} document:`
    )
    for (const error of inputLint.errors) {
      console.error(`  ✗ ${error.message}${error.path ? ` ${error.path}` : ''}`)
    }
    process.exitCode = 1
    return
  }

  // Convert all targets, collecting every failure instead of stopping at the first
  const outcomes: {target: ConvertTarget; outcome: ReturnType<typeof convertContent>}[] = []
  const conversionFailures: {message: string; kind: 'io' | 'validation'}[] = []
  for (const target of rawOptions.to) {
    try {
      outcomes.push({
        target,
        outcome: convertContent(content, target, {
          ...lintOptions,
          codemetaVersion: rawOptions.codemetaVersion,
          cffVersion: rawOptions.cffVersion,
          file: input
        })
      })
    } catch (error) {
      conversionFailures.push({
        message: `${input}: could not convert to ${target}: ${(error as Error).message}`,
        kind: 'validation'
      })
    }
  }

  // Fail when any converted document did not pass validation
  for (const {target, outcome} of outcomes) {
    for (const error of outcome.result?.errors ?? []) {
      conversionFailures.push({
        message: `${input}: converted ${target} document did not pass validation — ${error.message}${error.path ? ` ${error.path}` : ''}`,
        kind: 'validation'
      })
    }
  }

  const isStdout = output === '-'
  let outputDir: string | undefined
  if (!isStdout) {
    const trailingSlash = output.endsWith('/') || output.endsWith(path.sep)
    const info = statSync(output, {throwIfNoEntry: false})
    if (info?.isDirectory()) {
      outputDir = output
    } else if (trailingSlash) {
      // A trailing slash always means a directory, even when it does not exist yet.
      outputDir = output
    } else if (info === undefined) {
      if (rawOptions.to.length > 1) {
        if (path.extname(output) !== '') {
          // Do not auto-create surprising directories from file-like typo paths.
          conversionFailures.push({
            message: `Output "${output}" looks like a file, but writing multiple conversion targets requires a directory (or "-" for stdout). Use a directory path or "-" for stdout.`,
            kind: 'io'
          })
        } else {
          // Preserve extensionless created-directory behavior for multiple targets.
          outputDir = output
        }
      }
      // Single targets keep explicit-file behavior for non-existing paths.
    }
    if (outputDir !== undefined) {
      try {
        mkdirSync(outputDir, {recursive: true})
      } catch (error) {
        conversionFailures.push({
          message: `Could not create output directory ${outputDir}: ${(error as Error).message}`,
          kind: 'io'
        })
        outputDir = undefined
      }
    }
  }

  const writeTargets: {target: ConvertTarget; file?: string}[] = outcomes.map(({target}) => ({
    target,
    ...(outputDir !== undefined
      ? {file: path.join(outputDir, outputFileName(target))}
      : isStdout
        ? {}
        : {file: output})
  }))

  // Explicit file output only works for a single target
  if (!isStdout && outcomes.length > 1 && outputDir === undefined) {
    if (
      !conversionFailures.some(
        (failure) => failure.kind === 'io' && failure.message.includes('requires')
      )
    ) {
      conversionFailures.push({
        message:
          'Writing multiple conversion targets requires the output to be a directory (or "-" for stdout).',
        kind: 'io'
      })
    }
  }
  // Avoid writing multiple targets to the same explicit file path.
  const skipFileWrites = !isStdout && outcomes.length > 1 && outputDir === undefined

  const indent = rawOptions.minify ? 0 : 2
  const serialize = (entry: {outcome: ReturnType<typeof convertContent>}): string => {
    const document = entry.outcome.document as Record<string, unknown>
    if (entry.outcome.target === 'cff') {
      // CITATION.cff is YAML
      const header = '# This file was generated by code-citation-lint convert.\n'
      return header + stringify(document, {lineWidth: 0})
    }
    return JSON.stringify(document, null, indent) + '\n'
  }
  for (const {target, file} of writeTargets) {
    const entry = outcomes.find((item) => item.target === target)
    if (entry === undefined) continue
    const serialized = serialize(entry)
    if (file === undefined) {
      if (!rawOptions.quiet && outcomes.length > 1) {
        console.error(`# ${target}`)
      }
      process.stdout.write(serialized)
    } else {
      if (skipFileWrites) continue
      try {
        const dir = path.dirname(file)
        mkdirSync(dir, {recursive: true})
        writeFileSync(file, serialized, 'utf8')
        if (!rawOptions.quiet) {
          console.error(`Wrote ${target} conversion to ${file}`)
        }
      } catch (error) {
        conversionFailures.push({
          message: `Could not write ${file}: ${(error as Error).message}`,
          kind: 'io'
        })
      }
    }
  }

  if (!rawOptions.quiet) {
    for (const {outcome} of outcomes) {
      for (const issue of outcome.issues) {
        console.error(`  ${issue.severity} [${issue.rule}]: ${issue.message}`)
      }
      const result = outcome.result
      if (result === undefined) continue
      const findings = [...result.warnings, ...result.infos]
      for (const finding of findings) {
        console.error(`  ${finding.severity} [${finding.rule}]: ${finding.message}`)
      }
    }
  }

  if (conversionFailures.length > 0) {
    console.error('')
    for (const failure of conversionFailures) {
      console.error(`✗ ${failure.message}`)
    }
    process.exitCode = conversionFailures.some((failure) => failure.kind === 'io') ? 2 : 1
  }
}

/** Writes scaffolded metadata files and self-checks them. */
function runInit(dir: string, options: InitCliOptions): void {
  const packageJsonPath = path.join(dir, 'package.json')
  let scaffold
  if (existsSync(packageJsonPath)) {
    let packageJson: unknown
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    } catch (error) {
      console.error(`Could not read ${packageJsonPath}: ${(error as Error).message}`)
      process.exitCode = 2
      return
    }
    scaffold = scaffoldFromPackageJson(packageJson as Record<string, unknown>)
  } else {
    console.log(
      `No package.json found in ${dir} — generating minimal templates with TODO placeholders.`
    )
    scaffold = minimalScaffold()
  }

  const targets = [
    {file: path.join(dir, 'CITATION.cff'), content: scaffold.cff, label: 'CITATION.cff'},
    {
      file: path.join(dir, 'codemeta.json'),
      content: JSON.stringify(scaffold.codemeta, null, 2) + '\n',
      label: 'codemeta.json'
    }
  ]

  const writeFailures: string[] = []
  for (const target of targets) {
    if (existsSync(target.file) && !options.force) {
      console.log(`Skipped ${target.file} (already exists; use --force to overwrite).`)
      continue
    }
    try {
      const parent = path.dirname(target.file)
      mkdirSync(parent, {recursive: true})
      writeFileSync(target.file, target.content, 'utf8')
      console.log(`Wrote ${target.file}`)
    } catch (error) {
      writeFailures.push(`Could not write ${target.file}: ${(error as Error).message}`)
    }
  }
  if (writeFailures.length > 0) {
    for (const failure of writeFailures) {
      console.error(`✗ ${failure}`)
    }
    process.exitCode = 2
    return
  }

  // Self-check: the generated files should pass our own linters
  const results: LintResult[] = [
    lintContent(scaffold.cff, {type: 'cff', file: 'CITATION.cff'}),
    lintObject(scaffold.codemeta, {type: 'codemeta', file: 'codemeta.json'})
  ]
  if (scaffold.cff.includes('TODO')) {
    results[0]?.warnings.push({
      severity: 'warning',
      rule: 'init/todo-placeholder',
      message:
        'Generated CITATION.cff contains TODO placeholders — please review and update the metadata.'
    })
  }
  if (JSON.stringify(scaffold.codemeta).includes('TODO')) {
    results[1]?.warnings.push({
      severity: 'warning',
      rule: 'init/todo-placeholder',
      message:
        'Generated codemeta.json contains TODO placeholders — please review and update the metadata.'
    })
  }
  const allValid = results.every((result) => result.valid)
  console.log('')
  for (const result of results) {
    console.log(resultToText(result, false))
  }
  console.log(`\n${summaryText(results)}`)
  if (!allValid) {
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  // `lint` is the default command and owns `-v/--version <schema-version>`,
  // so the package version must be handled before commander sees it.
  if (process.argv.length === 3 && (process.argv[2] === '--version' || process.argv[2] === '-V')) {
    console.log(pkg.version)
    return
  }
  const program = new Command().name('code-citation-lint').description(pkg.description)

  const addTypeOption = (command: Command): Command =>
    command.option(
      '-t, --type <type>',
      'document type: auto, codemeta, cff or schemaorg',
      parseType,
      'auto'
    )

  const addVersionOption = (command: Command): Command =>
    command.option('-v, --version <version>', 'force a schema version instead of autodetection')

  const addRulesOption = (command: Command): Command =>
    command.option('--rules <rules>', 'rule configuration as JSON or @file reference', parseRules)

  const addQuietOption = (command: Command): Command =>
    command.option('-q, --quiet', 'suppress output, exit code only', false)

  // Default command: plain invocations without a subcommand are lint runs
  const lint = program
    .command('lint [targets...]', {isDefault: true})
    .description('lint files, directories (auto-discovery), URLs or GitHub repositories')
  addTypeOption(lint)
  addVersionOption(lint)
  addRulesOption(lint)
  addQuietOption(lint)
  lint
    .option('-r, --recursive', 'search directories recursively', false)
    .option('-f, --format <format>', 'output format: text or json', parseFormat, 'text')
    .option('-s, --strict', 'treat warnings as errors (exit code 1)', false)
    .option('--stdin', 'read document from stdin', false)
    .option('--no-crosscheck', 'disable cross-file consistency checks')
    .action(async (targets: string[], rawOptions) => {
      await runLint(targets, rawOptions as LintCliOptions)
    })

  const convert = program
    .command('convert <input> <output>')
    .description(
      'convert CITATION.cff to CodeMeta/schema.org/Zenodo, or codemeta.json to CITATION.cff'
    )
  addTypeOption(convert)
  addVersionOption(convert)
  addRulesOption(convert)
  addQuietOption(convert)
  convert
    .option(
      '--to <targets>',
      'conversion target(s): codemeta, schemaorg, zenodo, cff or a comma-separated list (default: codemeta)',
      parseConvertTargets,
      ['codemeta' as ConvertTarget]
    )
    .option(
      '--codemeta-version <version>',
      'target CodeMeta version for codemeta conversions (default: latest)'
    )
    .option(
      '--cff-version <version>',
      'target CFF version for cff conversions (default: latest released)'
    )
    .option('--minify', 'write minified JSON (ignored for the cff target)', false)
    .action(async (input: string, output: string, rawOptions) => {
      await runConvert(input, output, rawOptions as ConvertCliOptions)
    })

  const initCommand = program
    .command('init [dir]')
    .description('scaffold CITATION.cff and codemeta.json (from package.json when present)')
    .option('--force', 'overwrite existing metadata files', false)
    .action((dir: string | undefined, rawOptions) => {
      runInit(dir ?? process.cwd(), rawOptions as InitCliOptions)
    })

  const listVersions = program
    .command('list-versions')
    .description('list supported schema versions')
    .action(() => {
      console.log('CFF (CITATION.cff):')
      for (const info of getVersions('cff')) {
        console.log(`  ${info.version}${info.status === 'draft' ? ' (draft)' : ''}`)
      }
      console.log('CodeMeta (codemeta.json):')
      for (const info of getVersions('codemeta')) {
        console.log(`  ${info.version}`)
      }
      console.log('schema.org (software profile):')
      for (const info of getVersions('schemaorg')) {
        console.log(`  ${info.version}`)
      }
    })

  const listRules = program
    .command('list-rules')
    .description('list all lint rule ids with their default severities')
    .option('-f, --format <format>', 'output format: text or json', parseFormat, 'text')
    .action((rawOptions: {format: 'text' | 'json'}) => {
      if (rawOptions.format === 'json') {
        console.log(JSON.stringify(RULE_CATALOG, null, 2))
        return
      }
      let currentGroup: string | undefined
      for (const info of RULE_CATALOG) {
        if (info.group !== currentGroup) {
          currentGroup = info.group
          console.log(`${currentGroup}:`)
        }
        console.log(`  ${info.rule} (${info.severity}) — ${info.description}`)
      }
    })

  // Commander argument errors (unknown options, invalid values, missing
  // arguments) throw instead of exiting, so the CLI can use exit code 2
  // consistently. Help/version output is still printed by commander.
  for (const command of [program, lint, convert, initCommand, listVersions, listRules]) {
    command.exitOverride()
  }

  await program.parseAsync()
}

main().catch((error) => {
  // Commander already printed help output and argument errors; only map the exit code.
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2
    return
  }
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
