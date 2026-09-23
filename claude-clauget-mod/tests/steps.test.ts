import { describe, expect, test } from 'claude-code/testing'

import {
  breakerCapOf,
  effortBelow,
  isBreaking,
  isExploration,
  loopNoteOf,
  loweredEffortOf,
  spawnModelOf,
  switchAskOf,
} from '../hooks/steps'

const OUTPUT = Array.from({ length: 30 }, (_, i) => `test ${i} passed`).join('\n')

describe('the detour trigger takes only what was described (T44)', () => {
  test('a Grep over the whole tree, a Glob over **, a command that walks the tree', () => {
    expect(isExploration('Grep', { pattern: 'x' })).toBe(true)
    expect(isExploration('Grep', { pattern: 'x', path: '.' })).toBe(true)
    expect(isExploration('Glob', { pattern: '**/*.ts' })).toBe(true)
    expect(isExploration('Bash', { command: 'tree -L 3' })).toBe(true)
    expect(isExploration('Bash', { command: 'find . -name "*.md"' })).toBe(true)
    expect(isExploration('Bash', { command: 'ls -laR' })).toBe(true)
  })

  test('and nothing else', () => {
    expect(isExploration('Grep', { pattern: 'x', path: 'src' })).toBe(false)
    expect(isExploration('Glob', { pattern: 'src/*.ts' })).toBe(false)
    expect(isExploration('Bash', { command: 'find src -name x' })).toBe(false)
    expect(isExploration('Bash', { command: 'ls -la' })).toBe(false)
    expect(isExploration('Bash', { command: 'git status && tree' })).toBe(false)
    expect(isExploration('Read', { file_path: '.' })).toBe(false)
  })
})

describe('subagents on a smaller model (T45)', () => {
  const listed = ['Explore', 'clauget:explorer']

  test('a listed type with no model named goes to the smaller model', () => {
    expect(spawnModelOf({ subagentType: 'Explore', fork: false }, listed, 'haiku')).toBe('haiku')
  })

  test('a type left out of the rule keeps the model it asked for', () => {
    expect(spawnModelOf({ subagentType: 'general-purpose', fork: false }, listed, 'haiku')).toBe(null)
  })

  test('a caller that named a model, and a fork, are never moved', () => {
    expect(spawnModelOf({ subagentType: 'Explore', model: 'opus', fork: false }, listed, 'haiku')).toBe(null)
    expect(spawnModelOf({ subagentType: 'Explore', fork: true }, listed, 'haiku')).toBe(null)
  })
})

describe('the loop guard, by identical output (T46)', () => {
  test('the third identical output names the two steps before it', () => {
    let outputs = loopNoteOf({}, OUTPUT, 12).outputs
    const second = loopNoteOf(outputs, OUTPUT, 17)

    outputs = second.outputs

    const third = loopNoteOf(outputs, OUTPUT, 21)

    expect(second.note).toContain('as at step 12:')
    expect(third.note).toContain('as at steps 12 and 17:')
  })

  test('two outputs one byte apart do not trigger', () => {
    const outputs = loopNoteOf({}, OUTPUT, 3).outputs

    expect(loopNoteOf(outputs, `${OUTPUT}.`, 4).note).toBe(null)
    expect(loopNoteOf(outputs, OUTPUT.replace('test 0', 'test 1'), 4).note).toBe(null)
  })

  test('a short output says nothing, however often it comes', () => {
    const outputs = loopNoteOf({}, 'ok', 1).outputs

    expect(loopNoteOf(outputs, 'ok', 2).note).toBe(null)
  })
})

describe('the effort that follows the step (T47)', () => {
  const mechanical = { tools: 2, hasText: false }

  test('after a mechanical step, one notch lower', () => {
    expect(loweredEffortOf({ index: 3, effort: 'high' }, mechanical)).toBe('medium')
    expect(loweredEffortOf({ index: 3, effort: 'max' }, mechanical)).toBe('xhigh')
  })

  test('never two notches, never under low, never a budget in tokens', () => {
    expect(effortBelow('xhigh')).toBe('high')
    expect(effortBelow('low')).toBe(null)
    expect(effortBelow(20_000)).toBe(null)
    expect(effortBelow(undefined)).toBe(null)
  })

  test('never on the first step, never in a subagent, never after a step that wrote text', () => {
    expect(loweredEffortOf({ index: 0, effort: 'high' }, mechanical)).toBe(null)
    expect(loweredEffortOf({ index: 3, effort: 'high', agentId: 'a1' }, mechanical)).toBe(null)
    expect(loweredEffortOf({ index: 3, effort: 'high' }, { tools: 1, hasText: true })).toBe(null)
    expect(loweredEffortOf({ index: 3, effort: 'high' }, null)).toBe(null)
  })
})

describe('the model switch guard (T48)', () => {
  const warm = { prompt_cache_warm: true, context_tokens: 120_000, source: 'command' }

  test('it triggers exactly above the threshold', () => {
    expect(switchAskOf({ ...warm, estimated_cache_write_usd: 0.1 })).toBe(null)
    expect(switchAskOf({ ...warm, estimated_cache_write_usd: 0.1001 })).toContain('120000 tokens')
  })

  test('a cold cache, and a headless switch, pass', () => {
    expect(switchAskOf({ ...warm, prompt_cache_warm: false, estimated_cache_write_usd: 5 })).toBe(null)
    expect(switchAskOf({ ...warm, source: 'sdk', estimated_cache_write_usd: 5 })).toBe(null)
  })
})

describe('the circuit breaker (T49)', () => {
  test('its ceiling is twice the median turn, never under thirty', () => {
    expect(breakerCapOf([])).toBe(30)
    expect(breakerCapOf([3, 5, 8])).toBe(30)
    expect(breakerCapOf([10, 20, 40, 60])).toBe(40)
  })

  test('never under the minimum, never twice a turn, never in a subagent', () => {
    expect(isBreaking({ index: 29 }, 10, false)).toBe(false)
    expect(isBreaking({ index: 30 }, 30, false)).toBe(true)
    expect(isBreaking({ index: 31 }, 30, true)).toBe(false)
    expect(isBreaking({ index: 90, agentId: 'a1' }, 30, false)).toBe(false)
  })
})
