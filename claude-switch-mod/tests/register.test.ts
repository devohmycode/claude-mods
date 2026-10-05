import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

import { PANE_ID, PANE_TITLE, effortKey, modelKey } from '../hooks'

/** What the host saw: the commands run on it, `/name args`. */
type World = { runs: string[]; toasts: string[]; clock: MockClock }

/**
 * A host whose session runs `model` and holds whether it has `/effort`.
 *
 * @param on the test plugin's registrar
 * @param hasEffort whether `/effort` is among the commands
 * @returns what the host saw
 */
function host(on: On, hasEffort: boolean): World {
  const world: World = { runs: [], toasts: [], clock: mock.clock(on) }
  let model = 'claude-opus-5-5'

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', ($, e) => {
    world.toasts.push(String((e as { text?: string }).text))

    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({
    value: (hasEffort ? ['model', 'effort'] : ['model']).map(name => ({ name, description: '', source: 'builtin' })) as never,
  }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('session.model', () => ({ value: model }))
  on('command.run', { command: 'model' }, ($, e) => {
    world.runs.push(`/model ${e.args}`)
    model = e.args === 'sonnet' ? 'claude-sonnet-5-5' : e.args

    return { text: '' }
  })
  on('command.run', { command: 'effort' }, ($, e) => {
    world.runs.push(`/effort ${e.args}`)

    return { text: '' }
  })

  return world
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
const SESSION = { cwd: '/work', surface: 'terminal', isInteractive: true } as const
const PANE = {
  title: PANE_TITLE,
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const

describe('/switch', () => {
  test('the pane marks the current model and effort, and a click runs /model and /effort', async ($, on) => {
    const world = host(on, true)
    await $.session.start(SESSION)

    const ui = await $.ui.mount({ plugin: 'switch', surface: 'terminal', component: 'Pane', requestId: PANE_ID, props: PANE })

    expect((await ui.find({ key: `row:${modelKey('opus')}` }))?.text).toMatch(/^●/)
    expect((await ui.find({ key: `row:${modelKey('sonnet')}` }))?.text).toMatch(/^○/)
    expect((await ui.find({ key: `row:${effortKey('high')}` }))?.text).toMatch(/^●/)

    await ui.press({ key: modelKey('sonnet') })
    await ui.press({ key: effortKey('max') })
    await ui.redraw(PANE)

    expect(world.runs).toEqual(['/model sonnet', '/effort max'])
    expect(world.toasts).toEqual(['⇄ Modèle Opus → Sonnet', '⚡ Effort high → max'])
    expect((await ui.find({ key: `row:${modelKey('sonnet')}` }))?.text).toMatch(/^●/)
    expect((await ui.find({ key: `row:${effortKey('max')}` }))?.text).toMatch(/^●/)

    await ui.unmount()
  })

  test('typed with a name, it switches without the pane; anything else is refused', async ($, on) => {
    const world = host(on, true)
    await $.session.start(SESSION)

    const run = (args: string) => $.command.run({ command: 'switch', args, ...RUN })

    expect((await run('haiku')).text).toContain('Haiku')
    expect((await run('low')).text).toContain('low')
    expect((await run('turbo')).text).toContain('turbo')

    await world.clock.settle()
    expect(world.toasts).toEqual(['⇄ Modèle Opus → Haiku', '⚡ Effort high → low'])
    expect(world.runs).toEqual(['/model haiku', '/effort low'])
  })

  test('without /effort, the level is held and written on each main request', async ($, on) => {
    const world = host(on, false)
    let sent: unknown
    on('turn.step', async function* ($, e) {
      sent = e.effort

      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
    })
    await $.session.start(SESSION)

    await $.command.run({ command: 'switch', args: 'xhigh', ...RUN })
    await world.clock.settle()
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })
    for await (const _chunk of stream) {
      // drained
    }

    expect(world.runs).toEqual([])
    expect(sent).toBe('xhigh')
  })
})

