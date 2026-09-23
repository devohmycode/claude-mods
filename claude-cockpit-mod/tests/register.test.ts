import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { ConfigValue, On } from 'claude-code'

import { BAND_KEY, PANE_ID, STORE_OPEN_KEY } from '../hooks/names'
import { pickKey } from '../hooks/pick'
import { focusablesOf, railIdOf } from '../hooks/ring'

tier('user')

/**
 * One agent as `$.agent.list()` answers it, for the tests that want a row on
 * the Agents tab.
 */
type Listed = {
  id: string
  type: string
  status: string
  description: string
  parentId?: string
}

/**
 * What a `/cockpit` run carries beside its arguments: typed in the composer,
 * in a terminal wide enough to dock the pane beside the transcript.
 */
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

/**
 * The props a docked cockpit pane is drawn with, the size a wide terminal
 * gives it.
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
 * The props the band above the prompt is drawn with, in a terminal wide
 * enough for the pane to dock beside the transcript.
 */
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 8,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 7 },
  view: {},
} as const

/**
 * What `$.ui.mount` is handed to draw that band.
 */
const BAND_MOUNT = {
  plugin: 'cockpit',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
} as const

/**
 * Answers every call the cockpit makes on the world beneath it, so a test
 * says only what it is about.
 *
 * @param on the test's registrar, whose hooks sit beneath the plugin
 * @param opened the pane ids `$.ui.open` was asked for, in order
 * @param agents the agents `$.agent.list()` answers with, read on every call
 *   so a test can push one in mid-session
 * @param toasts the lines the cockpit toasted, in the order it said them
 * @param store the plugin's store: what it holds before the session starts,
 *   and where its writes land, so a test can seed a resume and read back
 *   what a turn kept
 * @param focused the pane ids the cockpit asked the keyboard for, in order:
 *   `focus` is a request the surface grants or refuses, so what a test can
 *   say is whether the cockpit made it
 * @returns the clock beneath the plugin, for a test that has to let one of
 *   its timers come due (`ui.advance` moves a drawing's frame clock, which is
 *   another clock entirely)
 */
function world(
  on: Parameters<typeof mock.clock>[0],
  opened: string[],
  agents: Listed[] = [],
  toasts: string[] = [],
  store: Record<string, unknown> = {},
  focused: string[] = [],
): MockClock {
  const clock = mock.clock(on)

  // Hand-rolled rather than `mock.store`, which keeps its own object: these
  // tests need to read what the cockpit wrote.
  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)

    if (e.focus === true) {
      focused.push(e.id)
    }

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))

  // The bottom of the chain for the cockpit's own pane. `Pane` is the one
  // component whose instances a plugin opens, so core draws none, and the
  // cockpit's hook asks for what is beneath in case a tab another plugin
  // contributed has drawn its body there.
  on('ui.render', { component: 'Pane' }, () => ({ type: 'Box' }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('agent.list', () => ({ value: agents }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-opus-5' }))
  on('session.turns', () => ({ value: 2 }))
  on('session.id', () => ({ value: 't-1' }))

  return clock
}

/**
 * A context breakdown carrying nothing but the skill listing: the shape has
 * a dozen required fields and the Usage tab reads one of them, so the rest
 * are filled here once rather than in every test that wants a listing.
 *
 * @param skillFrontmatter one entry per listed skill
 * @returns the breakdown, as `$.session.usage({ breakdown })` answers it
 */
function breakdownOf(
  skillFrontmatter: {
    name: string
    source: string
    pluginName?: string
    tokens: number
  }[],
) {
  return {
    categories: [],
    totalTokens: 1_000,
    maxTokens: 1_000_000,
    rawMaxTokens: 1_000_000,
    autocompactSource: 'auto' as const,
    percentage: 1,
    gridRows: [],
    model: 'claude-opus-5',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: true,
    apiUsage: null,
    skills: {
      totalSkills: skillFrontmatter.length,
      includedSkills: skillFrontmatter.length,
      tokens: skillFrontmatter.reduce((sum, one) => sum + one.tokens, 0),
      skillFrontmatter,
    },
  }
}

/**
 * What the menu hands `config.set` beside the value: the row's owner, what
 * it held, and the person's own hand on it.
 *
 * @param value the value the menu is about to write
 * @returns the event's input
 */
const writing = (value: ConfigValue) => ({
  key: 'cockpit.hideTabs',
  value,
  previous: '',
  provider: { plugin: 'cockpit', tier: 'user' as const },
  origin: { kind: 'composer' as const },
})

/**
 * A plugin of somebody else's, contributing one tab the way the `message`
 * mod does: `$.cockpit.tab` from a hook, since a `register` is handed `on`
 * and not `$`.
 *
 * It is here so the `/config` row can be asked about a tab the cockpit never
 * declared, which is the whole reason that row is a line of text rather than
 * one toggle per tab.
 */
const GUEST = {
  name: 'guest',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.cockpit.tab({ id: 'message', title: 'Message', order: 60 })

      return next(e)
    })
  },
}

/**
 * The store key the session of these tests keeps its record under.
 */
const SESSION_KEY = 'cockpit.session.t-1'

