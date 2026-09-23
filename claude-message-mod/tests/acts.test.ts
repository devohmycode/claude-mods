/**
 * The three presses a person makes on the tab, through the pane itself:
 * clearing a thread, dropping one message, and picking which of the held
 * ones goes into the context.
 *
 * Each of these came from the tab being used. **Clear** emptied the thread
 * and took the column and the field with it, so there was nothing left to
 * answer. A message could only be dropped by clearing every one of them. And
 * the held messages piled up with one button over the pile, so a person who
 * wanted one of five in the context had to pay for all five.
 */

import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import {
  CLEAR_KEY,
  COMPOSE_KEY,
  DROP_PREFIX,
  HAND_KEY,
  PICK_PREFIX,
  TAB_ID,
  TEXTS,
} from '../hooks/names'

tier('user')

/**
 * The address a delivery says it came from.
 */
const FROM = 'uds:pipe-cc-msg-2a246fbc'

/**
 * A delivery as a peer's `SendMessage` arrives.
 *
 * @param text the message
 * @returns the delivery
 */
const wrapped = (text: string): string =>
  `<cross-session-message from="${FROM}">${text}</cross-session-message>`

const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

/**
 * The props a docked pane is drawn with.
 */
const PANE = {
  title: 'Message',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

/**
 * What `$.ui.mount` is handed to draw this mod's own pane.
 */
const MOUNT = {
  plugin: 'message',
  surface: 'terminal',
  component: 'Pane',
  requestId: TAB_ID,
} as const

/**
 * A session at a keyboard, in a terminal.
 */
const START = {
  surface: 'terminal',
  isInteractive: true,
  cwd: '/work',
} as const

/**
 * What the world beneath the plugin saw.
 */
type Seen = {
  prompts: string[]
  calls: { to?: string; message?: string }[]
  toasts: string[]
}

/**
 * Answers every call the mod makes, so a test says only what it is about.
 *
 * @param on the test's registrar
 * @returns what the world saw, and its clock
 */
function world(
  on: Parameters<typeof mock.clock>[0],
): { seen: Seen; clock: MockClock } {
  const seen: Seen = { prompts: [], calls: [], toasts: [] }

  const clock = mock.clock(on, { now: 1_700_000_000_000 })

  mock.env(on, { USERPROFILE: '/home/g' })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 't-1' }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))

  on('fs.write', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))

  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })

  on('tool.list', () => ({
    value: [{ name: 'SendMessage', description: '', mcp: false }],
  }))
  on('tool.call', (_$, e) => {
    const args = e as unknown as Record<string, unknown>

    seen.calls.push({
      to: typeof args.to === 'string' ? args.to : undefined,
      message: typeof args.message === 'string' ? args.message : undefined,
    })

    return { result: {} }
  })

  on('prompt.submit', (_$, e) => {
    seen.prompts.push(e.text)

    return { text: e.text }
  })
  on('session.receive', (_$, e) => ({ text: e.text }))

  return { seen, clock }
}

/**
 * Starts a session, takes the messages, and opens the pane on them.
 *
 * @param $ the test's engine
 * @param texts the messages, in the order they arrive
 * @returns the mounted pane
 */
async function opened($: Engine, texts: readonly string[]) {
  await $.session.start(START)

  for (const text of texts) {
    await $.session.receive({ origin: { kind: 'peer' }, text: wrapped(text) })
  }

  await $.command.run({ command: 'message', args: '', ...RUN })

  return $.ui.mount({ ...MOUNT, props: PANE })
}

describe('clearing', () => {
  test('empties the thread and leaves the correspondent to answer', async ($, on) => {
    const { seen, clock } = world(on)

    const ui = await opened($, ['one', 'two'])

    expect(await ui.find({ text: /one/ })).toBeDefined()

    await ui.press({ key: CLEAR_KEY })
    await ui.redraw(PANE)

    // The messages are gone from the screen.
    expect(await ui.find({ text: /one/ })).toBeUndefined()
    expect(await ui.find({ text: new RegExp(TEXTS.emptyThread) })).toBeDefined()

    // And the correspondent is not: still on the column, still selected, and
    // the field is still there to write to them. This is the whole defect.
    expect(await ui.find({ type: 'Button', text: /246fbc/ })).toBeDefined()
    expect(await ui.find({ key: COMPOSE_KEY })).toBeDefined()

    await ui.input({ key: COMPOSE_KEY, text: 'still here' })
    await clock.settle()

    expect(seen.calls).toHaveLength(1)
    expect(seen.calls[0]?.message).toBe('still here')

    await ui.unmount()
  })
})

