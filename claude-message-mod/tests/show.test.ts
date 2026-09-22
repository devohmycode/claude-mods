/**
 * A long message in the tab: drawn cut, with the press under it that draws
 * the whole of it and the press that folds it back.
 *
 * The defect this covers is the one a person saw before any of it existed: a
 * thread that cut a message to two lines showed the beginning of a sentence
 * and made them hand the message to Claude to read the end of it — which is
 * the one thing holding the delivery was meant to avoid paying for.
 */

import { describe, expect, mock, test, tier } from 'claude-code/testing'

import { MORE_PREFIX, TAB_ID, TEXTS } from '../hooks/names'

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

/**
 * A message far past the cut, its last word found nowhere else in it: what
 * the tab draws says plainly whether the whole of it is on screen.
 */
const LONG = `${'alpha '.repeat(90)}omega`

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
  scroll: { offset: 0, bodyRows: 24 },
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
 * Answers every call the mod makes, so a test says only what it is about.
 *
 * @param on the test's registrar
 */
function world(on: Parameters<typeof mock.clock>[0]): void {
  mock.clock(on, { now: 1_700_000_000_000 })
  mock.env(on, { USERPROFILE: '/home/g' })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 't-1' }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))

  on('fs.write', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))

  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  on('tool.list', () => ({ value: [] }))
  on('session.receive', (_$, e) => ({ text: e.text }))
}

describe('a long message', () => {
  test('is drawn cut, with a press under it that says what it hides', async ($, on) => {
    world(on)

    await $.session.start(START)
    await $.session.receive({ origin: { kind: 'peer' }, text: wrapped(LONG) })
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    // The beginning is on screen and the end is not, which is what a cut is.
    expect(await ui.find({ text: /alpha/ })).toBeDefined()
    expect(await ui.find({ text: /omega/ })).toBeUndefined()

    const more = await ui.find({ type: 'Button', text: /Show more/ })

    expect(more).toBeDefined()
    expect(more?.key?.startsWith(MORE_PREFIX)).toBe(true)
    // The figure carries its unit, as every figure this mod draws does.
    expect(more?.text).toMatch(/\+\d+ characters/)

    await ui.unmount()
  })

  test('the press draws the whole of it, and the next press folds it back', async ($, on) => {
    world(on)

    await $.session.start(START)
    await $.session.receive({ origin: { kind: 'peer' }, text: wrapped(LONG) })
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    const more = await ui.find({ type: 'Button', text: /Show more/ })

    await ui.press({ key: more?.key ?? '' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /omega/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: TEXTS.showLess })).toBeDefined()

    await ui.press({ key: more?.key ?? '' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /omega/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button', text: /Show more/ })).toBeDefined()

    await ui.unmount()
  })

  test('a short message carries no press at all', async ($, on) => {
    world(on)

    await $.session.start(START)
    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /the capsule is green/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /Show more/ })).toBeUndefined()

    await ui.unmount()
  })

  test('no line of the thread runs past the column it was given', async ($, on) => {
    world(on)

    await $.session.start(START)
    await $.session.receive({ origin: { kind: 'peer' }, text: wrapped(LONG) })
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    const more = await ui.find({ type: 'Button', text: /Show more/ })

    await ui.press({ key: more?.key ?? '' })
    await ui.redraw(PANE)

    // The body is one Text of lines the mod wrapped itself. A line longer
    // than the thread's column is a line the surface would break again, and
    // in a flex row that is what shrinks the column of sessions beside it.
    const body = await ui.find({ type: 'Text', text: /omega/ })
    const lines = (body?.text ?? '').split('\n')

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => line.length <= PANE.bodyColumns)).toBe(true)

    await ui.unmount()
  })
})
