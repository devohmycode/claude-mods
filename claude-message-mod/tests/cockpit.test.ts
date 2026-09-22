/**
 * The tab, seated in a cockpit.
 *
 * A stand-in cockpit is seated beside the mod — an inline plugin that adds
 * the `$.cockpit` noun in its own `engine.create` fold — and the mod is tested
 * through it: the tab it registers, the flag it asks the rail for, and the
 * body it draws into the slot.
 *
 * The stand-in draws nothing itself. It does not need to: what the cockpit
 * drew reaches this mod as the result of `next(e)`, so the drawing beneath is
 * what the test's own bottom hook answers with — once holding the slot, once
 * not, which is the two ways round the two hooks can nest.
 *
 * Two rules were learned writing it, each from the engine's own refusal:
 *
 * 1. **An inline plugin's `register` is read as a module is.** It sees none
 *    of this file's imports or constants, and one that reaches for them fails
 *    with `is not defined`. Every name it uses is spelled inside it.
 * 2. **It may not call through the interface captured in `engine.create`** —
 *    *a hooks module behind the call is not admitted* — so the stand-in keeps
 *    what it saw in variables of its own and answers it from a command.
 */

import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { MockClock, Plugin } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import {
  COCKPIT_RAIL_KEY,
  COMPOSE_KEY,
  HAND_KEY,
  SLOT_KEY,
  TAB_ID,
  TAB_ORDER,
  TAB_TITLE,
} from '../hooks/names'

tier('user')

/**
 * A cockpit that is only what this mod asks of one: the noun, and a memory of
 * what it was handed, which `/seat` reads back.
 */
const COCKPIT: Plugin = {
  name: 'cockpit',
  register: on => {
    let seated = ''
    let isSelected = true
    let isRailed = false
    let hides = 0

    const marks: string[] = []
    const shows: string[] = []

    on('engine.create', async (_$, e, next) => {
      const beneath = await next(e)

      const cockpit = {
        tab: async (tab: { id: string; title: string; order?: number }) => {
          seated = `${tab.id}/${tab.title}/${String(tab.order ?? '')}`
        },
        drop: async () => {
          seated = ''
        },
        show: async (id?: string) => {
          shows.push(id ?? '')
        },
        hide: async () => {
          hides += 1
        },
        mark: async (flag: { id: string; badge: number | 'dot' | null }) => {
          marks.push(String(flag.badge))
        },
        redraw: async () => undefined,
        tabs: async () =>
          seated === ''
            ? []
            : [
                {
                  id: seated.split('/')[0] ?? '',
                  title: seated.split('/')[1] ?? '',
                  order: 40,
                  isSelected,
                  badge: null,
                },
              ],
      }

      return { ...beneath, cockpit }
    })

    // The rail, drawn only where a test asks for it — the file's other tests
    // are about the body and say what the cockpit drew from their own bottom
    // hook. A press needs an element that was really drawn, and the tile is
    // the one address the mod couples to: the cockpit's `tab:` before the
    // tab's own id. Written without JSX, since `h` is a global and the tags
    // come from the table.
    on('ui.render', { component: 'Pane' }, async ($, e, next) => {
      if (!isRailed || e.requestId !== 'cockpit') {
        return next(e)
      }

      const ui = await $.ui.resolve(e)

      return h(
        ui.Box,
        { key: 'cockpit', flexDirection: 'column' },
        h(
          ui.Button,
          { key: 'tab:message', onPress: () => undefined },
          'Message',
        ),
        h(ui.Box, { key: 'cockpit:body', flexDirection: 'column' }),
      ) as never
    })

    on('command.run', { command: 'seat' }, (_$, e) => {
      const asked = e.args.trim()

      if (asked === 'aside') {
        isSelected = false
      }

      if (asked === 'rail') {
        isRailed = true
      }

      return {
        text: `${seated} | ${marks.join(',')} | ${shows.join(',')} | ${hides}`,
      }
    })
  },
}

/**
 * What `test` is handed to seat the stand-in beside the mod.
 */
const SEATED = { plugins: [COCKPIT] } as const

/**
 * The cockpit's own pane: what the mod draws its body into.
 */
const COCKPIT_PANE = 'cockpit'

/**
 * The props that pane is drawn with.
 */
