import type {
  AgentInfo,
  CockpitBadge,
  CockpitDraw,
  CockpitTab,
  EngineInterface,
  On,
  PaneCloseArgs,
  PaneOpenArgs,
  PluginOptions,
  ProcessRunResult,
  SessionRepo,
  SessionUsage,
  Timer,
  UiFocusArgs,
  UiFocusResult,
} from 'claude-code'

import { bandView } from './band'
import { fitText, stampOf } from './format'
import { statusesOf } from './git'
import { GPU_PROBES, hostOf, systemProbes } from './host'
import type { GpuProbe, GpuReading, HostSample, HostStat, SystemProbe, SystemReading } from './host'
import { keptOf, restoredOf, sessionKeyOf, staleKeysOf } from './keep'
import {
  AGENT_POLL_MS,
  COMMAND_NAME,
  CONFIG_LANG_KEY,
  CONFIG_TABS_KEY,
  DIALOG_ROWS,
  DOCK_MIN_COLUMNS,
  GIT_POLL_MS,
  GIT_TIMEOUT_MS,
  HISTORY_PATH,
  HOST_ARG,
  HOST_MAX_MS,
  HOST_MIN_MS,
  HOST_POLL_MS,
  HOST_TIMEOUT_MS,
  PANE_ID,
  PANE_TITLE,
  PLUGIN_NAME,
  REDRAW_MS,
  SESSION_MAX_MS,
  SESSION_MIN_MS,
  SESSION_POLL_MS,
  STORE_OPEN_KEY,
  STORE_TAB_KEY,
} from './names'
import { bodyBoxOf, paneView } from './pane'
import { isPickable } from './pick'
import { checkOf, hiddenOf, isHidden, shownOf } from './rail'
import {
  NO_RING,
  entryOf,
  focusablesOf,
  landingOf,
  railIdOf,
  railKey,
  ringOf,
} from './ring'
import type { Ring } from './ring'
import { LANGUAGE_TAGS, say, setSay } from './say'
import {
  EMPTY,
  askOf,
  isLive,
  withAgents,
  withArmed,
  withCall,
  withCostOf,
  withSent,
  withStatuses,
  withTurn,
} from './state'
import type { State, Vitals } from './state'
import { promptsOf } from './stats'
import type { Prompt, Range } from './stats'
import { builtinTabs } from './tabs'
import { touchesOf } from './touch'
import { pluginsOf } from './usage'
import type { TurnCost } from './usage'

/**
 * What the cockpit reaches the world through once its dispatch is over: one
 * closure per call it makes, each spelling its own call on the engine beneath
 * the plugin, so a timer that fires between turns still has an engine.
 */
type Host = {
  invalidate: () => void
  openPane: (pane: PaneOpenArgs) => Promise<unknown>
  closePane: (pane: PaneCloseArgs) => Promise<unknown>
  focus: (args: UiFocusArgs) => Promise<UiFocusResult>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeGet: (key: string) => Promise<unknown>
  id: () => Promise<string>
  agents: () => Promise<AgentInfo[]>
  usage: () => Promise<SessionUsage>
  model: () => Promise<string>
  turns: () => Promise<number>
  repo: () => Promise<SessionRepo | null>
  readFile: (path: string) => Promise<string>
  home: () => Promise<string | undefined>
  run: (
    argv: readonly string[],
    cwd: string,
    timeoutMs: number,
  ) => Promise<ProcessRunResult>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  toast: (text: string) => void
}

/**
 * Registers the cockpit: `$.cockpit` in the `engine.create` fold, `/cockpit`
 * and the pane it opens, the tallies its tabs read, and the file a tab arms.
 *
 * Everything the pane draws is recorded by the hooks below and read at draw
 * time; a tab's `render` never reaches the engine. Every hook falls back to
 * `next(e)` on any path it does not own, so a cockpit that fails is a session
 * without a pane and not a session that stops.
 *
 * @param on the engine's registrar
 * @param options the manifest's `userConfig`, as the person set it
 */