describe('dropping one message', () => {
  test('takes that one off the screen and leaves the others', async ($, on) => {
    const { seen } = world(on)

    const ui = await opened($, ['alpha', 'beta', 'gamma'])

    const drops = await ui.findAll({ type: 'Button', text: TEXTS.drop })

    // One press per message, and three deliveries in one millisecond are
    // three addresses: without that, dropping one would drop all three.
    expect(drops).toHaveLength(3)
    expect(new Set(drops.map(one => one.key)).size).toBe(3)

    await ui.press({ key: drops[1]?.key ?? '' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /beta/ })).toBeUndefined()
    expect(await ui.find({ text: /alpha/ })).toBeDefined()
    expect(await ui.find({ text: /gamma/ })).toBeDefined()

    // What is held falls with it: a message dropped is one this session
    // decided never to pay for.
    expect(await ui.find({ text: /2 held/ })).toBeDefined()
    expect(seen.toasts).toContain(TEXTS.dropped)

    // And the press says plainly that the mailbox keeps it, because `$.fs`
    // has no delete and this mod never claims otherwise.
    expect(TEXTS.dropped).toContain('mailbox keeps it')

    await ui.unmount()
  })

  test('the key of each press names the message it acts on', async ($, on) => {
    world(on)

    const ui = await opened($, ['alpha', 'beta'])

    const drops = await ui.findAll({ type: 'Button', text: TEXTS.drop })
    const picks = await ui.findAll({ type: 'Button', text: TEXTS.pick })

    expect(drops.every(one => one.key?.startsWith(DROP_PREFIX))).toBe(true)
    expect(picks.every(one => one.key?.startsWith(PICK_PREFIX))).toBe(true)

    await ui.unmount()
  })
})

describe('picking what goes to Claude', () => {
  test('picking nothing hands the pile over, as the button always did', async ($, on) => {
    const { seen, clock } = world(on)

    const ui = await opened($, ['alpha', 'beta', 'gamma'])

    expect((await ui.find({ key: HAND_KEY }))?.text).toContain('(3)')

    await ui.press({ key: HAND_KEY })
    await clock.settle()

    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('alpha')
    expect(seen.prompts[0]).toContain('beta')
    expect(seen.prompts[0]).toContain('gamma')

    await ui.unmount()
  })

  test('picking two hands those two, and the third stays held', async ($, on) => {
    const { seen, clock } = world(on)

    const ui = await opened($, ['alpha', 'beta', 'gamma'])

    const picks = await ui.findAll({ type: 'Button', text: TEXTS.pick })

    await ui.press({ key: picks[0]?.key ?? '' })
    await ui.press({ key: picks[2]?.key ?? '' })
    await ui.redraw(PANE)

    // The button says exactly what it will put in the context, and out of
    // how many — a count on a button that counted something else would be
    // the worst kind of wrong here.
    expect((await ui.find({ key: HAND_KEY }))?.text).toBe(TEXTS.handSome(2, 3))
    expect(
      await ui.find({ type: 'Button', text: TEXTS.picked }),
    ).toBeDefined()

    await ui.press({ key: HAND_KEY })
    await clock.settle()

    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('alpha')
    expect(seen.prompts[0]).toContain('gamma')
    expect(seen.prompts[0]).not.toContain('beta')

    await ui.redraw(PANE)

    // The one nobody picked is still on screen and still out of the
    // context, and the pick is spent.
    expect(await ui.find({ text: /1 held/ })).toBeDefined()
    expect((await ui.find({ key: HAND_KEY }))?.text).toContain('(1)')

    await ui.unmount()
  })

  test('unpicking puts it back in the pile', async ($, on) => {
    world(on)

    const ui = await opened($, ['alpha', 'beta'])

    const picks = await ui.findAll({ type: 'Button', text: TEXTS.pick })

    await ui.press({ key: picks[0]?.key ?? '' })
    await ui.redraw(PANE)

    expect((await ui.find({ key: HAND_KEY }))?.text).toBe(TEXTS.handSome(1, 2))

    await ui.press({ key: picks[0]?.key ?? '' })
    await ui.redraw(PANE)

    expect((await ui.find({ key: HAND_KEY }))?.text).toContain('(2)')

    await ui.unmount()
  })
})
