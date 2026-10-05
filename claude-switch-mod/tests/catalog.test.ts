import { describe, expect, test } from 'claude-code/testing'

import { choiceOf, dotOf, effortOf, gaugeOf, pickOf, switchedText } from '../hooks'

describe('the catalog', () => {
  test('a model id maps back to its family', async () => {
    expect(choiceOf('claude-opus-5-5')?.key).toBe('opus')
    expect(choiceOf('claude-fable-5-1')?.key).toBe('fable')
    expect(choiceOf('claude-haiku-4-5-20251001')?.hasEffort).toBe(false)
    expect(choiceOf('gpt-6')).toBeUndefined()
    expect(choiceOf(undefined)).toBeUndefined()
  })

  test('only the five levels read as an effort', async () => {
    expect(effortOf('xhigh')).toBe('xhigh')
    expect(effortOf(3)).toBeUndefined()
    expect(effortOf('extreme')).toBeUndefined()
  })

  test('/switch names a model, an effort, or neither', async () => {
    expect(pickOf(' Opus ')).toEqual({ model: expect.objectContaining({ arg: 'opus' }) })
    expect(pickOf('claude-fable-5-1')).toEqual({ model: expect.objectContaining({ key: 'fable' }) })
    expect(pickOf('max')).toEqual({ effort: 'max' })
    expect(pickOf('')).toBeUndefined()
    expect(pickOf('turbo')).toBeUndefined()
  })

  test('the current value has the filled dot', async () => {
    expect(dotOf(true)).toBe('●')
    expect(dotOf(false)).toBe('○')
  })

  test('a level fills as many cells of the gauge as its rank', async () => {
    expect(gaugeOf('low')).toEqual({ filled: '▰', empty: '▱▱▱▱' })
    expect(gaugeOf('max')).toEqual({ filled: '▰▰▰▰▰', empty: '' })
  })

  test('the notification names the value before and after', async () => {
    expect(switchedText('model', 'Opus', 'Sonnet')).toBe('⇄ Modèle Opus → Sonnet')
    expect(switchedText('effort', undefined, 'max')).toBe('⚡ Effort → max')
    expect(switchedText('effort', 'high', 'high')).toBe('⚡ Effort déjà sur high')
  })
})
