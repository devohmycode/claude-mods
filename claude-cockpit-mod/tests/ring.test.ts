import { describe, expect, test, tier } from 'claude-code/testing'

import {
  entryOf,
  focusablesOf,
  landingOf,
  railKey,
  ringOf,
} from '../hooks/ring'

tier('user')

/**
 * A pane as the cockpit draws it: the rail of three tabs, the rule, and a
 * list of two rows with a button under it.
 */
const TREE = {
  type: 'Box',
  props: { key: 'cockpit' },
  children: [
    {
      type: 'Box',
      props: {},
      children: [
        { type: 'Button', props: { key: 'tab:session' } },
        { type: 'Button', props: { key: 'tab:files' } },
        { type: 'Button', props: { key: 'tab:tools' } },
      ],
    },
    { type: 'Text', props: {}, children: '───' },
    {
      type: 'Box',
      props: { key: 'cockpit:body' },
      children: [
        { type: 'Button', props: { key: 'pick:file:/w/a.ts' } },
        { type: 'Button', props: { key: 'pick:file:/w/b.ts' } },
        { type: 'Select', props: { key: 'range' } },
        { type: 'Text', props: {}, children: 'a line nobody can focus' },
        { type: 'Input', props: { key: 'ask' } },
      ],
    },
  ],
}

/**
 * The rail the drawing above carries, in rail order.
 */
const IDS = ['session', 'files', 'tools']

describe('ring', () => {
  test('the stops of a drawing are its buttons, inputs and selects, in order', () => {
    expect(focusablesOf(TREE)).toEqual([
      'tab:session',
      'tab:files',
      'tab:tools',
      'pick:file:/w/a.ts',
      'pick:file:/w/b.ts',
      'range',
      'ask',
    ])

    // A drawing with nothing to land on, and the leaves the walk has to step
    // over rather than read: a string child, a node of the engine's own.
    expect(
      focusablesOf({
        type: 'Box',
        props: {},
        children: ['a line', { type: 'engine' }, null],
      }),
    ).toEqual([])
  })

  test('the rail is told from the body by the keys the rail carries', () => {
    const ring = ringOf(focusablesOf(TREE), IDS)

    expect(ring.rail).toEqual(['tab:session', 'tab:files', 'tab:tools'])
    expect(ring.body).toEqual([
      'pick:file:/w/a.ts',
      'pick:file:/w/b.ts',
      'range',
      'ask',
    ])

    // A tab left off the rail by the `/config` row draws no button, and the
    // key of a tab nobody registered is nobody's stop.
    expect(ringOf(focusablesOf(TREE), ['session']).body).toContain('tab:files')
  })

  const ring = ringOf(focusablesOf(TREE), IDS)
  const shown = railKey('files')

  test('a step along the rail stands, and the ends of it wrap', () => {
    // Tab from a tab to the next: nothing to do, and the tab it lands on is
    // shown by the hook that asked.
    expect(landingOf(ring, shown, 'tab:session', 'tab:files')).toBeNull()

    // Past the last tab the surface offers the first thing the tab drew (Tab)
    // or, where the body is empty, one of its own stops.
    expect(landingOf(ring, shown, 'tab:tools', 'pick:file:/w/a.ts')).toBe(
      'tab:session',
    )
    expect(landingOf(ring, shown, 'tab:tools', undefined)).toBe('tab:session')

    // And before the first, where Tab lands on the surface's stops and the up
    // arrow, which never leaves the plugin's own, on the last of them.
    expect(landingOf(ring, shown, 'tab:session', undefined)).toBe('tab:tools')
    expect(landingOf(ring, shown, 'tab:session', 'ask')).toBe('tab:tools')
  })

  test('a rail of one tab keeps the ring where it is', () => {
    const one = ringOf(['tab:session', 'ask'], ['session'])

    expect(landingOf(one, railKey('session'), 'tab:session', 'ask')).toBe(
      'tab:session',
    )
    expect(landingOf(one, railKey('session'), 'tab:session', undefined)).toBe(
      'tab:session',
    )
  })

  test('the ring walks the body it is in, and comes out on the tab shown', () => {
    // Inside the body, every step stands: the arrows and Tab walk the rows of
    // the tab the pane is showing.
    expect(landingOf(ring, shown, 'pick:file:/w/a.ts', 'pick:file:/w/b.ts')).toBeNull()
    expect(landingOf(ring, shown, 'range', 'ask')).toBeNull()

    // Out by the top, the surface offers the last tab of the rail; out by the
    // bottom, the first. Both land on the tab being shown, because landing on
    // a tab shows it and walking out of a list is no reason to change tabs.
    expect(landingOf(ring, shown, 'pick:file:/w/a.ts', 'tab:tools')).toBe(shown)
    expect(landingOf(ring, shown, 'ask', 'tab:session')).toBe(shown)

    // Out by the bottom with Tab, which names one of the surface's own stops:
    // the close mark is not a step between a list and its rail.
    expect(landingOf(ring, shown, 'ask', undefined)).toBe(shown)

    // The tab shown is the one the ring would land on anyway: nothing to do.
    expect(
      landingOf(ring, railKey('tools'), 'pick:file:/w/a.ts', 'tab:tools'),
    ).toBeNull()
  })

  test('a body another plugin drew walks itself', () => {
    // The engine refuses `$.ui.focus` while another plugin's element holds
    // the keyboard, so a guest tab's rows are left to the ring's own order
    // rather than kept where a call that cannot land would strand them.
    const guest = ringOf(focusablesOf(TREE), IDS, false)

    expect(landingOf(guest, shown, 'ask', undefined)).toBeNull()
    expect(landingOf(guest, shown, 'pick:file:/w/a.ts', 'tab:tools')).toBeNull()

    // The rail is still the cockpit's own, and still comes back on itself.
    expect(landingOf(guest, shown, 'tab:tools', undefined)).toBe('tab:session')
  })

  test('Enter on the tab shown is the way in, and only into a tab of ours', () => {
    // The tile of the tab on screen: the ring goes to the first stop it drew.
    expect(entryOf(ring, 'files', 'files')).toBe('pick:file:/w/a.ts')

    // Any other tile shows its tab, and the ring follows the showing.
    expect(entryOf(ring, 'files', 'tools')).toBeNull()

    // A tab another plugin drew is nobody's to enter but its own: the engine
    // refuses `$.ui.focus` on an element this plugin did not draw, so the
    // press goes through whole and the plugin that drew the body answers it.
    const guest = ringOf(focusablesOf(TREE), IDS, false)

    expect(entryOf(guest, 'files', 'files')).toBeNull()

    // And a tab that drew nothing has nothing to enter.
    expect(entryOf(ringOf([railKey('files')], IDS), 'files', 'files')).toBeNull()
  })

  test('a row somebody points at is left alone', () => {
    // A click lands where it was aimed, from anywhere: only the two ends of a
    // row are read as a step off it.
    expect(landingOf(ring, shown, 'tab:files', 'ask')).toBeNull()
    expect(landingOf(ring, shown, 'tab:tools', 'range')).toBeNull()
    expect(landingOf(ring, shown, 'ask', 'pick:file:/w/a.ts')).toBeNull()

    // And a ring that was on nothing of the cockpit's, or on a key the last
    // drawing no longer carries, lands where it is going.
    expect(landingOf(ring, shown, null, 'tab:files')).toBeNull()
    expect(landingOf(ring, shown, 'more:files', undefined)).toBeNull()
  })
})