describe('register', () => {
  test('/cockpit opens the pane, asks for the keys, and a second one closes it', async ($, on) => {
    const opened: string[] = []
    const focused: string[] = []

    world(on, opened, [], [], {}, focused)

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: '', ...RUN })

    expect(opened).toEqual([PANE_ID])

    // A docked pane is opened beside the transcript without the keyboard
    // unless someone asked for it; typing the command is asking.
    expect(focused).toEqual([PANE_ID])

    const { text } = await $.command.run({ command: 'cockpit', args: '', ...RUN })

    expect(text).toBe('Cockpit closed.')
  })

  test('/cockpit with a tab selects it, and an unknown one says what there is', async ($, on) => {
    world(on, [])

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const known = await $.command.run({ command: 'cockpit', args: 'tools', ...RUN })

    expect(known.text).toContain('Tools')

    const unknown = await $.command.run({ command: 'cockpit', args: 'weather', ...RUN })

    expect(unknown.text).toContain('No tab called weather')
    expect(unknown.text).toContain('session')
  })

  test('the rail draws every tab and a press selects the one pressed', async ($, on) => {
    world(on, [])

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    for (const id of ['session', 'usage', 'stats', 'files', 'tools', 'agents']) {
      expect(await ui.find({ key: `tab:${id}` })).toBeDefined()
    }

    // Which order they sit in is `builtinTabs`' own business, stated in the
    // tabs test where no engine is needed to say it.

    expect((await ui.find({ text: /No file read or written yet/ }))).toBeUndefined()

    await ui.press({ key: 'tab:files' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /No file read or written yet/ })).toBeDefined()

    await ui.unmount()
  })

  test('a file Claude read is listed, and arming it rides the next prompt', async ($, on) => {
    const context: string[] = []

    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))
    on('prompt.submit', (_$, e) => {
      context.push(...(e.context ?? []))

      return { text: e.text }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Read', file_path: '/work/app.ts' })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    expect(await ui.find({ text: /app\.ts/ })).toBeDefined()

    await ui.press({ key: 'arm:/work/app.ts' })

    await $.prompt.submit({
      text: 'what does it do',
      wait: false,
      origin: { kind: 'composer' },
    })

    expect(context.join(' ')).toContain('/work/app.ts')

    await ui.unmount()
  })

  test('a file a shell command touched is listed like one a tool read', async ($, on) => {
    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Bash', command: "sed -n '1,5p' src/app.ts" })
    await $.tool.call({ tool: 'Bash', command: 'printf x > src/out.txt' })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    // The shell spelled both paths from the working directory; the tab lists
    // them where a `Read` of the same file would have put them.
    expect(await ui.find({ key: 'arm:/work/src/app.ts' })).toBeDefined()
    expect(await ui.find({ key: 'arm:/work/src/out.txt' })).toBeDefined()

    await ui.unmount()
  })

  test('a row draws the file from the root, and only what is under it', async ($, on) => {
    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))
    on('session.repo', () => ({
      value: { root: '/work', remote: null, internal: false, name: null },
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' })
    await $.tool.call({ tool: 'Read', file_path: '/elsewhere/vendor.ts' })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    // The head every row of a project shares is the part that says nothing,
    // and the first the column would have spent its cells on.
    expect(await ui.find({ text: /^src\/app\.ts/ })).toBeDefined()
    expect(await ui.find({ text: /\/work\// })).toBeUndefined()

    // A file the root does not hold keeps its path whole.
    expect(await ui.find({ text: /^\/elsewhere\/vendor\.ts/ })).toBeDefined()

    // What the row arms, and what a note would name, is the file itself.
    expect(await ui.find({ key: 'arm:/work/src/app.ts' })).toBeDefined()

    await ui.unmount()
  })

  test('git marks the rows it has something to say about', async ($, on) => {
    const ran: string[][] = []

    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))
    on('session.repo', () => ({
      value: { root: '/work', remote: null, internal: false, name: null },
    }))
    on('process.run', (_$, e) => {
      ran.push([...e.argv])

      // What git answered in this very repository, kept as it spelled it:
      // forward slashes on a Windows host, and a path with a space quoted.
      return {
        value: {
          exitCode: 0,
          stdout:
            ' M claude-cockpit-mod/README.md\n' +
            ' D claude-cockpit-mod/hooks/raster/index.ts\n' +
            'M  tsconfig.json\n' +
            '?? "claude-cockpit-mod/notes brouillon.ts"\n',
          stderr: '',
        },
      }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    for (const path of [
      'claude-cockpit-mod/README.md',
      'claude-cockpit-mod/hooks/raster/index.ts',
      'tsconfig.json',
      'claude-cockpit-mod/notes brouillon.ts',
      'claude-cockpit-mod/hooks/names/names.ts',
    ]) {
      await $.tool.call({ tool: 'Read', file_path: `/work/${path}` })
    }

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(ran[0]).toEqual(['git', 'status', '--porcelain'])

    const letters = (await ui.findAll({ type: 'Text' }))
      .map(one => one.text)
      .filter(text => ['M', 'D', '?', ' '].includes(text))

    // One column per listed file, in the tab's own order: the four git named,
    // and the space of the file it had nothing to say about.
    expect(letters).toEqual(['M', 'D', 'M', '?', ' '])

    await ui.unmount()
  })

  test('an agent is listed with what it runs as, and stays once it is done', async ($, on) => {
    const agents: Listed[] = []

    world(on, [], agents)

    on('agent.spawn', () => {
      agents.push({
        id: 'a1',
        type: 'Explore',
        status: 'running',
        description: 'find the parser',
      })

      return { model: 'claude-opus-5', agentId: 'a1' }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.agent.spawn({
      tool_use_id: 'call:1',
      prompt: 'find the parser',
      description: 'find the parser',
      subagentType: 'Explore',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5',
      background: false,
      fork: false,
    })

    await $.command.run({ command: 'cockpit', args: 'agents', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    expect(await ui.find({ text: /find the parser/ })).toBeDefined()
    expect(await ui.find({ text: /running/ })).toBeDefined()

    // The engine lets the agent go; the tab is the session's record of what
    // ran, so the row stays with the status it ended on.
    agents.splice(0, agents.length, {
      id: 'a1',
      type: 'Explore',
      status: 'completed',
      description: 'find the parser',
    })

    await ui.press({ key: 'tab:session' })
    await ui.press({ key: 'tab:agents' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /completed/ })).toBeDefined()
    expect(await ui.find({ text: /1 agent this session/ })).toBeDefined()

    await ui.unmount()
  })

  test('looking at the Session tab reads the session, before any turn has ended', async ($, on) => {
    let reads = 0

    world(on, [])

    on('session.usage', () => {
      reads += 1

      return {
        value: {
          context: { tokens: 120_000, window: 1_000_000, percent: 12 },
          startedAt: 0,
          rateLimits: [],
          cost: { usd: 1.25 },
        },
      }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    // The pane opens on another tab: nothing has asked the session anything.
    await $.command.run({ command: 'cockpit', args: 'tools', ...RUN })

    expect(reads).toBe(0)

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.press({ key: 'tab:session' })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(reads).toBeGreaterThan(0)
    expect(await ui.find({ text: /claude-opus-5/ })).toBeDefined()
    expect(await ui.find({ text: /12%/ })).toBeDefined()

    // The reading fills the tab; it does not draw a column, since no turn
    // ended to draw one for.
    expect(await ui.find({ text: /No finished turn yet/ })).toBeDefined()

    await ui.unmount()
  })

  test('the file that rode the prompt says so, on its row and in a toast', async ($, on) => {
    const toasts: string[] = []

    world(on, [], [], toasts)

    on('tool.call', () => ({ result: 'ok' }))
    on('prompt.submit', (_$, e) => ({ text: e.text }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Read', file_path: '/work/app.ts' })
    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.press({ key: 'arm:/work/app.ts' })
    await ui.redraw(PANE)

    expect((await ui.find({ key: 'arm:/work/app.ts' }))?.text).toBe('armed')

    await $.prompt.submit({
      text: 'what does it do',
      wait: false,
      origin: { kind: 'composer' },
    })

    await ui.redraw(PANE)

    // The note itself is a context block the person never sees, so the row is
    // where the cockpit owes them the news.
    expect((await ui.find({ key: 'arm:/work/app.ts' }))?.text).toBe('sent ')
    expect(toasts.join(' ')).toContain('/work/app.ts')

    await ui.unmount()
  })

  test('a finished turn writes the session record', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, [], [], [], store)

    on('tool.call', () => ({ result: 'ok' }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Read', file_path: '/work/app.ts' })

    // A record is a turn's work, not a call's: nothing is written yet.
    expect(store[SESSION_KEY]).toBeUndefined()

    await $.turn.complete({
      answer: 'done',
      durationMs: 1_200,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })

    const kept = store[SESSION_KEY] as { files: { path: string }[] }

    expect(kept.files.map(file => file.path)).toEqual(['/work/app.ts'])
  })

  test('a resumed session opens on the files the last one left', async ($, on) => {
    world(on, [], [], [], {
      [SESSION_KEY]: {
        version: 2,
        atMs: 9_000,
        files: [
          {
            path: '/work/resumed.ts',
            reads: 3,
            writes: 0,
            added: 0,
            removed: 0,
            status: null,
            atMs: 5_000,
          },
        ],
        tools: [{ tool: 'Read', calls: 3, ms: 30, failed: 0 }],
        recent: [],
        history: [],
        agents: [],
        ledger: {
          main: {
            turns: 4,
            durationMs: 12_000,
            input: 900,
            output: 2_400,
            cacheRead: 88_000,
            cacheWrite: 7_000,
          },
          agents: {
            turns: 0,
            durationMs: 0,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          models: [
            {
              model: 'claude-opus-5',
              turns: 4,
              input: 900,
              output: 2_400,
              cacheRead: 88_000,
              cacheWrite: 7_000,
            },
          ],
        },
      },
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    // The row is there before this session has called a single tool.
    expect(await ui.find({ key: 'arm:/work/resumed.ts' })).toBeDefined()

    await ui.unmount()
  })
  test('a list longer than the body says how much it is hiding, and shows it', async ($, on) => {
    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    // The pane's body is 24 rows less the rail, the rule and the footer, and
    // one more row is the button's: 19 files fit, and there are 25.
    for (let index = 0; index < 25; index += 1) {
      await $.tool.call({
        tool: 'Read',
        file_path: `/work/f${String(index).padStart(2, '0')}.ts`,
      })
    }

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    expect((await ui.find({ key: 'more:files' }))?.text).toBe('Show more (6)')
    expect(await ui.find({ key: 'arm:/work/f24.ts' })).toBeUndefined()

    await ui.press({ key: 'more:files' })
    await ui.advance(1)
    await ui.redraw(PANE)

    // The whole list is drawn, and the surface scrolls what the body cannot
    // hold; the row that showed it now takes it back.
    expect(await ui.find({ key: 'arm:/work/f24.ts' })).toBeDefined()
    expect((await ui.find({ key: 'more:files' }))?.text).toBe('Show less')

    await ui.press({ key: 'more:files' })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ key: 'arm:/work/f24.ts' })).toBeUndefined()

    await ui.unmount()
  })

  test('the Usage tab draws the plan windows and what is left of them', async ($, on) => {
    world(on, [])

    on('session.usage', () => ({
      value: {
        context: { tokens: 120_000, window: 1_000_000, percent: 12 },
        startedAt: 0,
        rateLimits: [
          {
            kind: 'five_hour',
            percentUsed: 23.5,
            // The mock clock starts at the epoch, so a window that resets two
            // hours from now is one stamped at 02:00 of that first day.
            resetsAt: '1970-01-01T02:00:00.000Z',
          },
          { kind: 'seven_day', percentUsed: 61 },
          {
            kind: 'seven_day_fable',
            percentUsed: 8,
            resetsAt: '1970-01-04T04:00:00.000Z',
          },
        ],
        cost: { usd: 1.25 },
      },
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /Plan limits/ })).toBeDefined()
    expect(await ui.find({ text: /5-hour/ })).toBeDefined()
    expect(await ui.find({ text: /24%/ })).toBeDefined()
    expect(await ui.find({ text: /2h00m/ })).toBeDefined()

    // A window the engine reported and this was not written against is drawn
    // under its own name rather than dropped.
    expect(await ui.find({ text: /Week · fable/ })).toBeDefined()
    expect(await ui.find({ text: /3d4h/ })).toBeDefined()

    // A window with no reset says the figure and nothing it was not told.
    expect(await ui.find({ text: /61%/ })).toBeDefined()

    // Each one is a bar of how much of it is spent, which is the reading the
    // eye lands on before the figure beside it.
    expect(await ui.find({ text: /█/ })).toBeDefined()

    // And they are no longer on the Session tab, which is the session's and
    // not the account's.
    await $.command.run({ command: 'cockpit', args: 'session', ...RUN })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /Plan limits/ })).toBe(undefined)

    await ui.unmount()
  })

  test('/cockpit host reads the machine, and draws what it read', async ($, on) => {
    const runs: string[][] = []
    let reads = 0

    const clock = world(on, [])

    on('session.usage', () => ({
      value: {
        context: { tokens: 1_000, window: 10_000, percent: 10 },
        startedAt: 0,
        rateLimits: [],
        cost: { usd: 0 },
      },
    }))

    on('process.run', (_$, e) => {
      runs.push([...e.argv])

      // This host answers the Linux probe, as the session's own paths say it
      // would; every other command is one that is not installed here.
      if (e.argv[0] === 'cat' && e.argv[1] === '/proc/stat') {
        reads += 1

        const ticks = reads === 1 ? '100 0 100 800' : '200 0 200 1600'

        return {
          value: {
            exitCode: 0,
            stdout:
              `cpu  ${ticks} 0 0 0 0\n` +
              'MemTotal:       16777216 kB\n' +
              'MemAvailable:    4194304 kB\n',
            stderr: '',
          },
        }
      }

      if (e.argv[0] === 'nvidia-smi') {
        return { value: { exitCode: 0, stdout: '12, 2048, 8192\n', stderr: '' } }
      }

      return { value: { exitCode: 1, stdout: '', stderr: 'not found' } }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'session', ...RUN })

    // Off as the manifest has it: the Session tab is open and no command of
    // anybody else's has run.
    expect(runs).toEqual([])

    const turned = await $.command.run({
      command: 'cockpit',
      args: 'host',
      ...RUN,
    })

    expect(turned.text).toContain('Machine readings on')

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(runs[0]).toEqual(['cat', '/proc/stat', '/proc/meminfo'])
    expect(await ui.find({ text: /Machine/ })).toBeDefined()
    expect(await ui.find({ text: /12\.0G \/ 16\.0G/ })).toBeDefined()
    expect(await ui.find({ text: /vram 25%/ })).toBeDefined()

    // The processor is a share of the time between two readings, so the
    // first draws a dash and the next one draws the figure.
    expect(await ui.find({ text: /^20%$/ })).toBeUndefined()

    await clock.advance(5_000)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^20%$/ })).toBeDefined()

    // The probe that answered is the one it keeps: the others were tried
    // once for the card and never again.
    const asked = runs.filter(argv => argv[0] === 'cat' && argv[1] === '/proc/stat')

    expect(asked).toHaveLength(2)
    expect(runs.filter(argv => argv[0] === 'rocm-smi')).toHaveLength(0)

    await $.command.run({ command: 'cockpit', args: 'host', ...RUN })
    await ui.redraw(PANE)

    // Turned off, the reading goes with it rather than staying on screen as
    // a figure nothing is refreshing.
    expect(await ui.find({ text: /Machine/ })).toBeUndefined()

    await ui.unmount()
  })

  test('a picked row is written out whole in a card under the list', async ($, on) => {
    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))
    on('ui.focus', () => ({}))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({
      tool: 'Write',
      file_path: '/work/src/app.ts',
      content: 'one\ntwo\n',
    })
    await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    // Nothing picked, nothing under the list.
    expect(await ui.find({ text: /^Count/ })).toBeUndefined()

    const key = pickKey('file', '/work/src/app.ts')

    await ui.press({ key })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^Count/ })).toBeDefined()
    expect(await ui.find({ text: /^Kind/ })).toBeDefined()
    expect(await ui.find({ text: /^Path/ })).toBeDefined()
    expect(await ui.find({ text: /^Churn/ })).toBeDefined()

    // The row draws the file from the root; the card is where the file
    // itself is written out.
    expect(await ui.find({ text: /^\/work\/src\/app\.ts/ })).toBeDefined()
    expect(await ui.find({ text: /read 1 \u00b7 written 1/ })).toBeDefined()
    expect(await ui.find({ text: /^\+3 -0/ })).toBeDefined()

    // The same press takes it back.
    await ui.press({ key })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^Count/ })).toBeUndefined()

    // And the focus ring landing on a row picks it without a press, which is
    // what walking the list with Tab comes to.
    await $.ui.focus({
      component: 'Pane',
      requestId: PANE_ID,
      plugin: 'cockpit',
      element: key,
      origin: { kind: 'person' },
    })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^Count/ })).toBeDefined()

    await ui.unmount()
  })

  test('the ring shows the tab it lands on, and a list gives it back', async ($, on) => {
    const clock = world(on, [])

    on('tool.call', () => ({ result: 'ok' }))
    on('ui.focus', () => ({}))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' })

    await $.command.run({ command: 'cockpit', args: 'session', ...RUN })

    // Held: a ring only moves in a pane that has the keyboard.
    const HELD = { ...PANE, isFocused: true } as const

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: HELD,
    })

    /**
     * The ring moving as the person's Tab moves it, and the drawing that
     * follows it.
     *
     * @param element the key the move names
     */
    const move = async (element: string): Promise<void> => {
      await $.ui.focus({
        component: 'Pane',
        requestId: PANE_ID,
        plugin: 'cockpit',
        element,
        origin: { kind: 'person' },
      })

      await clock.advance(1)
      await ui.advance(1)
      await ui.redraw(HELD)
    }

    // Landing on a tab is the whole of showing it: nothing was pressed, and
    // the tab under the ring is the tab on screen.
    await move('tab:files')

    expect(await ui.find({ text: /app\.ts/ })).toBeDefined()

    // The stops the pane drew, told apart the way the cockpit tells them.
    const stops = focusablesOf(await ui.drawn())
    const rail = stops.filter(key => railIdOf(key) !== null)
    const body = stops.filter(key => railIdOf(key) === null)
    const last = rail[rail.length - 1] ?? ''

    expect(rail[0]).toBe('tab:session')
    expect(last).toBe('tab:agents')
    expect(body.length).toBeGreaterThan(0)

    // Out of the list by its top, where the ring's own order offers the last
    // tab of the rail: it lands on the tab being shown instead, since walking
    // out of a list is no reason to show another tab.
    await move(body[0] ?? '')
    await move(last)

    expect(await ui.find({ text: /app\.ts/ })).toBeDefined()
    expect(
      await ui.find({ text: /No agent started this session/ }),
    ).toBeUndefined()

    await ui.unmount()
  })

  test('a picked call is written out with what the list had to cut', async ($, on) => {
    world(on, [])

    on('tool.call', () => ({ result: 'ok' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.tool.call({
      tool: 'Bash',
      command: 'git log --oneline --decorate --graph --all --since="last week"',
    })

    await $.command.run({ command: 'cockpit', args: 'tools', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.press({ key: pickKey('call', '0') })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^Result/ })).toBeDefined()
    expect(await ui.find({ text: /^ok$/ })).toBeDefined()
    expect(await ui.find({ text: /--since="last week"/ })).toBeDefined()

    // A tally is picked the same way, and says what the column could not.
    await ui.press({ key: pickKey('tool', 'Bash') })
    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /^Calls/ })).toBeDefined()
    expect(await ui.find({ text: /^Failed/ })).toBeDefined()

    await ui.unmount()
  })

  test('the band above the prompt opens the pane and closes it again', async ($, on) => {
    const opened: string[] = []
    const focused: string[] = []

    world(on, opened, [], [], {}, focused)

    // The engine draws nothing of its own in the band, and a mounted site
    // still needs an implementation beneath the plugins to answer.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const ui = await $.ui.mount({ ...BAND_MOUNT, props: BAND })

    expect((await ui.find({ key: BAND_KEY }))?.text).toBe('Cockpit')

    await ui.press({ key: BAND_KEY })
    await ui.redraw(BAND)

    // The same toggle the command is: the pane the press opened, the keys
    // asked for with it, and a button that now offers to close it.
    expect(opened).toEqual([PANE_ID])
    expect(focused).toEqual([PANE_ID])
    expect((await ui.find({ key: BAND_KEY }))?.text).toBe('Close')

    await ui.press({ key: BAND_KEY })
    await ui.redraw(BAND)

    expect((await ui.find({ key: BAND_KEY }))?.text).toBe('Cockpit')

    await ui.unmount()
  })

  test('the band is drawn under what the plugins beneath it drew there', async ($, on) => {
    world(on, [])

    on('ui.render', { component: 'AbovePrompt' }, () => ({
      type: 'Text',
      children: ['a band of its own'],
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const ui = await $.ui.mount({ ...BAND_MOUNT, props: BAND })

    // A band is shared: the cockpit's row goes under the other drawing rather
    // than over it.
    expect(await ui.find({ text: /a band of its own/ })).toBeDefined()
    expect(await ui.find({ key: BAND_KEY })).toBeDefined()

    await ui.unmount()
  })

  test('the band stands down while a survey holds it', async ($, on) => {
    world(on, [])

    // The engine draws nothing of its own in the band, and a mounted site
    // still needs an implementation beneath the plugins to answer.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const ui = await $.ui.mount({
      ...BAND_MOUNT,
      props: { ...BAND, hasSurvey: true },
    })

    expect(await ui.find({ key: BAND_KEY })).toBeUndefined()

    await ui.unmount()
  })
  test('a pane reopened on a resume takes the keyboard from nobody', async ($, on) => {
    const opened: string[] = []
    const focused: string[] = []

    world(on, opened, [], [], { [STORE_OPEN_KEY]: true }, focused)

    on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Box' }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'PromptHint',
      requestId: 'hint',
      props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
      viewport: { columns: 160, rows: 40, isFullscreen: true },
    })

    await ui.advance(1)

    // The session was left with the pane open, so the first measurement opens
    // it again — and nobody asked for it just now, so it comes back without
    // the keyboard the person is typing with.
    expect(opened).toEqual([PANE_ID])
    expect(focused).toEqual([])

    await ui.unmount()
  })
  test('the Usage tab counts every turn, the subagents apart', async ($, on) => {
    world(on, [])

    on('turn.complete', (_$, e) => ({ text: e.answer }))

    const usage = {
      model: 'claude-opus-5',
      input_tokens: 1_000,
      output_tokens: 2_000,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 5_000,
    }

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.turn.complete({
      answer: 'done',
      durationMs: 1_200,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
      usage,
    })

    // A subagent's turn is this session's spending too: `usage` is the one
    // place the four counters are ever reported, and the main loop never
    // sees what a subagent spent.
    await $.turn.complete({
      answer: 'found it',
      durationMs: 800,
      isAborted: false,
      turnId: 't2',
      reason: 'answer',
      agentId: 'a1',
      usage: { ...usage, model: 'claude-haiku-4-5', output_tokens: 500 },
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /Main loop/ })).toBeDefined()
    expect(await ui.find({ text: /Subagents/ })).toBeDefined()

    // 2.5k written in all, 2.0k of it by the main loop and 500 under the
    // subagent: a fifth of the output, and the line says output.
    expect(await ui.find({ text: /2\.5k/ })).toBeDefined()
    expect(
      await ui.find({ text: /Subagents wrote 20% of the output/ }),
    ).toBeDefined()

    // Two models answered, so each one gets its row.
    expect(await ui.find({ text: /haiku-4-5/ })).toBeDefined()

    await ui.unmount()
  })

  test('a turn the engine reported no tokens for leaves the ledger alone', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, [], [], [], store)

    on('turn.complete', (_$, e) => ({ text: e.answer }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    // Interrupted before a response: there is no usage on it, and four zeroes
    // would say it answered for nothing.
    await $.turn.complete({
      answer: '',
      durationMs: 400,
      isAborted: true,
      turnId: 't1',
      reason: 'aborted',
    })

    const kept = store[SESSION_KEY] as { ledger: { main: { turns: number } } }

    expect(kept.ledger.main.turns).toBe(0)
  })

  test('the ledger survives a resume, since nothing else can hand it back', async ($, on) => {
    world(on, [], [], [], {
      [SESSION_KEY]: {
        version: 2,
        atMs: 9_000,
        files: [],
        tools: [],
        recent: [],
        history: [],
        agents: [],
        ledger: {
          main: {
            turns: 3,
            durationMs: 9_000,
            input: 1_200,
            output: 34_000,
            cacheRead: 77_000,
            cacheWrite: 6_000,
          },
          agents: {
            turns: 0,
            durationMs: 0,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          models: [],
        },
      },
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    // 34.0k written before this run of the session ever started. The engine
    // answers the cost and the window on its own; the four counters only ever
    // arrive one finished turn at a time, so the record is the only way back.
    expect(await ui.find({ text: /34\.0k/ })).toBeDefined()

    await ui.unmount()
  })

  test('session.measure moves the windows without a poll coming due', async ($, on) => {
    world(on, [])

    on('session.measure', (_$, e) => ({ changed: e.changed }))

    // The tab's own reading has no window at all: whatever it draws below
    // came from the measurement and not from a poll.
    on('session.usage', () => ({
      value: {
        context: { tokens: 0, window: 1_000_000, percent: 0 },
        startedAt: 0,
        rateLimits: [],
      },
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /Plan limits/ })).toBe(undefined)

    await $.session.measure({
      context: { tokens: 240_000, window: 1_000_000, percent: 24 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
      cost: { usd: 3.5 },
      changed: ['rateLimits', 'cost'],
    })

    await ui.redraw(PANE)

    expect(await ui.find({ text: /Plan limits/ })).toBeDefined()
    expect(await ui.find({ text: /42%/ })).toBeDefined()
    expect(await ui.find({ text: /\$3\.50/ })).toBeDefined()

    await ui.unmount()
  })

  test('the Stats tab reads the history file, once, when it is looked at', async ($, on) => {
    const reads: string[] = []

    world(on, [])

    on('env.get', (_$, e) => ({
      value: e.name === 'USERPROFILE' ? '/home/me' : undefined,
    }))

    on('fs.read', (_$, e) => {
      reads.push(e.path)

      return {
        value: [
          '{"timestamp":86400000,"sessionId":"s1","project":"/a"}',
          '{"timestamp":86400000,"sessionId":"s1","project":"/a"}',
          '{"timestamp":172800000,"sessionId":"s2","project":"/b"}',
          'not a line',
        ].join('\n'),
      }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    // Nothing was read before the tab was asked for: it is a file of somebody
    // else's, and a session that never opens the tab never opens it.
    expect(reads).toEqual([])

    await $.command.run({ command: 'cockpit', args: 'stats', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    // The host spells the path its own way once it resolves it, so what is
    // asserted is the file, not the separator it came back under.
    expect(reads).toHaveLength(1)
    expect((reads[0] ?? '').replace(/\\/g, '/')).toContain(
      '/home/me/.claude/history.jsonl',
    )

    expect(await ui.find({ text: /Prompts/ })).toBeDefined()
    expect(await ui.find({ text: /Sessions/ })).toBeDefined()

    // And it names both what it counted and where it read it: the title says
    // prompts, the line under it says the file. Nothing on the tab claims a
    // token, which is what the stats test states figure by figure.
    expect(
      await ui.find({ text: /Prompts typed on this machine/ }),
    ).toBeDefined()
    expect(await ui.find({ text: /From ~\/\.claude\/history\.jsonl/ })).toBeDefined()

    // Looked at again, it is not read again.
    await $.command.run({ command: 'cockpit', args: 'session', ...RUN })
    await $.command.run({ command: 'cockpit', args: 'stats', ...RUN })
    await ui.redraw(PANE)

    expect(reads).toHaveLength(1)

    await ui.unmount()
  })
  test('the skill listing is cut, and `Show more` draws the whole of it', async ($, on) => {
    world(on, [])

    // Twelve providers, one skill each: more than the block's rows, so the
    // list is cut and the row under it says by how much.
    const skillFrontmatter = Array.from({ length: 12 }, (_unused, at) => ({
      name: `skill-${at}`,
      source: 'plugin',
      pluginName: `provider-${at}`,
      tokens: 100 - at,
    }))

    on('session.usage', () => ({
      value: {
        context: {
          tokens: 1_000,
          window: 1_000_000,
          percent: 1,
          breakdown: breakdownOf(skillFrontmatter),
        },
        startedAt: 0,
        rateLimits: [],
        cost: { usd: 0.5 },
      },
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    // Eight of the twelve are drawn, heaviest first, and the ninth is not.
    expect(await ui.find({ text: /provider-0/ })).toBeDefined()
    expect(await ui.find({ text: /provider-7/ })).toBeDefined()
    expect(await ui.find({ text: /provider-8/ })).toBe(undefined)

    // The total counts every one of the twelve whichever way the list stands:
    // it is the figure anyone came to this block for.
    expect(await ui.find({ text: /12 skills/ })).toBeDefined()

    const row = await ui.find({ key: 'more:usage.skills' })

    expect(row).toBeDefined()
    expect(await ui.find({ text: /Show more \(4\)/ })).toBeDefined()

    await ui.press({ key: 'more:usage.skills' })
    await ui.redraw(PANE)

    // Pressed, the four it was hiding are there, and the row offers the cut
    // back rather than disappearing with the only way to undo it.
    expect(await ui.find({ text: /provider-8/ })).toBeDefined()
    expect(await ui.find({ text: /provider-11/ })).toBeDefined()
    expect(await ui.find({ text: /Show less/ })).toBeDefined()

    // The total did not move: it never counted the cut.
    expect(await ui.find({ text: /12 skills/ })).toBeDefined()

    await ui.press({ key: 'more:usage.skills' })
    await ui.redraw(PANE)

    expect(await ui.find({ text: /provider-8/ })).toBe(undefined)
    expect(await ui.find({ text: /Show more \(4\)/ })).toBeDefined()

    await ui.unmount()
  })

  test('a listing the body has room for draws no `Show more` row', async ($, on) => {
    world(on, [])

    on('session.usage', () => ({
      value: {
        context: {
          tokens: 1_000,
          window: 1_000_000,
          percent: 1,
          breakdown: breakdownOf([
            { name: 'a', source: 'plugin', pluginName: 'one', tokens: 40 },
            { name: 'b', source: 'plugin', pluginName: 'two', tokens: 20 },
          ]),
        },
        startedAt: 0,
        rateLimits: [],
        cost: { usd: 0.5 },
      },
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ text: /one/ })).toBeDefined()
    expect(await ui.find({ text: /two/ })).toBeDefined()
    expect(await ui.find({ key: 'more:usage.skills' })).toBe(undefined)

    await ui.unmount()
  })
  test('the `/config` row names the tabs there are, a guest plugin’s included', { plugins: [GUEST] }, async ($, on) => {
    world(on, [])

    on('config.describe', (_$, e) => ({
      label: e.label,
      description: e.description,
      isHidden: e.isHidden,
    }))

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const row = await $.config.describe({
      key: 'cockpit.hideTabs',
      label: 'Tabs the cockpit leaves out',
      isHidden: false,
      provider: { plugin: 'cockpit', tier: 'user' },
    })

    // `/config` has no row that picks several of a list, and this hook may
    // rewrite the help but neither the kind nor the options. So the help is
    // where the ids are read rather than guessed — and it is written off the
    // tabs registered at that moment, which is the only moment a plugin's
    // tab is knowable at all.
    for (const id of ['session', 'usage', 'stats', 'files', 'tools', 'agents']) {
      expect(row.description).toContain(id)
    }

    expect(row.description).toContain('message')
    expect(row.description).toContain('empty draws them all')

    // Nothing is out, so the help does not pretend anything is.
    expect(row.description).not.toContain('Out:')
  })

  test('the `/config` row refuses an id no tab carries', async ($, on) => {
    world(on, [])

    const written: unknown[] = []

    on('config.set', (_$, e) => {
      written.push(e.value)

      return { value: e.value }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    const bad = await $.config.set(writing('stats,gohst'))

    // It would hide nothing and the rail would look exactly as it did, so
    // the row would show the typo as though it had taken.
    expect(bad.deny).toContain('gohst')
    expect(written).toEqual([])

    // The reason names what there was to choose from.
    expect(bad.deny).toContain('session')
  })

  test('the `/config` row writes a tidied line, a guest tab among them', { plugins: [GUEST] }, async ($, on) => {
    world(on, [])

    const written: unknown[] = []

    on('config.set', (_$, e) => {
      written.push(e.value)

      return { value: e.value }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    // The whole point of the line: it covers what the cockpit never declared.
    const ok = await $.config.set(writing(' Message , STATS '))

    expect(ok.deny).toBe(undefined)
    expect(written).toEqual(['message, stats'])

    // An empty line is written too: it is how every tab comes back.
    await $.config.set(writing(''))

    expect(written).toEqual(['message, stats', ''])
  })

  test('the cockpit never writes that line itself', async ($, on) => {
    const bySelf: unknown[] = []

    world(on, [])

    on('config.set', (_$, e) => {
      if (e.origin.kind === 'plugin' && e.origin.name === 'cockpit') {
        bySelf.push(e.key)
      }

      return { value: e.value }
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'stats', ...RUN })
    await $.command.run({ command: 'cockpit', args: 'host', ...RUN })
    await $.command.run({ command: 'cockpit', args: '', ...RUN })

    // Writing that line reloads the module, so a cockpit that wrote it would
    // be restarting itself. The row is the person's to write, and the reload
    // it costs is theirs to ask for.
    expect(bySelf).toEqual([])
  })
  test('the record is read back once, whichever path gets there first', async ($, on) => {
    const clock = world(on, [], [], [], {
      [SESSION_KEY]: {
        version: 2,
        atMs: 9_000,
        files: [
          {
            path: '/work/kept.ts',
            reads: 2,
            writes: 1,
            added: 8,
            removed: 1,
            status: null,
            atMs: 5_000,
          },
        ],
        tools: [{ tool: 'Read', calls: 2, ms: 20, failed: 0 }],
        recent: [],
        history: [],
        agents: [],
        ledger: {
          main: {
            turns: 2,
            durationMs: 4_000,
            input: 100,
            output: 21_000,
            cacheRead: 5_000,
            cacheWrite: 900,
          },
          agents: {
            turns: 0,
            durationMs: 0,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          models: [],
        },
      },
    })

    await $.session.start({
      surface: 'terminal',
      isInteractive: true,
      cwd: '/work',
    })

    await $.command.run({ command: 'cockpit', args: 'files', ...RUN })

    const ui = await $.ui.mount({
      plugin: 'cockpit',
      surface: 'terminal',
      component: 'Pane',
      requestId: PANE_ID,
      props: PANE,
    })

    await ui.advance(1)
    await ui.redraw(PANE)

    expect(await ui.find({ key: 'arm:/work/kept.ts' })).toBeDefined()

    // The reload path's timer comes due after the session already started.
    // It must find the read done rather than do it again over the work this
    // session has done since: a second read would be a blank state written
    // over a live one.
    await clock.advance(5_000)
    await ui.redraw(PANE)

    expect(await ui.find({ key: 'arm:/work/kept.ts' })).toBeDefined()

    await $.command.run({ command: 'cockpit', args: 'usage', ...RUN })
    await ui.redraw(PANE)

    // 21.0k written before this run of the session: the ledger came back
    // with the rest and the timer left it alone.
    expect(await ui.find({ text: /21\.0k/ })).toBeDefined()

    await ui.unmount()
  })
})