const PANE = {
  title: 'Cockpit',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const

/**
 * What `$.ui.mount` is handed to draw it: the cockpit's drawing, not the
 * mod's, which is the whole point of this file.
 */
const MOUNT = {
  plugin: 'cockpit',
  surface: 'terminal',
  component: 'Pane',
  requestId: COCKPIT_PANE,
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
 * What a command run carries beside its arguments.
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
 * The cockpit's drawing as it reaches this mod when this mod's hook sits
 * outside the cockpit's: a rail, and the slot it left for a foreign tab.
 */
const WITH_SLOT = {
  type: 'Box',
  props: { key: 'cockpit' },
  children: [
    { type: 'Text', children: ['RAIL'] },
    { type: 'Box', props: { key: SLOT_KEY } },
  ],
} as unknown as RenderElement

/**
 * What reaches it when its hook sits inside the cockpit's: the bottom of the
 * chain, since the cockpit has yet to draw.
 */
const WITHOUT_SLOT = { type: 'Box' } as unknown as RenderElement

/**
 * Answers every call the two plugins make on the world beneath them.
 *
 * @param on the test's registrar, whose hooks sit beneath both plugins
 * @param drawn what the bottom of the `ui.render` chain answers for the
 *   cockpit's pane: the cockpit's own drawing where this mod's hook is the
 *   outer one, the bare bottom where it is the inner one
 * @returns the tool calls, the prompts, and the clock
 */
function world(
  on: Parameters<typeof mock.clock>[0],
  drawn: RenderElement = WITH_SLOT,
): {
  calls: { tool: string; to?: string }[]
  prompts: string[]
  opened: string[]
  clock: MockClock
} {
  const calls: { tool: string; to?: string }[] = []
  const prompts: string[] = []
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_700_000_000_000 })

  mock.env(on, { USERPROFILE: '/home/g' })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 't-1' }))
  on('session.model', () => ({ value: 'claude-opus-5' }))
  on('session.repo', () => ({
    value: {
      root: '/work/claude-mods',
      remote: null,
      internal: false,
      name: null,
    },
  }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))

  on('fs.write', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))

  on('ui.open', (_$, e) => {
    opened.push(e.id)

    return { value: undefined }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'Pane' }, () => drawn as never)

  on('tool.list', () => ({
    value: [{ name: 'SendMessage', description: '', mcp: false }],
  }))
  on('tool.call', (_$, e) => {
    const args = e as unknown as Record<string, unknown>

    calls.push({
      tool: e.tool,
      to: typeof args.to === 'string' ? args.to : undefined,
    })

    return { result: {} }
  })

  on('prompt.submit', (_$, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('session.receive', (_$, e) => ({ text: e.text }))

  return { calls, prompts, opened, clock }
}

/**
 * What the stand-in was handed, as `/seat` reports it.
 *
 * @param $ the test's engine
 * @param args what to ask it
 * @returns the tab, the flags, the shows and the times it stepped aside
 */
async function seat(
  $: { command: { run: (input: never) => Promise<{ text?: string }> } },
  args = '',
): Promise<{ tab: string; marks: string; shows: string; hides: string }> {
  const { text } = await $.command.run({
    command: 'seat',
    args,
    ...RUN,
  } as never)

  const [tab = '', marks = '', shows = '', hides = ''] = (text ?? '').split(
    ' | ',
  )

  return { tab, marks, shows, hides }
}

describe('seated in a cockpit', () => {
  test('the tab is registered, as three plain fields', SEATED, async ($, on) => {
    world(on)

    await $.session.start(START)

    // A `render` would have been refused outright: an argument that crosses
    // to another plugin's environment must be plain data, and a function is
    // not one. Three fields cross.
    expect((await seat($)).tab).toBe(`${TAB_ID}/${TAB_TITLE}/${TAB_ORDER}`)
  })

  test('a held delivery flags the rail with the number held', SEATED, async ($, on) => {
    world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('one'),
    })
    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('two'),
    })

    expect((await seat($)).marks).toBe('1,2')
  })

  test('/message shows the tab and opens no pane of its own', SEATED, async ($, on) => {
    const { opened } = world(on)

    await $.session.start(START)

    await $.command.run({ command: 'message', args: '', ...RUN })

    expect((await seat($)).shows).toBe(TAB_ID)

    // Two panes for one tab is what a mod that does not look at its host
    // would do.
    expect(opened).toEqual([])
  })

  test('the body goes in the slot, and the rest of the pane is left alone', SEATED, async ($, on) => {
    world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /the capsule is green/ })).toBeDefined()
    expect(await ui.find({ key: COMPOSE_KEY })).toBeDefined()

    // The cockpit's own drawing came through: only the slot was replaced.
    expect(await ui.find({ text: /RAIL/ })).toBeDefined()

    await ui.unmount()
  })

  test('drawn inside the cockpit, the body is returned under the slot key', SEATED, async ($, on) => {
    world(on, WITHOUT_SLOT)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    // Nothing to splice into, so the body is the answer, keyed for the
    // cockpit to find when it draws around it.
    expect(await ui.find({ key: SLOT_KEY })).toBeDefined()
    expect(await ui.find({ text: /the capsule is green/ })).toBeDefined()
    expect(await ui.find({ text: /RAIL/ })).toBeUndefined()

    await ui.unmount()
  })

  test('another tab on screen leaves the pane as the cockpit drew it', SEATED, async ($, on) => {
    world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('the capsule is green'),
    })

    await seat($, 'aside')

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    expect(await ui.find({ text: /RAIL/ })).toBeDefined()
    expect(await ui.find({ text: /the capsule is green/ })).toBeUndefined()

    await ui.unmount()
  })

  test('its buttons and its field work from inside that pane', SEATED, async ($, on) => {
    const { calls, prompts, clock } = world(on)

    await $.session.start(START)

    await $.session.receive({
      origin: { kind: 'peer' },
      text: wrapped('are you free'),
    })

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    // Named, because the field is this mod's and the pane is the cockpit's:
    // an element drawn into another plugin's drawing keeps its own plugin.
    await ui.input({
      plugin: 'message',
      key: COMPOSE_KEY,
      text: 'yes, take the bench',
    })
    await clock.settle()

    expect(calls).toEqual([{ tool: 'SendMessage', to: FROM }])

    await ui.press({ plugin: 'message', key: HAND_KEY })
    await clock.settle()

    expect(prompts[0]).toContain('are you free')

    await ui.unmount()
  })

  test('Enter on the tile steps the cockpit aside for a pane of this mod', SEATED, async ($, on) => {
    const { opened, clock } = world(on)

    await $.session.start(START)
    await seat($, 'rail')

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    await ui.press({ key: COCKPIT_RAIL_KEY })
    await clock.settle()

    // The cockpit steps aside first, because `focus` is a request the surface
    // refuses to a pane opened while another one holds the keys — and a pane
    // without the keyboard is not a way into anything.
    const after = await seat($)

    expect(after.hides).toBe('1')
    expect(opened).toEqual([TAB_ID])

    await ui.unmount()
  })

  test('a press on the tile of a tab that is not the shown one only shows it', SEATED, async ($, on) => {
    const { opened, clock } = world(on)

    await $.session.start(START)
    await seat($, 'rail')
    await seat($, 'aside')

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    await ui.press({ key: COCKPIT_RAIL_KEY })
    await clock.settle()

    // That press is the cockpit's own business: it shows the tab, and this
    // mod has nothing to add until the tile pressed is the one already shown.
    const after = await seat($)

    expect(after.hides).toBe('0')
    expect(opened).toEqual([])

    await ui.unmount()
  })

  test('/message over that pane puts the cockpit back rather than sharing the dock', SEATED, async ($, on) => {
    const { opened, clock } = world(on)

    await $.session.start(START)
    await seat($, 'rail')

    const ui = await $.ui.mount({ ...MOUNT, props: PANE })

    await ui.press({ key: COCKPIT_RAIL_KEY })
    await clock.settle()

    await $.command.run({ command: 'message', args: '', ...RUN })

    // One pane was opened, by the tile; the command closed it and asked the
    // cockpit for the tab, rather than leaving the two of them side by side.
    // Escape comes to the same thing by the pane's own `closeOnEscape`, which
    // the surface answers and no test can press — `isReturning` is where that
    // half is checked.
    expect(opened).toEqual([TAB_ID])
    expect((await seat($)).shows).toBe(TAB_ID)

    await ui.unmount()
  })
})
