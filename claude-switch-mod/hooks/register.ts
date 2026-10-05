/**
 * Switch: a pane that lists the models and the effort levels and switches
 * either with one click.
 *
 * A click runs the engine's own command, `/model <alias>` or
 * `/effort <level>`, as if the person typed it: the session's setting
 * changes, the status line follows, and nothing of the mod stands between
 * the session and its model. Where the session has no `/effort`, the mod
 * holds the level and writes it on each main request at `turn.step`.
 *
 * The current values come from the requests themselves: every main
 * `turn.step` carries the model and the effort the engine resolved for it,
 * after any downgrade, so the pane shows what was sent, not what was asked.
 */

import type { Register, Settings } from 'claude-code'

import { MODELS, choiceOf, effortOf, pickOf, switchedText } from './catalog'
import type { Effort } from './catalog'
import { COMMAND, PANE_ID, PANE_TITLE, TEXTS } from './names'
import { drawPane } from './pane'

/**
 * The calls the buttons make after the render that drew them has returned,
 * captured from `engine.create`.
 */
type Host = {
  invalidate: () => void
  model: () => Promise<string>
  run: (command: string, args: string) => Promise<unknown>
  toast: (text: string, timeoutMs?: number) => void
  later: (fn: () => void) => void
}

/** How long a switch's notification stays, in milliseconds. */
const TOAST_MS = 5000

/**
 * Registers `/switch`, its pane, and the `turn.step` hook that keeps the
 * pane's values current. Each switch that takes is announced by a toast
 * naming the value before and after; one that fails, by its reason.
 *
 * @param on the module's hook registrar
 */
export const register: Register = on => {
  let host: Host | undefined
  let model: string | undefined
  let effort: Effort | undefined
  let held: Effort | undefined
  let hasEffortCommand = true

  /**
   * Tells the person a switch did not take, the command's reason in it.
   *
   * @param error what the command rejected with
   */
  const failed = (error: unknown): void => {
    host?.toast(`${TEXTS.failed} ${error instanceof Error ? error.message : String(error)}`)
  }

  /**
   * Runs `/model` for the model of that key, then reads back the model the
   * session took.
   *
   * @param key the model's key in the catalog
   * @returns once the command has run and the pane redrawn
   */
  const pickModel = async (key: string): Promise<void> => {
    const choice = MODELS.find(one => one.key === key)

    if (host === undefined || choice === undefined) {
      return
    }

    const before = choiceOf(model)?.label ?? model

    await host.run('model', choice.arg)
    model = await host.model().catch(() => choice.arg)
    host.invalidate()
    host.toast(switchedText('model', before, choiceOf(model)?.label ?? model), TOAST_MS)
  }

  /**
   * Runs `/effort` with that level, or holds it where the session has none.
   *
   * @param level the effort level
   * @returns once the level is set and the pane redrawn
   */
  const pickEffort = async (level: Effort): Promise<void> => {
    if (host === undefined) {
      return
    }

    if (hasEffortCommand) {
      await host.run('effort', level)
    } else {
      held = level
    }

    const before = effort

    effort = level
    host.invalidate()
    host.toast(switchedText('effort', before, level), TOAST_MS)
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)

    host ??= {
      invalidate: () => beneath.ui.invalidate('ui.render'),
      model: () => beneath.session.model(),
      run: (command, args) => beneath.command.run({ command, args }),
      toast: (text, timeoutMs) => beneath.ui.toast(text, { timeoutMs }),
      later: fn => void beneath.clock.after(0, fn),
    }

    return beneath
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: TEXTS.description,
      argumentHint: '[modèle|effort]',
    })

    const started = await next(e)

    model = await $.session.model().catch(() => undefined)

    const commands = await $.command.list().catch(() => [])
    hasEffortCommand = commands.some(one => one.name === 'effort')

    const settings: Settings = await $.settings.read().catch(() => ({}))
    effort ??= effortOf(settings['effortLevel'])

    return started
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const pick = pickOf(e.args)

    if (pick === undefined && e.args.trim() !== '') {
      return { text: `${TEXTS.unknownPick} ${e.args.trim()}` }
    }

    // `/model` and `/effort` cannot run from inside this hook: the session
    // waits on it. A timer runs them once `/switch` has answered.
    if (pick !== undefined && 'model' in pick) {
      host?.later(() => void pickModel(pick.model.key).catch(failed))

      return { text: `${TEXTS.modelSet} ${pick.model.label}` }
    }

    if (pick !== undefined) {
      host?.later(() => void pickEffort(pick.effort).catch(failed))

      return { text: `${TEXTS.effortSet} ${pick.effort}` }
    }

    await $.ui.open({ id: PANE_ID, title: PANE_TITLE, focus: true })

    return { text: TEXTS.opened }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    const sent = held !== undefined && e.effort !== undefined ? { ...e, effort: held } : e
    const seen = effortOf(sent.effort) ?? effort

    if (sent.model !== model || seen !== effort) {
      model = sent.model
      effort = seen
      $.ui.invalidate('ui.render')
    }

    return yield* next(sent)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) =>
    drawPane($.ui.resolve(e), {
      model,
      effort,
      hasEffortCommand,
      pickModel: key => void pickModel(key).catch(failed),
      pickEffort: level => void pickEffort(level).catch(failed),
    }),
  )
}
