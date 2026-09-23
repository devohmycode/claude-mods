import { describe, expect, test, tier } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { filled, foundIn, keyOf } from '../hooks/slot'

tier('user')

/**
 * A drawing shaped like the cockpit's: a rail, a rule, the slot, a footer.
 */
const PANE = {
  type: 'Box',
  props: { key: 'cockpit' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Button', props: { key: 'tab:session', label: 'Session' } },
        { type: 'Button', props: { key: 'tab:message', label: 'Message' } },
      ],
    },
    { type: 'Text', children: ['───'] },
    { type: 'Box', props: { key: 'cockpit:body' } },
    { type: 'Text', children: ['footer'] },
  ],
} as unknown as RenderElement

/**
 * A body to put in the slot.
 */
const BODY = {
  type: 'Box',
  props: { key: 'cockpit:body' },
  children: [{ type: 'Text', children: ['the thread'] }],
} as unknown as RenderElement

describe('slot', () => {
  test('a key is read off an element and off nothing else', () => {
    expect(keyOf(PANE)).toBe('cockpit')
    expect(keyOf('a string')).toBeNull()
    expect(keyOf(null)).toBeNull()
    expect(keyOf({ type: 'Box' })).toBeNull()
    expect(keyOf({ type: 'Box', props: { key: 3 } })).toBeNull()
  })

  test('the slot is found however deep it sits', () => {
    expect(foundIn(PANE, 'cockpit:body')).toBeDefined()
    expect(keyOf(foundIn(PANE, 'tab:message'))).toBe('tab:message')
    expect(foundIn(PANE, 'nothing')).toBeNull()
  })

  test('a drawing with no slot says so, which is how a caller knows where it is', () => {
    expect(foundIn({ type: 'Box' } as RenderElement, 'cockpit:body')).toBeNull()
    expect(foundIn(undefined, 'cockpit:body')).toBeNull()
  })

  test('the body goes in the slot and the rest of the drawing is left alone', () => {
    const drawn = filled(PANE, 'cockpit:body', BODY) as unknown as {
      children: unknown[]
    }

    expect(foundIn(drawn, 'cockpit:body')).toBe(BODY)
    expect(foundIn(drawn, 'tab:message')).toBeDefined()

    // The rail is the node it always was: only the path down to the slot is
    // rebuilt, so what the cockpit drew is passed on as it drew it.
    expect(drawn.children[0]).toBe(
      (PANE as unknown as { children: unknown[] }).children[0],
    )
  })

  test('a drawing without the slot comes back as it went in', () => {
    const bare = { type: 'Box', children: [{ type: 'Text' }] } as RenderElement

    expect(filled(bare, 'cockpit:body', BODY)).toBe(bare)
  })
})
