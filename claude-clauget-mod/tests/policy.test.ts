import { describe, expect, test } from 'claude-code/testing'

import {
  NO_LIST,
  NO_POLICY,
  blockOf,
  deferVerdictOf,
  describedUnder,
  isAgentOffered,
  isCommandHidden,
  isFronted,
  manualListOf,
  policyFrom,
  policyOf,
  scopedOf,
} from '../hooks/policy'
import type { PolicyInput } from '../hooks/policy'
import { NO_PENDING, NO_USAGE, callCountOf, mergedOf, projectKeyOf, withCall } from '../hooks/usage'
import type { Pending, Usage } from '../hooks/usage'

/**
 * Twelve sessions of history: one server called in the first session only,
 * one called in the last, one tool called in every session, and a project
 * that dispatched `Explore` and never `auditor`.
 *
 * @returns the counters
 */
function history(): Usage {
  let usage = NO_USAGE

  for (let i = 1; i <= 12; i += 1) {
    let pending: Pending = { ...NO_PENDING, project: projectKeyOf('/work'), steps: 30 }

    pending = withCall(pending, callCountOf('Grep', {}, 'engine'))

    if (i === 1) {
      pending = withCall(pending, callCountOf('mcp__stale__a', {}, 'mcp:stale'))
      pending = withCall(pending, callCountOf('Agent', { subagent_type: 'Explore' }, 'engine'))
    }

    if (i === 12) {
      pending = withCall(pending, callCountOf('mcp__fresh__a', {}, 'mcp:fresh'))
    }

    usage = mergedOf(usage, pending, `s${i}`)
  }

  return usage
}

const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  isOn: true,
  sessionId: 'now',
  usage: history(),
  cwd: '/work',
  agents: NO_LIST,
  commands: NO_LIST,
  ...over,
})

const DESCRIBED = { description: 'Does a thing.' }

describe('deferring a provider (T20)', () => {
  test('a server the history says is unused is deferred', () => {
    const { answer, isModDeferred } = describedUnder(policyOf(input()), 'mcp__stale__a', 'mcp:stale', DESCRIBED)

    expect(answer).toEqual({ description: 'Does a thing.', isDeferred: true })
    expect(isModDeferred).toBe(true)
  })

  test('a server used in the last sessions is not', () => {
    expect(deferVerdictOf(policyOf(input()), 'mcp:fresh')).toEqual({ isDeferred: false, why: 'recent' })
    expect(describedUnder(policyOf(input()), 'mcp__fresh__a', 'mcp:fresh', DESCRIBED).answer).toBe(DESCRIBED)
  })

  test('nothing is judged unused before ten sessions of history', () => {
    const short = mergedOf(NO_USAGE, NO_PENDING, 'only')

    expect(deferVerdictOf(policyOf(input({ usage: short })), 'mcp:stale')).toEqual({
      isDeferred: false,
      why: 'history',
    })
  })

  test('the engine\'s tools, this mod\'s and an undescribed one are never deferred', () => {
    const policy = policyOf(input())

    for (const provider of ['engine', 'clauget', '?']) {
      expect(deferVerdictOf(policy, provider).isDeferred).toBe(false)
    }
  })

  test('with the weight of its schemas known, the break-even decides', () => {
    const light = { ...history(), weights: { 'mcp:stale': 10 }, prefix: 100_000 }
    const heavy = { ...history(), weights: { 'mcp:stale': 20_000 }, prefix: 100_000 }

    // 10 tokens in front for 30 steps cost less than one search a dozen sessions
    expect(deferVerdictOf(policyOf(input({ usage: light })), 'mcp:stale')).toEqual({
      isDeferred: false,
      why: 'break-even',
    })
    expect(deferVerdictOf(policyOf(input({ usage: heavy })), 'mcp:stale')).toEqual({
      isDeferred: true,
      why: 'break-even',
    })
  })

  test('the decision does not change during the session, whatever the counters do', () => {
    const usage = history()
    const policy = policyOf(input({ usage }))
    const before = describedUnder(policy, 'mcp__stale__a', 'mcp:stale', DESCRIBED).answer

    // The session calls the server ten times: the counters move, the policy
    // was a snapshot and does not.
    let later = usage

    for (let i = 0; i < 10; i += 1) {
      later = mergedOf(later, withCall(NO_PENDING, callCountOf('mcp__stale__a', {}, 'mcp:stale')), 'now')
    }

    expect(later.providers['mcp:stale']?.calls).toBe(11)
    expect(describedUnder(policy, 'mcp__stale__a', 'mcp:stale', DESCRIBED).answer).toEqual(before)
  })

  test('with the levers off, nothing moves', () => {
    const policy = policyOf(input({ isOn: false }))

    expect(describedUnder(policy, 'mcp__stale__a', 'mcp:stale', DESCRIBED).answer).toBe(DESCRIBED)
    expect(describedUnder(NO_POLICY, 'Grep', 'engine', { ...DESCRIBED, isDeferred: true }).answer.isDeferred).toBe(
      true,
    )
  })
})