export function register(on: On, options: PluginOptions): void {
  // Before anything else: the tab titles are read when the tabs are built
  // and the command's words when it is registered, both of which happen
  // under a hook below. Writing the row reloads the module, so this runs
  // again with the new language and there is nothing to keep in step.
  setSay(options.language)

  const defaultTab = String(options.defaultTab ?? 'session')

  /**
   * The tabs the person left out, off the one `/config` line that says so.
   *
   * Read here and nowhere else: writing that line reloads the module, so
   * `register` runs again with the new list and there is nothing to keep in
   * step. The cockpit never writes it itself, which is what keeps the reload
   * the person's own doing rather than a loop of the plugin's making.
   */
  const hidden = hiddenOf(options.hideTabs)
  const isAutoRaising = options.autoRaise === true
  const isAutoOpening = options.autoOpen === true
  const isReadingBash = options.bashFiles !== false
  const isBanding = options.button !== false

  /**
   * Whether the machine itself is read while the Session tab is open. The
   * manifest sets what a session starts on; `/cockpit host` turns it over
   * for this session, which is what makes the whole path testable.
   */
  let isHosting = options.hostStats === true

  /**
   * How far apart two readings of the machine are, as the person set it and
   * held to what a reading can keep up with.
   *
   * It is the only poll whose period is worth setting: the others read the
   * engine's own memory, and this one runs somebody else's command.
   */
  const sessionPollMs = Math.max(
    SESSION_MIN_MS,
    Math.min(
      SESSION_MAX_MS,
      Math.round(Number(options.sessionSeconds ?? 0) * 1_000) ||
        SESSION_POLL_MS,
    ),
  )

  const hostPollMs = Math.max(
    HOST_MIN_MS,
    Math.min(HOST_MAX_MS, Math.round(Number(options.hostSeconds ?? 0) * 1_000) || HOST_POLL_MS),
  )

  /**
   * How long one of its commands is given: short of the next reading, so a
   * slow host skips one rather than queueing two.
   */
  const hostTimeoutMs = Math.max(
    1_500,
    Math.min(HOST_TIMEOUT_MS, hostPollMs - 1_000),
  )

  let host: Host | null = null
  let state: State = EMPTY

  const tabs = new Map<string, CockpitTab>()
  const badges = new Map<string, CockpitBadge | null>()

  /**
   * The tabs drawing their whole list rather than the rows the body has: a
   * list longer than the body is a list the surface scrolls, which is worth
   * paying for where the person asked for it and not before.
   *
   * A view and not a fact, so it is not kept with the session's record: a
   * resumed session opens on the rows its body has, as a new one does.
   */
  const whole = new Set<string>()

  /**
   * The row the person is looking at, by the key its button carries, or null
   * for a list nobody has pointed at.
   *
   * It follows the focus ring as well as a press, so Tab walks the rows and
   * the card under the list follows; a tab of its own keeps none, since a
   * key naming a file says nothing in the list of tools.
   */
  let picked: string | null = null

  /**
   * Picks a row, or drops the one picked where it is pressed again.
   *
   * @param key the row's key
   * @param isPress whether a press asked for it rather than the focus ring,
   *   which lands on a row without meaning to close the card under it
   */
  function pick(key: string, isPress: boolean): void {
    picked = isPress && picked === key ? null : key

    requestRedraw()
  }

  /**
   * The stops the pane's focus ring has, as the last drawing left them: the
   * rail across the top, and what the shown tab drew under it.
   *
   * Read at every `ui.focus`, which is why it is taken from the drawing
   * itself rather than from the tabs: a tab another plugin contributed draws
   * stops of its own, and the ring walks those too.
   */
  let ring: Ring = NO_RING

  /**
   * The key the ring is on, or null where it is on none of the cockpit's.
   *
   * The surface says where a move is going and not where it comes from, and
   * where it comes from is the whole of what tells a step along the rail from
   * a step off its end.
   */
  let focusKey: string | null = null

  /**
   * What the ring landing on a key does beside moving: a tab under it is the
   * one the pane shows, a row under it is the one the card writes out.
   *
   * Showing a tab as the ring reaches it is what makes Tab walk the rail the
   * way a row of tabs reads: nothing to press, and nothing shown that the
   * ring is not on.
   *
   * @param key the key the ring landed on, or undefined for one of the
   *   surface's own stops
   */
  function follow(key: string | undefined): void {
    if (key === undefined) {
      return
    }

    const id = railIdOf(key)

    if (id !== null) {
      select(id)

      return
    }

    if (isPickable(key)) {
      pick(key, false)
    }
  }

  /**
   * Puts the ring on a key of the cockpit's own once the dispatch that asked
   * for it is over.
   *
   * A hook cannot name an element where the move named none — a rewrite
   * offering one is refused — so a move onto one of the surface's stops is
   * kept where it was and the ring moved by a call of the cockpit's own,
   * which is a move of its own and not a rewrite of the person's.
   *
   * @param key the key the ring belongs on
   */
  function focusOn(key: string): void {
    host?.after(0, () => {
      void host
        ?.focus({ requestId: PANE_ID, key })
        .then(result => {
          // The keyboard is the person's to give and the move can be
          // refused; what follows a landing follows the landing, so it is
          // read from the answer rather than assumed.
          if (result.deny === undefined) {
            focusKey = key

            follow(key)
          }
        })
        .catch(() => undefined)
    })
  }

  /**
   * When the cockpit saw each agent start, kept beside the roster: a spawn
   * announces itself, and the poll that first lists the agent may be two
   * seconds behind it or, with the pane shut, minutes.
   */
  const spawnedMs = new Map<string, number>()

  let cwd = ''
  let repoRoot: string | null = null
  let hasAskedRepo = false

  /**
   * The store key this session's record is kept under, or null for a session
   * with no id to key on — a record nobody could ever find again.
   */
  let sessionKey: string | null = null

  let selected = defaultTab
  let isOpen = false
  let isFocused = false
  let placement: 'dock' | 'inline' = 'dock'
  let columns: number | null = null
  let isFullscreen = true

  let hasRestored = false
  let hasMeasured = false
  let wasOpen = false
  let hasAutoOpened = false

  let redrawTimer: Timer | null = null
  let agentTimer: Timer | null = null
  let gitTimer: Timer | null = null
  let vitalsTimer: Timer | null = null
  let hostTimer: Timer | null = null
  let isAskingHost = false

  /**
   * The last reading of the machine, and the probes that gave it: a host has
   * its own commands, so the first that answers is the one this session
   * keeps, and the ones that did not are never run again.
   */
  /**
   * The history file as the Stats tab last read it, or null while it has not
   * been read — or could not be, which the tab draws as plainly.
   *
   * It is read when the tab is looked at and not before: it is a file of
   * somebody else's, and a session that never opens the tab never opens it.
   */
  let prompts: readonly Prompt[] | null = null
  let isReadingHistory = false
  let statsRange: Range = 'all'

  let hostStat: HostStat | null = null
  let systemProbe: SystemProbe | null = null
  let systemSample: HostSample | null = null
  let gpuProbe: GpuProbe | null = null
  let hasProbedGpu = false

  /**
   * Whether this host answered any of the system probes at all: one that
   * answered none is not asked again, whatever the option says.
   */
  let hasHost = true
  let isAskingGit = false

  /**
   * The tabs in rail order: by `order`, then by registration.
   *
   * @returns the tabs as the rail draws them
   */
  const ordered = (): readonly CockpitTab[] =>
    shownOf(
      [...tabs.values()]
        .map((tab, index) => ({ tab, index }))
        .sort(
          (a, b) =>
            (a.tab.order ?? 50) - (b.tab.order ?? 50) || a.index - b.index,
        )
        .map(one => one.tab),
      hidden,
    )

  /**
   * Every registered tab, hidden ones included, in rail order: what the
   * `/config` row's help is written from, and what a typed id is checked
   * against. The rail itself draws `ordered()`.
   *
   * @returns the tabs, in the order the rail would draw them
   */
  const registered = (): readonly CockpitTab[] =>
    [...tabs.values()]
      .map((tab, index) => ({ tab, index }))
      .sort(
        (a, b) => (a.tab.order ?? 50) - (b.tab.order ?? 50) || a.index - b.index,
      )
      .map(one => one.tab)

  /**
   * Asks for one draw, however many calls asked for it: a burst of tool calls
   * is one repaint and not thirty.
   */
  function requestRedraw(): void {
    const engine = host

    if (redrawTimer || !engine || !isOpen) {
      return
    }

    redrawTimer = engine.after(REDRAW_MS, () => {
      redrawTimer = null
      engine.invalidate()
    })
  }

  /**
   * Selects a tab, clearing its flag; a tab nobody registered is left alone.
   *
   * @param id the tab's id
   * @returns whether a tab holds that id
   */
  function select(id: string): boolean {
    if (!tabs.has(id) || isHidden(id, hidden)) {
      return false
    }

    selected = id
    badges.delete(id)
    picked = null

    void host?.storeSet(STORE_TAB_KEY, id).catch(() => undefined)
    void tabs.get(id)?.onShow?.()

    syncPolls()
    requestRedraw()

    return true
  }

  /**
   * Starts what the tab on screen needs and stops what it does not: a poll
   * only pays for itself while someone is looking at what it fetches.
   */
  function syncPolls(): void {
    if (isOpen && selected === 'agents') {
      startAgentPoll()
    } else {
      stopAgentPoll()
    }

    if (isOpen && selected === 'files') {
      startGitPoll()
    } else {
      stopGitPoll()
    }

    if (isOpen && selected === 'session') {
      startVitalsPoll()
    } else {
      stopVitalsPoll()
    }

    if (isOpen && selected === 'session' && isHosting && hasHost) {
      startHostPoll()
    } else {
      stopHostPoll()
    }
  }

  /**
   * Flags a tab that is not the one on screen, and raises it instead where
   * the person asked the cockpit to follow the work.
   *
   * @param id the tab's id
   * @param badge the flag to set
   */
  function mark(id: string, badge: CockpitBadge | null): void {
    // A hidden tab is not flagged: a `•` on a tab nobody can see is a promise
    // the rail cannot keep, and it would outlive the work that raised it.
    if (!tabs.has(id) || id === selected || isHidden(id, hidden)) {
      return
    }

    if (isAutoRaising && isOpen) {
      select(id)

      return
    }

    badges.set(id, badge)
    requestRedraw()
  }

  /**
   * Opens the pane, docked where the terminal is in its fullscreen layout and
   * wide enough for it, a dialog above the prompt otherwise.
   *
   * @param how `id`, the tab to select, or the selected one; and `isAsked`,
   *   whether the person asked for the pane just now, which is what decides
   *   whether the keyboard is asked for with it
   */
  async function openPane(
    how: { id?: string; isAsked?: boolean } = {},
  ): Promise<void> {
    if (!host) {
      return
    }

    if (how.id !== undefined) {
      select(how.id)
    } else {
      // The tab the session was left on is about to be looked at, and a tab
      // that gathers what it draws gathers it when it is looked at.
      void tabs.get(selected)?.onShow?.()
    }

    const isDocked =
      isFullscreen && (columns === null || columns >= DOCK_MIN_COLUMNS)

    placement = isDocked ? 'dock' : 'inline'

    const pane: PaneOpenArgs = isDocked
      ? { id: PANE_ID, title: PANE_TITLE, holdToasts: true }
      : {
          id: PANE_ID,
          title: PANE_TITLE,
          closeOnEscape: true,
          rows: DIALOG_ROWS,
        }

    // The keys are asked for where the person asked for the pane — `/cockpit`
    // and the button — and where it opens as a dialog, which is one. Never
    // where the cockpit opened it itself: a pane that took the keyboard off an
    // idle prompt would answer the next thing typed with the rail's hotkeys.
    //
    // It is a request either way. The surface grants it only while the prompt
    // holds the keys over an empty composer, so a band the person has just
    // clicked in — the button's own case — may well keep them.
    await host.openPane(
      how.isAsked === true || !isDocked ? { ...pane, focus: true } : pane,
    )

    isOpen = true

    void host.storeSet(STORE_OPEN_KEY, true).catch(() => undefined)

    syncPolls()
    requestRedraw()
  }

  /**
   * Closes the pane and stops what only an open pane pays for.
   */
  async function closePane(): Promise<void> {
    isOpen = false
    isFocused = false

    syncPolls()

    void host?.storeSet(STORE_OPEN_KEY, false).catch(() => undefined)

    await host?.closePane({ id: PANE_ID }).catch(() => undefined)
  }

  /**
   * What the button above the prompt does: the same toggle `/cockpit` is.
   *
   * It runs after its own drawing's dispatch, so it asks for the repaint
   * itself: the band draws the state this just changed, and a pane that has
   * just closed asks for no draw of its own.
   */
  async function togglePane(): Promise<void> {
    await (isOpen ? closePane() : openPane({ isAsked: true })).catch(
      () => undefined,
    )

    host?.invalidate()
  }

  /**
   * Starts reading the machine while the Session tab is the one on screen
   * and the readings are on.
   *
   * This is the one poll that runs a command of somebody else's, so it is
   * the slowest, it never overlaps itself, and it stops for good on a host
   * that answers none of the probes.
   */
  function startHostPoll(): void {
    if (hostTimer || !host) {
      return
    }

    void askHost()

    hostTimer = host.every(hostPollMs, () => {
      void askHost()
    })
  }

  /**
   * Stops reading the machine.
   */
  function stopHostPoll(): void {
    hostTimer?.cancel()
    hostTimer = null
  }

  /**
   * One reading of the machine: the processor and the memory from the probe
   * this host answers, the graphics card from the first tool that reports
   * one, and how long both took.
   */
  async function askHost(): Promise<void> {
    const engine = host

    if (!engine || isAskingHost || !isHosting || !hasHost) {
      return
    }

    isAskingHost = true

    const startedMs = await engine.now().catch(() => 0)

    try {
      const system = await readSystem(engine)

      if (system === null) {
        // Nothing here knows this host. Saying so once is worth more than
        // failing every five seconds for the rest of the session.
        hasHost = false
        stopHostPoll()
        engine.toast(say().pane.hostNone)

        return
      }

      const gpu = await readGpu(engine)
      const endedMs = await engine.now().catch(() => startedMs)

      hostStat = hostOf(system, gpu, Math.max(0, endedMs - startedMs))

      requestRedraw()
    } finally {
      isAskingHost = false
    }
  }

  /**
   * The processor and the memory, through the probe this host answered
   * before, or through each in turn until one does.
   *
   * @param engine the world beneath the plugin
   * @returns the reading, or null where no probe answered
   */
  async function readSystem(engine: Host): Promise<SystemReading | null> {
    const probes =
      systemProbe === null
        ? systemProbes(/^[A-Za-z]:\//.test(cwd.replace(/\\/g, '/')))
        : [systemProbe]

    for (const probe of probes) {
      const result = await engine
        .run(probe.argv, cwd, hostTimeoutMs)
        .catch(() => null)

      if (!result || result.exitCode !== 0) {
        continue
      }

      const reading = probe.read(result.stdout, systemSample)

      if (reading === null) {
        continue
      }

      systemProbe = probe
      systemSample = reading.sample

      return reading
    }

    return null
  }

  /**
   * The graphics card, through the tool this host answered before, or
   * through each in turn the first time; a host that answered none is never
   * asked again and is drawn without a card.
   *
   * @param engine the world beneath the plugin
   * @returns the probe that answered and what it read, or null
   */
  async function readGpu(
    engine: Host,
  ): Promise<{ id: string; reading: GpuReading } | null> {
    if (hasProbedGpu && gpuProbe === null) {
      return null
    }

    for (const probe of gpuProbe === null ? GPU_PROBES : [gpuProbe]) {
      const result = await engine
        .run(probe.argv, cwd, hostTimeoutMs)
        .catch(() => null)

      if (!result || result.exitCode !== 0) {
        continue
      }

      const reading = probe.read(result.stdout)

      if (reading === null) {
        continue
      }

      hasProbedGpu = true
      gpuProbe = probe

      return { id: probe.id, reading }
    }

    hasProbedGpu = true

    return null
  }

  /**
   * Starts reading the session again while the Session tab is the one on
   * screen: a plan window's reset counts down between turns, and the cost
   * and the context move within one.
   *
   * The reading is estimated locally and sends no request, so the tab that
   * is looked at costs the session nothing but the reading.
   */
  function startVitalsPoll(): void {
    if (vitalsTimer || !host) {
      return
    }

    vitalsTimer = host.every(sessionPollMs, () => {
      void readVitals()
    })
  }

  /**
   * Stops that reading.
   */
  function stopVitalsPoll(): void {
    vitalsTimer?.cancel()
    vitalsTimer = null
  }

  /**
   * Starts asking the engine for its agents while the Agents tab is the one
   * on screen, since nothing announces an agent's status changing and a
   * running agent's row counts up while it runs.
   */
  function startAgentPoll(): void {
    if (agentTimer || !host) {
      return
    }

    void pollAgents()

    agentTimer = host.every(AGENT_POLL_MS, () => {
      void pollAgents()
    })
  }

  /**
   * Stops that polling.
   */
  function stopAgentPoll(): void {
    agentTimer?.cancel()
    agentTimer = null
  }

  /**
   * One pass over the engine's agents, folded into the roster the tab reads.
   *
   * A pass asks for a draw where the roster moved, and while any agent is
   * still running, since its row counts up; a session whose agents have all
   * finished settles and stops repainting.
   */
  async function pollAgents(): Promise<void> {
    if (!host) {
      return
    }

    const agents: readonly AgentInfo[] = await host.agents().catch(() => [])
    const nowMs = await host.now().catch(() => state.nowMs)

    const seen = agents.map(agent => ({
      id: agent.id,
      type: agent.type,
      name: agent.name ?? null,
      status: agent.status,
      description: agent.description,
      parentId: agent.parentId ?? null,
    }))

    const before = state.agents

    state = withAgents(state, seen, nowMs, spawnedMs)

    const isMoving = state.agents.some(row => isLive(row.status))

    const isSame =
      before.length === state.agents.length &&
      before.every((row, index) => {
        const now = state.agents[index]

        return (
          now?.id === row.id &&
          now.status === row.status &&
          now.endedMs === row.endedMs
        )
      })

    if (isSame && !isMoving) {
      return
    }

    requestRedraw()
  }

  /**
   * Starts asking git what it makes of the listed files while the Files tab
   * is the one on screen.
   */
  function startGitPoll(): void {
    if (gitTimer || !host) {
      return
    }

    void askGit()

    gitTimer = host.every(GIT_POLL_MS, () => {
      void askGit()
    })
  }

  /**
   * Stops that polling.
   */
  function stopGitPoll(): void {
    gitTimer?.cancel()
    gitTimer = null
  }

  /**
   * One `git status --porcelain`, written onto the files the tab lists.
   *
   * Outside a repository it asks nothing, and a git that fails, times out or
   * answers anything but cleanly leaves the column as it was: the tab's own
   * counts are what it is for, and git's letters are what it can add.
   */
  async function askGit(): Promise<void> {
    const engine = host

    if (!engine || isAskingGit || state.files.length === 0) {
      return
    }

    isAskingGit = true

    try {
      const root = await rootOf()

      if (root === null) {
        return
      }

      const result = await engine
        .run(['git', 'status', '--porcelain'], root, GIT_TIMEOUT_MS)
        .catch(() => null)

      if (!result || result.exitCode !== 0) {
        return
      }

      const files = withStatuses(state.files, statusesOf(result.stdout, root))

      const isSame = files.every(
        (file, index) => file.status === state.files[index]?.status,
      )

      if (isSame) {
        return
      }

      state = { ...state, files }
      requestRedraw()
    } finally {
      isAskingGit = false
    }
  }

  /**
   * The repository's root, asked once: a session either sits in one or does
   * not, and a session that does not should not run git every four seconds
   * to be told so again.
   *
   * @returns the root, or null outside a repository
   */
  async function rootOf(): Promise<string | null> {
    if (hasAskedRepo) {
      return repoRoot
    }

    hasAskedRepo = true

    const repo = (await host?.repo().catch(() => null)) ?? null

    repoRoot = repo?.root ?? null

    return repoRoot
  }

  /**
   * What the Session tab reads, asked of the engine once a turn ends.
   *
   * @returns the vitals, every reading the engine withheld left null
   */
  async function vitalsOf(): Promise<Vitals> {
    if (!host) {
      return EMPTY.vitals
    }

    const usage: SessionUsage | null = await host.usage().catch(() => null)
    const context = usage?.context
    const categories = context?.breakdown?.categories ?? []
    const skills = context?.breakdown?.skills?.skillFrontmatter ?? []

    return {
      model: await host.model().catch(() => null),
      turns: await host.turns().catch(() => null),
      tokens: context?.tokens ?? null,
      window: context?.window ?? null,
      percent: context?.percent ?? null,
      costUsd: usage?.cost?.usd ?? null,
      categories: categories.map(category => ({
        name: category.name,
        tokens: category.tokens,
        color: category.color,
      })),
      limits: (usage?.rateLimits ?? []).map(limit => ({
        kind: limit.kind,
        percent: limit.percentUsed,
        resetsMs: stampOf(limit.resetsAt),
      })),
      plugins: pluginsOf(skills),
    }
  }

  /**
   * Reads the history file the Stats tab draws, once: `~/.claude` is where
   * every prompt this machine has typed is recorded, one line each.
   *
   * Under a mebibyte on a machine years into its use, and read only when the
   * tab is looked at — so it is one read and not a poll. A machine with no
   * such file, or one the plugin may not read, leaves the tab saying so.
   */
  async function readHistory(): Promise<void> {
    if (isReadingHistory || prompts !== null || !host) {
      return
    }

    isReadingHistory = true
    requestRedraw()

    try {
      // The clock comes with the read: a day is settled against it, and the
      // Stats tab may be the first thing opened in a session that has not
      // finished a turn yet, which is where the other polls set it.
      state = { ...state, nowMs: await host.now().catch(() => state.nowMs) }

      const home = await host.home().catch(() => undefined)

      if (home === undefined) {
        return
      }

      const text = await host
        .readFile(`${home.replace(/[\/]+$/, '')}/${HISTORY_PATH}`)
        .catch(() => null)

      if (text !== null) {
        prompts = promptsOf(text)
      }
    } finally {
      isReadingHistory = false
      requestRedraw()
    }
  }

  /**
   * Reads this session's record back, once.
   *
   * `session.start` is the obvious moment and not the only one. Writing a
   * `/config` row reloads the module — `register` runs again on an empty
   * state — and the session does not start over with it, so a cockpit that
   * only ever restored at `session.start` would go blank for the rest of a
   * session the moment somebody changed one of its own options. Hiding a tab
   * is exactly such a change, and nobody would connect the two.
   *
   * Guarded rather than ordered: whichever of the two paths arrives first
   * does it, and the other finds it done.
   *
   * @returns once the record is read, or at once where there is none
   */
  async function restoreSession(): Promise<void> {
    if (hasRestored || !host) {
      return
    }

    hasRestored = true

    // A session's id is its transcript's name, and `claude --resume`
    // continues the transcript it names: the same session finds its own
    // record under its own id, and a /clear or a fork, which open a
    // transcript of their own, find nothing and start on empty tabs.
    sessionKey = sessionKeyOf(await host.id().catch(() => ''))

    if (sessionKey === null) {
      // No id yet: this is a fresh load rather than a reload, and
      // `session.start` is about to do this properly.
      hasRestored = false

      return
    }

    state = restoredOf(
      await host.storeGet(sessionKey).catch(() => undefined),
      state,
    )

    const storedTab = await host.storeGet(STORE_TAB_KEY).catch(() => undefined)

    if (
      typeof storedTab === 'string' &&
      tabs.has(storedTab) &&
      !isHidden(storedTab, hidden)
    ) {
      selected = storedTab
    }

    requestRedraw()
  }

  /**
   * Writes this session's record, once a turn.
   *
   * A turn is the right grain: a burst of thirty tool calls costs one write,
   * and the only thing a turn leaves out is what happens after the last one
   * ends, which is nothing a tab draws.
   */
  async function keepState(): Promise<void> {
    const engine = host
    const key = sessionKey

    if (!engine || key === null) {
      return
    }

    const atMs = await engine.now().catch(() => state.nowMs)

    await engine.storeSet(key, keptOf(state, atMs)).catch(() => undefined)
  }

  /**
   * One reading of the session's vitals, written onto the state without a
   * mark on the sparkline: a column there is a finished turn, and this runs
   * when the Session tab is looked at, which is not one.
   *
   * `breakdown: 'summary'` is estimated locally and sends no request, so a
   * tab that is looked at often costs the session nothing but the reading.
   */
  async function readVitals(): Promise<void> {
    const vitals = await vitalsOf()
    const nowMs = (await host?.now().catch(() => null)) ?? state.nowMs

    // The clock comes with the reading, since what the tab draws beside a
    // plan window is how long is left of it, counted from this instant.
    state = { ...state, vitals, nowMs }

    requestRedraw()
  }

  /**
   * Arms a file for the next prompt, or disarms the armed one, and says so.
   *
   * @param path the file the pressed row names
   */
  function arm(path: string): void {
    state = withArmed(state, path)

    // A file that was just disarmed says so by its own row going back to
    // `ask`; a toast for it would be the cockpit talking about nothing.
    if (state.armed.includes(path)) {
      host?.toast(say().pane.armed(fitText(path, 60), state.armed.length))
    }

    requestRedraw()
  }

  /**
   * One finished turn as the ledger takes it, or null where the engine
   * reported no usage: the turn was interrupted before a response, or died
   * on an API error, and four zeroes would say it answered for nothing.
   *
   * @param e the turn as it ended
   * @returns the turn's cost, or null
   */
  function costOf(e: {
    agentId?: string
    durationMs: number
    usage?: {
      model: string
      input_tokens: number
      output_tokens: number
      cache_read_input_tokens: number
      cache_creation_input_tokens: number
    }
  }): TurnCost | null {
    if (!e.usage) {
      return null
    }

    return {
      agentId: e.agentId ?? null,
      durationMs: e.durationMs,
      model: e.usage.model,
      input: e.usage.input_tokens,
      output: e.usage.output_tokens,
      cacheRead: e.usage.cache_read_input_tokens,
      cacheWrite: e.usage.cache_creation_input_tokens,
    }
  }

  /**
   * Records one finished tool call: its tally, its line in the recent list,
   * the file it touched, and the flag its tab wears until it is looked at.
   *
   * @param e the call as the model made it
   * @param startedMs when it started, on the engine's clock
   * @param endedMs when it finished
   * @param isErrored whether it failed, was denied or threw
   */
  function note(
    e: { tool: string },
    startedMs: number,
    endedMs: number,
    isErrored: boolean,
  ): void {
    const input = e as unknown as Record<string, unknown>

    // A call that failed touched nothing the tab should credit it with; its
    // tally and its line in the recent list still stand, since what Claude
    // tried is as worth seeing as what it managed.
    const touches = isErrored
      ? []
      : touchesOf(e.tool, input, cwd, isReadingBash)

    state = withCall(
      state,
      {
        tool: e.tool,
        detail: detailOf(e.tool, input),
        ms: Math.max(0, endedMs - startedMs),
        isErrored,
      },
      touches,
      endedMs,
    )

    if (touches.some(touch => touch.kind === 'write')) {
      mark('files', 'dot')

      if (isAutoOpening && !hasAutoOpened && !isOpen && isFullscreen) {
        hasAutoOpened = true

        void openPane().catch(() => undefined)
      }
    }

    requestRedraw()
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)

    host ??= {
      invalidate: () => beneath.ui.invalidate('ui.render'),
      openPane: pane => beneath.ui.open(pane),
      closePane: pane => beneath.ui.close(pane),
      focus: args => beneath.ui.focus(args),
      storeSet: (key, value) => beneath.store.set(key, value),
      storeGet: key => beneath.store.get(key),
      id: () => beneath.session.id(),
      agents: () => beneath.agent.list(),
      usage: () => beneath.session.usage({ breakdown: 'summary' }),
      model: () => beneath.session.model(),
      turns: () => beneath.session.turns(),
      repo: () => beneath.session.repo(),
      readFile: path => beneath.fs.read(path),
      // Two variables, each spelled out: the engine takes the name as a
      // literal, and the one that answers is the host's business.
      home: async () =>
        (await beneath.env.get('USERPROFILE')) ??
        (await beneath.env.get('HOME')),
      run: (argv, at, timeoutMs) =>
        beneath.process.run(argv, { cwd: at, timeoutMs }),
      now: () => beneath.clock.now(),
      after: (ms, fn) => beneath.clock.after(ms, fn),
      every: (ms, fn) => beneath.clock.every(ms, fn),
      toast: text => beneath.ui.toast(text),
    }

    // A reload — a `/config` row written, a file saved while the folder is
    // watched — rebuilds `$` without starting the session over. This is the
    // only moment the module has to notice, so it asks then whether there is
    // a record of a session already under way. A fresh load finds no id and
    // leaves it to `session.start`.
    beneath.clock.after(REDRAW_MS, () => {
      void restoreSession().catch(() => undefined)
    })

    const cockpit: EngineInterface['cockpit'] = {
      tab: async tab => {
        tabs.set(tab.id, tab)

        // A plugin's tab may arrive after the cockpit's own, and the rail may
        // have nothing on it yet: every built-in one left out, or none
        // registered. It is then the tab the rail opens on.
        if (
          !tabs.has(selected) ||
          (isHidden(selected, hidden) && !isHidden(tab.id, hidden))
        ) {
          selected = tab.id
        }

        requestRedraw()
      },
      drop: async id => {
        tabs.delete(id)
        badges.delete(id)

        if (selected === id) {
          selected = ordered()[0]?.id ?? defaultTab
        }

        requestRedraw()
      },
      show: async id => {
        await openPane({ id })
      },
      hide: async () => {
        await closePane()
      },
      mark: async flag => {
        mark(flag.id, flag.badge)
      },
      redraw: async () => {
        requestRedraw()
      },
      tabs: async () =>
        ordered().map(tab => ({
          id: tab.id,
          title: tab.title,
          order: tab.order ?? 50,
          isSelected: tab.id === selected,
          badge: badges.get(tab.id) ?? null,
        })),
    }

    return { ...beneath, cockpit }
  })

  on('session.start', async ($, e, next) => {
    const deps = {
      state: () => state,
      arm,
      root: () => repoRoot ?? cwd,
      host: () => hostStat,
      picked: () => picked,
      pick: (key: string) => {
        pick(key, true)
      },
      isAll: (id: string) => whole.has(id),
      showAll: (id: string, isAll: boolean) => {
        if (isAll) {
          whole.add(id)
        } else {
          whole.delete(id)
        }

        requestRedraw()
      },
      refreshGit: () => {
        void askGit()
      },
      refreshVitals: () => {
        void readVitals()
      },
      prompts: () => prompts,
      isReading: () => isReadingHistory,
      range: () => statsRange,
      setRange: (range: Range) => {
        statsRange = range

        requestRedraw()
      },
      refreshStats: () => {
        void readHistory()
      },
      nowMs: () => state.nowMs,
    }

    for (const tab of builtinTabs(deps)) {
      tabs.set(tab.id, tab)
    }

    // The working directory the shell commands of this session spell their
    // relative paths against; without it a file `cat`ed as `hooks/x.ts` and
    // one read as `/w/hooks/x.ts` would be two rows of the same file.
    cwd = await $.session.cwd().catch(() => '')

    // A session's id is its transcript's name, and `claude --resume`
    // continues the transcript it names: the same session finds its own
    // record under its own id, and a /clear or a fork, which open a
    // transcript of their own, find nothing and start on empty tabs.
    // Asked here rather than at the first `git status`: every row of the
    // Files tab is drawn against this root, and a tab drawn before the answer
    // landed would spell whole paths once and short ones ever after.
    await rootOf()

    await restoreSession()

    for (const stale of staleKeysOf(
      await $.store.keys().catch(() => []),
      sessionKey,
    )) {
      await $.store.delete(stale).catch(() => undefined)
    }

    await $.command
      .register({
        name: COMMAND_NAME,
        description: say().pane.command,
        argumentHint: say().pane.commandHint,
      })
      .catch(() => undefined)

    // The tab a session opens on may be one the person has since left out —
    // the one it was left on, or the one the manifest names. Either way the
    // rail draws the first tab there is instead of a tab that is not there.
    if (isHidden(selected, hidden) || !tabs.has(selected)) {
      selected = ordered()[0]?.id ?? selected
    }

    wasOpen = (await $.store.get(STORE_OPEN_KEY).catch(() => undefined)) === true

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    columns = e.viewport?.columns ?? columns
    isFullscreen = e.viewport?.isFullscreen ?? isFullscreen

    if (!hasMeasured && e.viewport?.columns !== undefined) {
      hasMeasured = true

      if (wasOpen && !isOpen) {
        void openPane().catch(() => undefined)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isBanding || e.props.hasSurvey) {
      return next(e)
    }

    columns = e.viewport?.columns ?? columns
    isFullscreen = e.viewport?.isFullscreen ?? isFullscreen

    // Drawn once, and the cockpit's row goes under it: a band is shared, and
    // a cockpit that fails to draw its button leaves the band as it found it.
    const below = await next(e)

    return bandView({
      ui: await $.ui.resolve(e),
      below,
      isOpen,
      toggle: () => {
        void togglePane()
      },
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) {
      return next(e)
    }

    const ui = await $.ui.resolve(e)
    const box = bodyBoxOf(e.props.bodyColumns, e.props.scroll.bodyRows)

    // Asked for even though the pane is the cockpit's own, because a tab
    // another plugin contributed may have drawn its body in here: a `render`
    // cannot cross from that plugin's environment to this one, so it draws
    // from its own `ui.render` hook, and this is where its drawing arrives
    // when that hook sits inside this one.
    const below = await next(e)

    columns = e.viewport?.columns ?? columns
    placement = e.props.placement
    isFocused = e.props.isFocused

    // One cast: `e` is a union over the four surfaces and `$.ui.resolve`
    // answers that surface's table, but the pair only narrows together
    // inside a per-surface branch, which four copies of this line would be.
    const draw = {
      surface: e.surface,
      ui,
      columns: box.columns,
      rows: box.rows,
      isFocused: e.props.isFocused,
      placement: e.props.placement,
    } as CockpitDraw

    const tree = paneView({
      draw,
      tabs: ordered(),
      emptyText: registered().length === 0 ? say().pane.noTabs : say().rail.none,
      selected,
      badges: Object.fromEntries(badges),
      below,
      press: id => {
        // The ring shows a tab as it lands on it, so a press on the tab the
        // pane is already showing is the way into what it drew; a press on
        // any other — a click, one of the rail's digits — shows it. And a
        // tab another plugin drew is not the cockpit's to enter at all, which
        // is `entryOf`'s whole business.
        const into = entryOf(ring, selected, id)

        if (into !== null) {
          focusOn(into)

          return
        }

        select(id)
        host?.invalidate()
      },
    })

    // Read from the drawing itself, and here rather than at `ui.focus`: the
    // stops are what was last drawn, and a tab another plugin contributed
    // draws its own into the same ring.
    //
    // Whose they are is read the same way the pane reads it: a tab of this
    // module's carries a `render`, and a tab a plugin contributed cannot —
    // a closure does not cross the boundary — so its body is its own.
    const shown = ordered().find(tab => tab.id === selected) ?? ordered()[0]

    ring = ringOf(
      focusablesOf(tree),
      ordered().map(tab => tab.id),
      shown?.render !== undefined,
    )

    return tree
  })

  on('command.run', { command: COMMAND_NAME }, async (_$, e) => {
    columns = e.presentation.columns
    isFullscreen = e.presentation.isFullscreen
    hasMeasured = true

    const asked = e.args.trim()

    if (asked === HOST_ARG) {
      isHosting = !isHosting

      if (!isHosting) {
        hostStat = null
      }

      syncPolls()
      requestRedraw()

      return { text: isHosting ? say().pane.hostOn : say().pane.hostOff }
    }

    if (asked !== '') {
      if (!select(asked)) {
        // A tab the person hid is not a tab that does not exist, and saying
        // so would send them looking for a typo they did not make.
        const shut = tabs.get(asked)

        return {
          text:
            shut === undefined
              ? say().pane.unknownTab(asked, ordered().map(tab => tab.id))
              : say().rail.hidden(shut.title, say().rail.label),
        }
      }

      if (!isOpen) {
        await openPane({ isAsked: true })
      }

      return { text: `${PANE_TITLE}: ${tabs.get(asked)?.title ?? asked}.` }
    }

    if (isOpen) {
      await closePane()

      return { text: isFullscreen ? say().pane.closed : say().pane.dismissed }
    }

    await openPane({ isAsked: true })

    return { text: isFullscreen ? say().pane.opened : '' }
  })

  on('config.describe', { key: CONFIG_LANG_KEY }, async (_$, e, next) =>
    // The languages there are, rather than the ones the manifest happened to
    // list when it was written: a row's options cannot be rewritten here
    // (`ConfigDescribeResult` omits them), but its help can, and a language
    // added to `LANGUAGES` without the manifest line shows up here at once.
    next({
      ...e,
      description: `${e.description ?? ''} Available: ${LANGUAGE_TAGS.join(', ')}.`,
    }),
  )

  on('config.describe', { key: CONFIG_TABS_KEY }, async (_$, e, next) => {
    // `/config` has no row that picks several of a list, and this hook may
    // rewrite a row's help but neither its kind nor its options. So the help
    // is where the ids can be read rather than guessed — written fresh off
    // the tabs registered at the moment the menu lists the row, which is the
    // only moment a plugin's tab is knowable at all.
    const all = registered().map(tab => tab.id)

    return next({
      ...e,
      label: say().rail.label,
      description: say().rail.help(
        all.filter(id => !isHidden(id, hidden)),
        all.filter(id => isHidden(id, hidden)),
      ),
    })
  })

  on('config.set', { key: CONFIG_TABS_KEY }, async (_$, e, next) => {
    const checked = checkOf(
      e.value,
      registered().map(tab => tab.id),
      say().rail.unknown,
    )

    // An id no tab carries hides nothing, and the rail looks exactly as it
    // did — so the row would show a typo as if it had taken. The menu draws
    // this reason beside it instead.
    return checked.deny !== undefined
      ? { deny: checked.deny }
      : next({ ...e, value: checked.value })
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    isOpen = false
    isFocused = false

    // A closed pane has no ring, and the key it was on names nothing the next
    // drawing will carry: a pane that opens again opens with its ring where
    // the surface puts it.
    focusKey = null
    ring = NO_RING

    syncPolls()

    if (e.origin.kind === 'person') {
      void $.store.set(STORE_OPEN_KEY, false).catch(() => undefined)
    }

    return next(e)
  })

  // No matcher, and `{ plugin: PLUGIN_NAME }` in particular: the moves this
  // has to see are the ones onto the surface's own stops — the close mark,
  // another pane's tab — and those carry no `plugin` at all, so a matcher
  // naming one skips exactly the moves the rail has to come back from.
  on('ui.focus', (_$, e, next) => {
    isFocused = e.requestId === PANE_ID

    if (e.requestId !== PANE_ID) {
      return next(e)
    }

    const landing = landingOf(ring, railKey(selected), focusKey, e.element)

    // Where the move is a step along the row the ring is on — or somebody
    // pointing straight at a row — it stands, and the tab or the row under it
    // follows: the person walking the rail sees each tab as they reach it,
    // and the person walking a list reads each row whole without pressing.
    if (landing === null) {
      focusKey = e.element ?? null

      follow(e.element)

      return next(e)
    }

    // Off the end of a row, with nowhere else to be: the move is kept, which
    // is the whole of what a rail of one tab needs.
    if (landing === focusKey) {
      return {}
    }

    if (e.element === undefined || e.plugin !== PLUGIN_NAME) {
      focusOn(landing)

      return {}
    }

    focusKey = landing

    follow(landing)

    return next({ ...e, element: landing })
  })

  on('tool.call', async ($, e, next) => {
    const startedMs = await $.clock.now().catch(() => 0)

    try {
      const result = await next(e)

      note(
        e,
        startedMs,
        await $.clock.now().catch(() => startedMs),
        result.isError === true || result.deny !== undefined,
      )

      return result
    } catch (error: unknown) {
      note(e, startedMs, await $.clock.now().catch(() => startedMs), true)

      throw error
    }
  })

  on('turn.complete', async (_$, e, next) => {
    // Every turn goes on the ledger, a subagent's as much as the main loop's:
    // `usage` is the only place the four token counters are ever reported,
    // and a subagent's are spent by this session all the same.
    state = withCostOf(state, costOf(e))

    if (e.agentId !== undefined) {
      requestRedraw()

      return next(e)
    }

    state = withTurn(state, await vitalsOf())

    // Once a turn, whatever tab is up: the agents of a turn are done by the
    // end of it, and a roster that only moves while its tab is open would
    // have nothing to show the first time it is opened.
    await pollAgents()

    await keepState()

    requestRedraw()

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    // The engine raises this whenever the cost, the window or a plan window
    // moves, which is exactly when the Usage tab is out of date. It is the
    // reading the tab would otherwise poll for, handed over for nothing.
    state = {
      ...state,
      nowMs: await $.clock.now().catch(() => state.nowMs),
      vitals: {
        ...state.vitals,
        tokens: e.context.tokens ?? state.vitals.tokens,
        window: e.context.window,
        percent: e.context.percent ?? state.vitals.percent,
        costUsd: e.cost?.usd ?? state.vitals.costUsd,
        limits: e.rateLimits.map(limit => ({
          kind: limit.kind,
          percent: limit.percentUsed,
          resetsMs: stampOf(limit.resetsAt),
        })),
      },
    }

    requestRedraw()

    return next(e)
  })

  on('prompt.submit', async (_$, e, next) => {
    const paths = state.armed

    if (paths.length === 0) {
      return next(e)
    }

    state = withSent(state)

    // The note itself is a context block, which the person never sees. So the
    // row keeps the word `sent`, the rail flags the tab for someone looking
    // at another one, and the toast says it where the pane is shut — a docked
    // pane holds its toasts until it closes, and is itself the news there.
    mark('files', 'dot')
    host?.toast(say().pane.sent(paths.map(one => fitText(one, 60))))

    requestRedraw()

    return next({ ...e, context: [...(e.context ?? []), askOf(paths)] })
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const at = await $.clock.now().catch(() => null)

    // The spawn is the only moment the cockpit knows an agent started; the
    // poll that first lists it may be two seconds late, or, with the Agents
    // tab shut, a whole turn.
    if (typeof spawned.agentId === 'string' && at !== null) {
      spawnedMs.set(spawned.agentId, at)
    }

    mark('agents', 'dot')

    void pollAgents()

    return spawned
  })
}

/**
 * The one line a tool call is listed by: the argument that says what it did,
 * the first of the ones tools name their subject with.
 *
 * An MCP tool names its arguments as its server pleases, and often none of
 * them is one of these; there the first argument that reads as text stands
 * in, since a line saying only `linear·save_issue` says half of what
 * happened. For a built-in tool the list is the whole of it: one that named
 * none of these named nothing a line should draw.
 *
 * @param tool the tool's name, as the call carries it
 * @param input the call's input as it crossed
 * @returns the line, empty where nothing in it reads as a subject
 */
function detailOf(tool: string, input: Record<string, unknown>): string {
  const keys = [
    'command',
    'file_path',
    'notebook_path',
    'path',
    'pattern',
    'url',
    'query',
    'description',
    'prompt',
  ]

  for (const key of keys) {
    const value = input[key]

    if (typeof value === 'string' && value !== '') {
      return fitText(value, 120)
    }
  }

  if (!tool.startsWith('mcp__')) {
    return ''
  }

  for (const [key, value] of Object.entries(input)) {
    if (
      !RESERVED_KEYS.includes(key) &&
      typeof value === 'string' &&
      value !== ''
    ) {
      return fitText(value, 120)
    }
  }

  return ''
}

/**
 * The keys a call's input carries that are not arguments of the tool, and
 * that no line should be drawn from.
 */
const RESERVED_KEYS: readonly string[] = [
  'tool',
  'tool_use_id',
  'agentId',
  'consent',
]
