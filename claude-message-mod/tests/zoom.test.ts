import { describe, expect, test, tier } from 'claude-code/testing'

import { isReturning } from '../hooks/zoom'

tier('user')

describe('the pane that stands in for the cockpit', () => {
  test('the person closing it is what brings the cockpit back', () => {
    expect(isReturning(true, 'person')).toBe(true)
  })

  test('a close of this mod’s own is on its way somewhere', () => {
    // `/message` closes it to ask the cockpit for the tab, and a cockpit
    // coming up on its own would meet that request halfway.
    expect(isReturning(true, 'plugin')).toBe(false)
  })

  test('a pane nothing draws any more is gone, not handed back', () => {
    expect(isReturning(true, 'unload')).toBe(false)
  })

  test('a pane the cockpit never stepped aside for owes it nothing', () => {
    // `/message` with no cockpit seated opens the very same pane.
    expect(isReturning(false, 'person')).toBe(false)
  })
})