describe('what a deferral costs back (T21)', () => {
  test('a provider whose deferral lost is brought back for the next session', () => {
    const lost = { ...history(), broughtBack: ['mcp:stale'] }

    expect(deferVerdictOf(policyOf(input({ usage: lost })), 'mcp:stale')).toEqual({
      isDeferred: false,
      why: 'brought back',
    })
  })
})

describe('the symmetric: in front what serves every session (T22)', () => {
  test('a tool with a high count is put in front when the engine defers it', () => {
    const policy = policyOf(input())

    expect(isFronted(policy, 'Grep')).toBe(true)
    expect(describedUnder(policy, 'Grep', 'engine', { ...DESCRIBED, isDeferred: true }).answer).toEqual({
      description: 'Does a thing.',
      isDeferred: false,
    })
  })

  test('and is never deferred, whatever its provider\'s verdict', () => {
    const usage = history()
    const withStale: Usage = { ...usage, tools: { ...usage.tools, mcp__stale__a: usage.tools['Grep']! } }
    const policy = policyOf(input({ usage: withStale }))

    expect(deferVerdictOf(policy, 'mcp:stale').isDeferred).toBe(true)
    expect(describedUnder(policy, 'mcp__stale__a', 'mcp:stale', DESCRIBED).isModDeferred).toBe(false)
  })
})

describe('agents and commands (T23, T24)', () => {
  test('an agent type this project never dispatched is not offered; a built-in and a used one are', () => {
    const policy = policyOf(input())

    expect(isAgentOffered(policy, 'auditor', 'userSettings')).toBe(false)
    expect(isAgentOffered(policy, 'Explore', 'userSettings')).toBe(true)
    expect(isAgentOffered(policy, 'Plan', 'built-in')).toBe(true)
  })

  test('the hand-kept list wins either way', () => {
    const policy = policyOf(input({ agents: manualListOf('Plan, !auditor') }))

    expect(isAgentOffered(policy, 'Plan', 'built-in')).toBe(false)
    expect(isAgentOffered(policy, 'auditor', 'userSettings')).toBe(true)
  })

  test('a project with little history withdraws nothing by itself', () => {
    const policy = policyOf(input({ cwd: '/elsewhere' }))

    expect(isAgentOffered(policy, 'auditor', 'userSettings')).toBe(true)
  })

  test('a command is hidden only when the person listed it', () => {
    const policy = policyOf(input({ commands: manualListOf('deploy') }))

    expect(isCommandHidden(policy, 'deploy')).toBe(true)
    expect(isCommandHidden(policy, 'clear')).toBe(false)
    expect(isCommandHidden(policyOf(input({ isOn: false, commands: manualListOf('deploy') })), 'deploy')).toBe(false)
  })

  test('the row reads commas, spaces and !names', () => {
    expect(manualListOf(' a, b  !c,,')).toEqual({ hide: ['a', 'b'], keep: ['c'] })
    expect(manualListOf(undefined)).toEqual({ hide: [], keep: [] })
  })
})

