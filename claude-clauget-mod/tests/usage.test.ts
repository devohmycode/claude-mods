import { describe, expect, test } from 'claude-code/testing'

import {
  NO_PENDING,
  NO_USAGE,
  callCountOf,
  isEmpty,
  mergedOf,
  usageFrom,
  usagePathOf,
  usageText,
  withCall,
  withStepCounted,
} from '../hooks/usage'

describe('what a call counts toward (T14)', () => {
  test('its provider always', () => {
    expect(callCountOf('Bash', { command: 'ls' }, 'engine')).toEqual({
      tool: 'Bash',
      provider: 'engine',
      agent: null,
      skill: null,
    })
  })

  test('the agent type an Agent call starts, general-purpose when none is named', () => {
    expect(callCountOf('Agent', { subagent_type: 'Explore', prompt: 'x' }, 'engine').agent).toBe('Explore')
    expect(callCountOf('Agent', { prompt: 'x' }, 'engine').agent).toBe('general-purpose')
  })

  test('the skill a Skill call loads', () => {
    expect(callCountOf('Skill', { skill: 'plugin-authoring' }, 'engine').skill).toBe('plugin-authoring')
    expect(callCountOf('Read', { skill: 'x' }, 'engine').skill).toBe(null)
  })
})

describe('the counters on disk (T14)', () => {
  test('each call goes to its own provider, agent and skill', () => {
    let pending = NO_PENDING

    pending = withCall(pending, callCountOf('Bash', {}, 'engine'))
    pending = withCall(pending, callCountOf('mcp__linear__x', {}, 'mcp:linear'))
    pending = withCall(pending, callCountOf('mcp__linear__y', {}, 'mcp:linear'))
    pending = withCall(pending, callCountOf('Agent', { subagent_type: 'Explore' }, 'engine'))
    pending = withCall(pending, callCountOf('Skill', { skill: 'remember' }, 'engine'))

    const usage = mergedOf(NO_USAGE, pending, 's-1')

    expect(usage.providers['engine']?.calls).toBe(3)
    expect(usage.providers['mcp:linear']?.calls).toBe(2)
    expect(usage.agents['Explore']?.calls).toBe(1)
    expect(usage.skills['remember']?.calls).toBe(1)
    expect(usage.sessions).toBe(1)
  })

  test('the counters survive a restart: written, read back, added to', () => {
    const first = mergedOf(NO_USAGE, withCall(NO_PENDING, callCountOf('Bash', {}, 'engine')), 's-1')
    const reread = usageFrom(usageText(first))

    expect(reread).toEqual(first)

    const second = mergedOf(reread, withCall(NO_PENDING, callCountOf('Bash', {}, 'engine')), 's-2')

    expect(second.sessions).toBe(2)
    expect(second.providers['engine']).toEqual({ calls: 2, sessions: 2, seen: ['s-1', 's-2'] })
  })

  test('a session is counted once, however many times it writes', () => {
    let usage = NO_USAGE

    for (let i = 0; i < 3; i += 1) {
      usage = mergedOf(usage, withCall(NO_PENDING, callCountOf('Bash', {}, 'engine')), 's-1')
    }

    expect(usage.sessions).toBe(1)
    expect(usage.providers['engine']).toEqual({ calls: 3, sessions: 1, seen: ['s-1'] })
  })

  test('two sessions writing in turn keep each other\'s calls', () => {
    const one = withCall(NO_PENDING, callCountOf('Bash', {}, 'engine'))
    let disk = mergedOf(NO_USAGE, one, 'a')

    disk = mergedOf(disk, one, 'b')
    disk = mergedOf(disk, one, 'a')
    disk = mergedOf(disk, one, 'b')

    expect(disk.sessions).toBe(2)
    expect(disk.providers['engine']).toEqual({ calls: 4, sessions: 2, seen: ['a', 'b'] })
  })

  test('steps add up across sessions, for the average a session runs to', () => {
    const pending = withStepCounted(withStepCounted(NO_PENDING))
    const usage = mergedOf(mergedOf(NO_USAGE, pending, 'a'), withStepCounted(NO_PENDING), 'b')

    expect(usage.steps).toBe(3)
    expect(usage.sessions).toBe(2)
  })

  test('a file of another version, or no JSON at all, reads as no counters', () => {
    expect(usageFrom(null)).toEqual(NO_USAGE)
    expect(usageFrom('{')).toEqual(NO_USAGE)
    expect(usageFrom(JSON.stringify({ version: 99, sessions: 4 }))).toEqual(NO_USAGE)
  })

  test('nothing counted is nothing to write', () => {
    expect(isEmpty(NO_PENDING)).toBe(true)
    expect(isEmpty(withStepCounted(NO_PENDING))).toBe(false)
  })

  test('the file lives beside the journals', () => {
    expect(usagePathOf('C:\\Users\\x\\')).toBe('C:/Users/x/.claude/clauget/usage.json')
    expect(usagePathOf('/home/x')).toBe('/home/x/.claude/clauget/usage.json')
  })
})
