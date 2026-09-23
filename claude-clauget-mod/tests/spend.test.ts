import { describe, expect, test, tier } from 'claude-code/testing'

import { NO_SPEND, isSilent, withDispatch, withModelCall, withShown } from '../hooks/spend'

tier('user')

describe('the mod’s own column', () => {
  test('a mod that has done nothing owes the context nothing', () => {
    expect(isSilent(NO_SPEND)).toBe(true)
    expect(NO_SPEND.dispatches).toBe(0)
  })

  test('a model call is counted with what it cost', () => {
    const spend = withModelCall(NO_SPEND, 'fork', {
      model: 'claude-opus-5',
      input: 10,
      output: 40,
      cacheRead: 120_000,
      cacheWrite: 0,
    })

    expect(spend.calls.fork).toBe(1)
    expect(spend.tokens.cacheRead).toBe(120_000)
    expect(isSilent(spend)).toBe(false)
  })

  test('a call whose cost the engine never reported is still a call', () => {
    const spend = withModelCall(NO_SPEND, 'classify', null)

    expect(spend.calls.classify).toBe(1)
    expect(spend.tokens.output).toBe(0)
    expect(isSilent(spend)).toBe(false)
  })

  test('characters put where the model reads are counted as characters', () => {
    const spend = withShown(NO_SPEND, 340)

    expect(spend.shownChars).toBe(340)
    expect(isSilent(spend)).toBe(false)
  })

  test('engine calls are counted, and do not make the mod loud', () => {
    const spend = withDispatch(withDispatch(NO_SPEND), 5)

    expect(spend.dispatches).toBe(6)
    expect(isSilent(spend)).toBe(true)
  })

  test('nothing negative is ever added to a column', () => {
    expect(withShown(NO_SPEND, -10).shownChars).toBe(0)
    expect(withDispatch(NO_SPEND, -3).dispatches).toBe(0)
  })
})