describe('the instruction files in scope (T25)', () => {
  const files = [
    { path: 'C:/Users/x/.claude/CLAUDE.md', kind: 'user' },
    { path: 'C:/work/CLAUDE.md', kind: 'project' },
    { path: 'C:/work/app/CLAUDE.md', kind: 'project' },
    { path: 'C:/other/CLAUDE.md', kind: 'project' },
    { path: 'C:/other/rules.md', kind: 'project', parent: 'C:/work/CLAUDE.md' },
  ]

  test('a project file outside the working directory\'s ancestry is left out', () => {
    const { kept, dropped } = scopedOf(policyOf(input({ cwd: 'C:\\work\\app' })), files)

    expect(dropped.map(file => file.path)).toEqual(['C:/other/CLAUDE.md'])
    expect(kept.map(file => file.path)).toEqual([
      'C:/Users/x/.claude/CLAUDE.md',
      'C:/work/CLAUDE.md',
      'C:/work/app/CLAUDE.md',
      'C:/other/rules.md',
    ])
  })

  test('a sibling that only shares a prefix is not an ancestor', () => {
    const { dropped } = scopedOf(policyOf(input({ cwd: 'C:/work' })), [
      { path: 'C:/work-old/CLAUDE.md', kind: 'project' },
    ])

    expect(dropped).toHaveLength(1)
  })

  test('with the levers off, every file stays', () => {
    expect(scopedOf(policyOf(input({ isOn: false })), files).dropped).toEqual([])
  })
})

describe('the block that survives compaction (T27)', () => {
  test('two compositions give the same block, under its ceiling', () => {
    const policy = policyOf(input({ agents: manualListOf('auditor') }))
    const first = blockOf(policy, ['C:/other/CLAUDE.md'])
    const second = blockOf(policy, ['C:/other/CLAUDE.md'])

    expect(first).not.toBe(null)
    expect(second).toEqual(first)
    expect(first?.name).toBe('clauget')
    expect(first?.text).toContain('mcp:stale')
    expect(new TextEncoder().encode(first?.text ?? '').length).toBeLessThanOrEqual(600)
  })

  test('a long list is cut to whole lines under the ceiling', () => {
    const usage = history()
    const weights: Record<string, number> = {}

    for (let i = 0; i < 80; i += 1) {
      weights[`mcp:server-number-${i}`] = 50_000
    }

    const block = blockOf(policyOf(input({ usage: { ...usage, weights, prefix: 100_000 } })), ['a'])

    expect(block?.text).toContain('mcp:server-number-0')
    expect(block?.text).toMatch(/\+\d+ more\. /)
    expect(block?.text).toContain('left out: 1')
    expect(new TextEncoder().encode(block?.text ?? '').length).toBeLessThanOrEqual(600)
  })

  test('a policy that decided nothing the model acts on costs no byte', () => {
    expect(blockOf(policyOf(input({ usage: NO_USAGE })), [])).toBe(null)
    expect(blockOf(policyOf(input({ isOn: false })), ['x'])).toBe(null)
    // Withdrawn agents and hidden commands are nothing the model can use.
    expect(
      blockOf(policyOf(input({ usage: NO_USAGE, agents: manualListOf('a, b'), commands: manualListOf('c') })), []),
    ).toBe(null)
  })
})

describe('the discipline: nothing moves after the start (T28)', () => {
  test('a policy is read back for its own session only', () => {
    const policy = policyOf(input())
    const stored = JSON.parse(JSON.stringify(policy))

    expect(policyFrom(stored, 'now')).toEqual(policy)
    expect(policyFrom(stored, 'another')).toBe(null)
    expect(policyFrom(undefined, 'now')).toBe(null)
  })
})
