import {describe, expect, it} from 'vitest'
import {readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import {RULE_CATALOG, getRuleInfo, ruleIds} from '../../src/rules.js'

const srcDir = path.resolve(import.meta.dirname, '../../src')

describe('rule catalog', () => {
  it('has unique rule ids', () => {
    const ids = RULE_CATALOG.map((info) => info.rule)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses valid severities and rule id shapes', () => {
    for (const info of RULE_CATALOG) {
      expect(['error', 'warning', 'info']).toContain(info.severity)
      expect(info.rule).toMatch(/^([a-z]+\/[a-z-]+|schema)$/)
      expect(info.description.length).toBeGreaterThan(0)
    }
  })

  it('covers every rule id emitted in the source', () => {
    // Collect quoted rule-id-like string literals from the source tree.
    const emitted = new Set<string>()
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const filePath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          visit(filePath)
        } else if (entry.name.endsWith('.ts')) {
          const content = readFileSync(filePath, 'utf8')
          for (const match of content.matchAll(
            /'(cff|codemeta|schemaorg|crosscheck|discovery|init|convert|lint|io|fetch)\/[a-z-]+'/g
          )) {
            emitted.add((match[0] as string).slice(1, -1))
          }
          if (content.includes("rule: 'schema'")) emitted.add('schema')
        }
      }
    }
    visit(srcDir)
    const catalog = new Set(ruleIds())
    const missing = [...emitted].filter((rule) => !catalog.has(rule))
    expect(missing).toEqual([])
  })

  it('exposes lookups', () => {
    const info = getRuleInfo('cff/missing-license')
    expect(info?.group).toBe('cff')
    expect(info?.severity).toBe('warning')
    expect(getRuleInfo('no/such-rule')).toBeUndefined()
    expect(ruleIds()).toContain('lint/parse')
  })
})
