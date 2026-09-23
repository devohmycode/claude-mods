import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

import { COMPOSE_KEY, HAND_KEY, TAB_ID, TEXTS } from '../hooks/names'

tier('user')

/**
 * What a `/message` run carries beside its arguments: typed in the composer,
 * in a terminal wide enough to dock a pane beside the transcript.
 */
/**
 * The address a delivery says it came from, and the one a reply goes to.
 * Not a real socket: what matters is that the frame carries one.
 */
const FROM = 'uds:pipe-cc-msg-2a246fbc'

/**
 * A delivery as a peer's `SendMessage` arrives: the message, wrapped.
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
 * The props a docked pane is drawn with, the size a wide terminal gives it.
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
 * What the world beneath the plugin did, so a test can read it back.
 */
type Seen = {
  /**
   * The deliveries that reached the bottom of the `session.receive` chain —
   * that is, the ones that were queued and written to the transcript.
   */
  queued: string[]

  /**
   * The files written, by path.
   */
  written: Record<string, string>

  /**
   * The tool calls raised, in order.
   */
  calls: { tool: string; to?: string; message?: string; notify?: boolean }[]

  /**
   * The prompts submitted: the one moment a held message costs something.
   */
  prompts: string[]

  /**
   * The turns started. Nothing this mod does may add to this list except a
   * hand-over, which is a prompt and therefore a turn by definition.
   */
  turns: number

  /**
   * The lines toasted.
   */
  toasts: string[]
}

/**
 * Answers every call the mod makes on the world beneath it, so a test says
 * only what it is about.
 *
 * @param on the test's registrar, whose hooks sit beneath the plugin
 * @param how `tools`, what `$.tool.list()` answers with, and `isWritable`,
 *   whether the mailbox takes a write — one hook per event per module, so a
 *   test that wants a read-only disk says so here rather than registering a
 *   second `fs.write` of its own
 * @returns what the world saw, and the clock beneath the plugin, which a
 *   test moves to let a button's own work finish
 */
function world(
  on: Parameters<typeof mock.clock>[0],
  how: { tools?: readonly string[]; isWritable?: boolean } = {},
): { seen: Seen; clock: MockClock } {
  const tools = how.tools ?? ['SendMessage', 'ListAgents']
  const isWritable = how.isWritable !== false
  const seen: Seen = {
    queued: [],
    written: {},
    calls: [],
    prompts: [],
    turns: 0,
    toasts: [],
  }

  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.env(on, { USERPROFILE: '/home/g' })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 't-1' }))
  on('session.model', () => ({ value: 'claude-opus-5' }))
  on('session.repo', () => ({
    value: { root: '/work/claude-mods', remote: null, internal: false, name: null },
  }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))

  on('fs.write', (_$, e) => {
    if (!isWritable) {
      return { deny: 'read-only' }
    }

    seen.written[e.path] = e.text

    return { value: undefined }
  })
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
    value: tools.map(name => ({ name, description: '', mcp: false })),
  }))
  on('tool.call', (_$, e) => {
    const args = e as unknown as Record<string, unknown>

    seen.calls.push({
      tool: e.tool,
      to: typeof args.to === 'string' ? args.to : undefined,
      message: typeof args.message === 'string' ? args.message : undefined,
      notify: args.notify_when_idle === true,
    })

    return { result: { listing: 'tokenos · banc' } }
  })

  on('prompt.submit', (_$, e) => {
    seen.prompts.push(e.text)

    return { text: e.text }
  })
  on('turn.start', (_$, e) => {
    seen.turns += 1

    return { turnId: e.turnId }
  })

  // The bottom of the `session.receive` chain: what reaches this reached the
  // queue, and therefore the transcript.
  on('session.receive', (_$, e) => {
    seen.queued.push(e.text)

    return { text: e.text }
  })

  return { seen, clock }
}

