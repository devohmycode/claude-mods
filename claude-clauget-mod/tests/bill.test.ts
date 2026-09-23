import { describe, expect, test } from 'claude-code/testing'
import type { SessionContextBreakdown } from 'claude-code'

import { agentProviderOf, billLines, billOf, breakEvenOf, skillProviderOf, verdictText } from '../hooks/bill'
import { NO_INVENTORY, withDescribed } from '../hooks/inventory'
import { NO_PENDING, NO_USAGE, callCountOf, mergedOf, withCall } from '../hooks/usage'

/**
 * A breakdown with something in every field the bill reads.
 *
 * @param over the fields a test changes
 * @returns the breakdown
 */
function breakdownOf(over: Partial<SessionContextBreakdown> = {}): SessionContextBreakdown {
  return {
    categories: [
      { name: 'System prompt', tokens: 60_000, color: 'x', isDeferred: false, kind: 'used' },
      { name: 'MCP tools', tokens: 9_000, color: 'x', isDeferred: false, kind: 'used' },
      { name: 'MCP tools (deferred)', tokens: 4_000, color: 'x', isDeferred: true, kind: 'deferred' },
      { name: 'Free space', tokens: 800_000, color: 'x', isDeferred: false, kind: 'free' },
    ],
    totalTokens: 100_000,
    maxTokens: 1_000_000,
    rawMaxTokens: 1_000_000,
    autocompactSource: 'auto' as never,
    percentage: 10,
    gridRows: [],
    model: 'claude-opus-5',
    memoryFiles: [
      { path: '/home/x/.claude/CLAUDE.md', type: 'User', tokens: 2_000 },
      { path: '/work/CLAUDE.md', type: 'Project', tokens: 3_000 },
    ],
    mcpTools: [
      { name: 'mcp__linear__a', serverName: 'linear', tokens: 5_000, isLoaded: true },
      { name: 'mcp__linear__b', serverName: 'linear', tokens: 4_000, isLoaded: true },
      { name: 'mcp__github__c', serverName: 'github', tokens: 4_000, isLoaded: false },
      { name: 'mcp__cockpit__open', serverName: 'cockpit', tokens: 300, isLoaded: true },
    ],
    agents: [
      { agentType: 'Explore', source: 'built-in', tokens: 200 },
      { agentType: 'clauget:auditor', source: 'plugin', tokens: 150 },
    ],
    slashCommands: { totalCommands: 30, includedCommands: 30, tokens: 900 },
    skills: {
      totalSkills: 2,
      includedSkills: 2,
      tokens: 1_000,
      skillFrontmatter: [
        { name: 'remember', source: 'plugin', pluginName: 'remember', tokens: 400 },
        { name: 'init', source: 'built-in', tokens: 350 },
      ],
    },
    isAutoCompactEnabled: true,
    apiUsage: null,
    ...over,
  }
}

const sum = (lines: readonly { tokens: number }[]) => lines.reduce((total, line) => total + line.tokens, 0)

