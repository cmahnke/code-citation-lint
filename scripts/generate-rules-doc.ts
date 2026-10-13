/**
 * Generates `docs/rules.md` from the rule catalog in `src/rules.ts`.
 * Run via `npm run docs:rules`.
 */

import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RULE_CATALOG} from '../src/rules.js'
import type {RuleGroup} from '../src/rules.js'

const OUT = path.resolve(import.meta.dirname, '../docs/rules.md')

const GROUP_TITLES: Record<RuleGroup, string> = {
  cff: 'CFF (CITATION.cff)',
  codemeta: 'CodeMeta (codemeta.json)',
  schemaorg: 'schema.org (software profile)',
  crosscheck: 'Cross-file consistency',
  discovery: 'Directory discovery',
  init: 'Scaffolding (init)',
  convert: 'Conversion',
  general: 'Infrastructure'
}

const GROUP_ORDER = Object.keys(GROUP_TITLES) as RuleGroup[]

function main(): void {
  const lines: string[] = [
    '# Rule catalog',
    '',
    'All rule ids emitted by code-citation-lint, with their default severities.',
    'Severities can be changed and rules disabled via `--rules` (CLI) or the',
    '`rules` option (library) — see [cli.md](cli.md) and [library.md](library.md).',
    ''
  ]
  for (const group of GROUP_ORDER) {
    const entries = RULE_CATALOG.filter((info) => info.group === group)
    if (entries.length === 0) continue
    lines.push(`## ${GROUP_TITLES[group]}`, '', '| Rule | Default | Description |', '|---|---|---|')
    for (const info of entries) {
      lines.push(`| \`${info.rule}\` | ${info.severity} | ${info.description} |`)
    }
    lines.push('')
  }
  lines.push(`Total: ${RULE_CATALOG.length} rule ids.`, '')
  // The file is committed; regenerate after rule changes with `npm run docs:rules`.
  void writeFile(OUT, lines.join('\n'), 'utf8').then(() => {
    console.log(`OK docs/rules.md (${RULE_CATALOG.length} rules)`)
  })
}

main()