describe('holding', () => {
  test("a peer's delivery is taken before it is queued, and written first", async ($, on) => {
    const { seen } = world(on)

    await $.session.start(START)

    const result = await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('M5 is green'),
    })

    // The guarantee, and the whole reason this mod exists: the delivery is
    // not queued, so the transcript did not grow by a byte — and it is on
    // disk, so nothing was lost in order to get there.
    expect(result.consumed).toBe(TEXTS.held)
    expect(seen.queued).toEqual([])
    // The engine answers an absolute path of its host's own spelling, so the
    // separators are levelled before the folder is looked for.
    expect(
      Object.keys(seen.written).some(path =>
        path.replace(/\\/g, '/').includes('threads/t-1'),
      ),
    ).toBe(true)
    // Nothing names this address, so the toast calls it by the tail of it —
    // which is still enough to tell two correspondents apart.
    expect(seen.toasts.some(line => line.includes(FROM.slice(-6)))).toBe(true)
    expect(seen.toasts.some(line => line.includes('M5 is green'))).toBe(true)
  })

  test('a delivery the mailbox refuses is queued as it always was', async ($, on) => {
    // The write is denied, and the rule is that what is not written is not
    // taken: a message that was neither kept nor queued would simply be gone.
    const { seen } = world(on, { isWritable: false })

    await $.session.start(START)

    const result = await $.session.receive({
      origin: { kind: 'peer' },
      text: 'the bench is free',
    })

    expect(result.consumed).toBeUndefined()
    expect(seen.queued).toEqual(['the bench is free'])
  })

  test('a session with nobody at the keyboard never holds', async ($, on) => {
    const { seen } = world(on)

    await $.session.start({ ...START, isInteractive: false })

    await $.session.receive({ origin: { kind: 'peer' }, text: 'anyone there' })

    expect(seen.queued).toEqual(['anyone there'])
  })

  test('a task notification is never held: it is work the session waited for', async ($, on) => {
    const { seen } = world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'task-notification' },
      text: 'the build finished',
    })

    expect(seen.queued).toEqual(['the build finished'])
  })

  test('/message hold turns the holding off for the session, and back on', async ($, on) => {
    const { seen } = world(on)

    await $.session.start(START)

    const off = await $.command.run({ command: 'message', args: 'hold', ...RUN })

    expect(off.text).toBe(TEXTS.holdOff)

    await $.session.receive({ origin: { kind: 'peer' }, text: 'first' })

    expect(seen.queued).toEqual(['first'])

    const on_ = await $.command.run({ command: 'message', args: 'hold', ...RUN })

    expect(on_.text).toBe(TEXTS.holdOn)

    await $.session.receive({ origin: { kind: 'peer' }, text: 'second' })

    expect(seen.queued).toEqual(['first'])
  })
})

describe('handing over', () => {
  test('/message hand puts every held message in the context, once', async ($, on) => {
    const { seen, clock } = world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })
    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the worktrees are ready'),
    })

    const handed = await $.command.run({ command: 'message', args: 'hand', ...RUN })

    expect(handed.text).toBe(TEXTS.handing(2))

    // The command left the hand-over to a timer, since the engine refuses a
    // prompt from inside a command's own dispatch.
    await clock.settle()

    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('the capsule is green')
    expect(seen.prompts[0]).toContain('the worktrees are ready')

    // Handed once: a second press has nothing left to pay for.
    const again = await $.command.run({ command: 'message', args: 'hand', ...RUN })

    await clock.settle()

    expect(again.text).toBe(TEXTS.handedNone)
    expect(seen.prompts).toHaveLength(1)
  })

  test('the button hands over the thread on screen', async ($, on) => {
    const { seen, clock } = world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('read me'),
    })

    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ key: HAND_KEY })).toBeDefined()

    await ui.press({ key: HAND_KEY })

    // A press runs the element's own closure, which is not a dispatch: the
    // clock is let settle so that what the press started has finished.
    await clock.settle()

    expect(seen.prompts[0]).toContain('read me')

    await ui.unmount()
  })
})

describe('answering', () => {
  test('a typed answer calls the tool itself and starts no turn', async ($, on) => {
    const { seen, clock } = world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('are you free'),
    })

    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    await ui.input({ key: COMPOSE_KEY, text: 'yes, take the bench' })

    await clock.settle()

    // The point of the field: the message went out through the tool, in this
    // session's own loop, and the model was never asked to write it.
    expect(seen.calls).toEqual([
      {
        tool: 'SendMessage',
        to: FROM,
        message: 'yes, take the bench',
        notify: false,
      },
    ])
    expect(seen.turns).toBe(0)
    expect(seen.prompts).toEqual([])

    await ui.unmount()
  })

  test('a session without SendMessage says so rather than failing quietly', async ($, on) => {
    const { seen, clock } = world(on, { tools: ['Read'] })

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('still there'),
    })

    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    await ui.input({ key: COMPOSE_KEY, text: 'here' })

    await clock.settle()

    expect(seen.calls).toEqual([])
    expect(seen.toasts).toContain(TEXTS.noSendTool)

    await ui.unmount()
  })
})

describe('the tab', () => {
  test('draws the sender, the message and the three figures under it', async ($, on) => {
    world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })

    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /the capsule is green/ })).toBeDefined()
    expect(await ui.find({ text: /1 held/ })).toBeDefined()
    expect(await ui.find({ text: /0 sent without a model turn/ })).toBeDefined()
    expect(await ui.find({ text: /bytes kept out of the transcript/ })).toBeDefined()

    await ui.unmount()
  })

  test('an empty session says where a message would land', async ($, on) => {
    world(on)

    await $.session.start(START)
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /No message yet/ })).toBeDefined()
    expect(await ui.find({ key: COMPOSE_KEY })).toBeUndefined()

    await ui.unmount()
  })
})

describe('the register of recipients', () => {
  test('/message who shows the engine listing rather than parsing it', async ($, on) => {
    world(on)

    await $.session.start(START)

    const { text } = await $.command.run({ command: 'message', args: 'who', ...RUN })

    expect(text).toBe('tokenos · banc')
  })

  test('/message who says so where ListAgents is not mounted', async ($, on) => {
    world(on, { tools: ['SendMessage'] })

    await $.session.start(START)

    const { text } = await $.command.run({ command: 'message', args: 'who', ...RUN })

    expect(text).toBe(TEXTS.noListTool)
  })
})