describe('the bill (T16)', () => {
  test('the lines add up to the breakdown\'s total, the deferred row apart', () => {
    const bill = billOf(breakdownOf(), NO_INVENTORY)

    expect(sum(bill.lines)).toBe(100_000)
    expect(bill.total).toBe(100_000)
    expect(bill.deferred).toBe(4_000)
    expect(bill.overlap).toBe(0)
  })

  test('a schema loaded on demand goes in the deferred column, never in the total', () => {
    const bill = billOf(breakdownOf(), NO_INVENTORY)
    const github = bill.lines.find(line => line.provider === 'mcp:github')

    expect(github?.tokens).toBe(0)
    expect(github?.deferred).toBe(4_000)
    expect(github?.tools).toBe(1)
  })

  test('each detail goes to its provider, and names the field it came from', () => {
    const bill = billOf(breakdownOf(), NO_INVENTORY)
    const by = (provider: string) => bill.lines.find(line => line.provider === provider)

    expect(by('mcp:linear')).toMatchObject({ tokens: 9_000, tools: 2, sources: ['mcpTools'] })
    expect(by('instructions')).toMatchObject({ tokens: 5_000, files: 2, sources: ['memoryFiles'] })
    expect(by('clauget')).toMatchObject({ tokens: 150, agents: 1, sources: ['agents'] })
    expect(by('remember')).toMatchObject({ tokens: 400, skills: 1, sources: ['skills'] })
    expect(by('engine')?.sources).toContain('totalTokens')
  })

  test('the rest of the total is the engine\'s, and says so', () => {
    const bill = billOf(breakdownOf(), NO_INVENTORY)
    // 9 300 in front + 350 agents + 1 000 skills + 900 commands + 5 000 files
    const claimed = 9_300 + 350 + 1_000 + 900 + 5_000

    expect(bill.rest).toBe(100_000 - claimed)
  })

  test('a tool the engine described is billed to that provider, not to the server name', () => {
    const inventory = withDescribed(NO_INVENTORY, 'mcp__cockpit__open', { plugin: 'cockpit', tier: 'user' }, false)
    const bill = billOf(breakdownOf(), inventory)

    expect(bill.lines.find(line => line.provider === 'cockpit')?.tokens).toBe(300)
    expect(bill.lines.find(line => line.provider === 'mcp:cockpit')).toBeUndefined()
  })

  test('details past the total are reported, never a negative rest', () => {
    const bill = billOf(breakdownOf({ totalTokens: 10_000 }), NO_INVENTORY)

    expect(bill.rest).toBe(0)
    expect(bill.overlap).toBe(16_550 - 10_000)
  })

  test('who provides an agent type and a skill listing', () => {
    expect(agentProviderOf('clauget:auditor', 'plugin')).toBe('clauget')
    expect(agentProviderOf('Explore', 'built-in')).toBe('engine')
    expect(agentProviderOf('mine', 'userSettings')).toBe('userSettings')
    expect(skillProviderOf('plugin', 'remember')).toBe('remember')
    expect(skillProviderOf('built-in', undefined)).toBe('engine')
  })

  test('the printed bill keeps tokens and calls in two columns', () => {
    const usage = mergedOf(NO_USAGE, withCall(NO_PENDING, callCountOf('x', {}, 'mcp:linear')), 's')
    const lines = billLines(billOf(breakdownOf(), NO_INVENTORY), usage, 'full', 120_000, 30)
    const linear = lines.find(line => line.includes('mcp:linear') && line.includes('tok'))

    expect(lines[0]).toContain('token-count API')
    expect(linear).toContain('9.0k tok (est.)')
    expect(linear).toContain('1 calls in 1 of 1 sessions')
    expect(linear).toContain('[mcpTools]')
  })
})

describe('the break-even of deferring (T17)', () => {
  const base = {
    schemaTokens: 3_000,
    stepsPerSession: 40,
    prefixTokens: 100_000,
    searchTokens: 3_000,
    readRate: 0.1,
  }

  test('a tool used every session is never deferred', () => {
    const even = breakEvenOf({ ...base, pUsed: 1 })

    // 3 000 × 40 × 0.1 = 12 000 against 1 × (10 000 + 3 000) = 13 000
    expect(even.front).toBe(12_000)
    expect(even.deferred).toBe(13_000)
    expect(even.verdict).toBe('front')
  })

  test('a tool used once a month is always deferred', () => {
    const even = breakEvenOf({ ...base, pUsed: 1 / 30 })

    expect(even.deferred).toBeLessThan(even.front)
    expect(even.verdict).toBe('defer')
  })

  test('a deferral that cost more than the front last session is brought back', () => {
    const even = breakEvenOf({ ...base, pUsed: 1 / 30, last: { front: 12_000, deferred: 14_000 } })

    expect(even.verdict).toBe('front')
    expect(even.why).toBe('brought back')
  })

  test('a provider deferred already is not told to defer', () => {
    expect(verdictText('defer', true)).toBe('deferred already, and rightly')
    expect(verdictText('front', true)).toBe('deferred now, in front would be cheaper')
    expect(verdictText('defer', false)).toBe('deferring would be cheaper')

    const lines = billLines(billOf(breakdownOf(), NO_INVENTORY), NO_USAGE, 'full', 100_000, 30)

    expect(lines.find(line => line.startsWith('  mcp:github') && line.includes('→'))).toContain(
      'deferred already',
    )
  })

  test('the multipliers are parameters: another read rate moves the verdict', () => {
    // The daily tool of the first case: in front at 0.1, deferred at 0.2 —
    // 3 000 × 40 × 0.2 = 24 000 against 1 × (20 000 + 3 000) = 23 000.
    expect(breakEvenOf({ ...base, pUsed: 1, readRate: 0.1 }).verdict).toBe('front')
    expect(breakEvenOf({ ...base, pUsed: 1, readRate: 0.2 }).verdict).toBe('defer')
  })
})
