/**
 * The column of sessions, against the engine's own register.
 *
 * Everything here goes through `$.fs`: the mod lists `~/.claude/sessions` and
 * reads one file per session, so a test that answers those two calls is
 * testing the whole path — the names drawn, this session's own name at the
 * head of it, and the button that reads the folder again rather than waiting
 * for the next reading.
 */

import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

import { REFRESH_KEY, ROSTER_MS, TAB_ID, TEXTS } from '../hooks/names'

tier('user')

/**
 * The props this mod's own pane is drawn with.
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
 * What `$.ui.mount` is handed to draw it.
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
 * What a `/message` run carries beside its arguments.
 */
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

/**
 * This session's id, as the world answers `$.session.id()` with.
 */
const SELF = 't-1'

/**
 * One file of the register, as the engine writes it.
 *
 * @param id the session's id
 * @param name what it goes by
 * @param at when it last said so
 * @returns the file's text
 */
const file = (id: string, name: string, at: number): string =>
  JSON.stringify({
    sessionId: id,
    name,
    cwd: `C:\\work\\${name}`,
    messagingSocketPath: `\\\\.\\pipe\\LOCAL\\cc-msg-${id}`,
    nameSource: 'user',
    status: 'idle',
    updatedAt: at,
  })

/**
 * Answers the calls the mod makes, with a register that a test can change
 * under it — which is what the refresh button is for.
 *
 * @param on the test's registrar
 * @param register the files of `~/.claude/sessions`, by name; a test replaces
 *   its contents to stand for a session renamed next door
 * @returns the register, so a test can change it, and the clock
 */
function world(
  on: Parameters<typeof mock.clock>[0],
  register: Record<string, string>,
): { toasts: string[]; clock: MockClock } {
  const toasts: string[] = []

  const clock = mock.clock(on, { now: 1_000 })

  mock.env(on, { USERPROFILE: '/home/g' })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SELF }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))

  on('fs.write', () => ({ value: undefined }))
  on('fs.list', (_$, e) => ({
    value: e.path.includes('sessions')
      ? Object.keys(register).map(name => ({
          name,
          kind: 'file' as const,
          size: 0,
          isLink: false,
        }))
      : [],
  }))
  on('fs.read', (_$, e) => {
    // The engine answers an absolute path in its host's own spelling, so the
    // separators are levelled before the file's name is taken off the end.
    const path = e.path.replace(/\\/g, '/')
    const name = path.slice(path.lastIndexOf('/') + 1)

    return { value: register[name] ?? '' }
  })

  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  on('tool.list', () => ({ value: [] }))
  on('session.receive', (_$, e) => ({ text: e.text }))

  return { toasts, clock }
}

describe('the column', () => {
  test('draws the sessions the register has, by the name they go by', async ($, on) => {
    const register = {
      '1.json': file(SELF, 'here', 900),
      '2.json': file('t-2', 'test', 900),
      '3.json': file('t-3', 'claude-mods-79', 900),
    }

    const { clock } = world(on, register)

    await $.session.start(START)

    // The first reading is a timer of its own, so that a hook never does a
    // read per running session in its own dispatch.
    await clock.settle()

    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /test/ })).toBeDefined()
    expect(await ui.find({ text: /claude-mods-79/ })).toBeDefined()

    await ui.unmount()
  })

  test('says which session this is, by the name another one would write to', async ($, on) => {
    const { clock } = world(on, {
      '1.json': file(SELF, 'thisone', 900),
      '2.json': file('t-2', 'test', 900),
    })

    await $.session.start(START)
    await clock.settle()
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /you · thisone/ })).toBeDefined()

    // At the head of the column and nowhere else: a row is a Button, and
    // this session is not one of its own correspondents.
    expect(await ui.findAll({ type: 'Button', text: /thisone/ })).toEqual([])
    expect(await ui.find({ type: 'Button', text: /test/ })).toBeDefined()

    await ui.unmount()
  })

  test('says so plainly where the register has no row for this session', async ($, on) => {
    const { clock } = world(on, { '2.json': file('t-2', 'test', 900) })

    await $.session.start(START)
    await clock.settle()
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: new RegExp(TEXTS.selfUnknown) })).toBeDefined()

    await ui.unmount()
  })

  test('the button reads the register again, without waiting for the next reading', async ($, on) => {
    const register: Record<string, string> = {
      '1.json': file(SELF, 'here', 900),
      '2.json': file('t-2', 'before', 900),
    }

    const { toasts, clock } = world(on, register)

    await $.session.start(START)
    await clock.settle()
    await $.command.run({ command: 'message', args: '', ...RUN })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /before/ })).toBeDefined()

    // A session next door is renamed.
    register['2.json'] = file('t-2', 'after', 950)

    await ui.press({ key: REFRESH_KEY })
    await clock.settle()
    await ui.redraw(PANE)

    expect(await ui.find({ text: /after/ })).toBeDefined()
    expect(await ui.find({ text: /before/ })).toBeUndefined()

    // A press says what it found, since a reading that changed nothing would
    // otherwise leave the screen exactly as it was.
    expect(toasts).toContain(TEXTS.refreshed(1))

    await ui.unmount()
  })

  test('the reading comes round on its own, too', async ($, on) => {
    const register: Record<string, string> = {
      '1.json': file(SELF, 'here', 900),
      '2.json': file('t-2', 'before', 900),
    }

    const { clock } = world(on, register)

    await $.session.start(START)
    await clock.settle()
    await $.command.run({ command: 'message', args: '', ...RUN })

    register['2.json'] = file('t-2', 'after', 950)

    await clock.advance(ROSTER_MS + 1)

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /after/ })).toBeDefined()

    await ui.unmount()
  })
})
