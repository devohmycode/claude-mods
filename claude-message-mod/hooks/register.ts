import type {
  CockpitDraw,
  CockpitTabInfo,
  EngineInterface,
  FsEntry,
  On,
  PaneOpenArgs,
  PluginOptions,
  RenderElement,
  Timer,
  ToolInfo,
} from 'claude-code'

import {
  boxOf,
  homeOf,
  noteNameOf,
  noteOf,
  noteTextOf,
  readbackOf,
  threadDirOf,
} from './box'
import type { Box, Filed } from './box'
import { bytesOf, firstLineOf, fitText } from './format'
import {
  BODY_PAD_COLUMNS,
  CHROME_ROWS,
  COCKPIT_CHROME_ROWS,
  COCKPIT_PANE,
  COCKPIT_PLUGIN,
  COCKPIT_RAIL_KEY,
  COMMAND_SPEC,
  DIALOG_ROWS,
  DOCK_MIN_COLUMNS,
  HAND_ARG,
  HELD_KINDS,
  HOLD_ARG,
  LIST_TOOL,
  ROSTER_MAX,
  ROSTER_MS,
  SEND_SUMMARY,
  SEND_TOOL,
  SLOT_KEY,
  UNKNOWN_PEER,
  TAB_ID,
  TAB_ORDER,
  TAB_TITLE,
  TEXTS,
  WHO_ARG,
} from './names'
import {
  EMPTY,
  bodyOf,
  handOf,
  heldOf,
  idOf,
  labelIn,
  peersOf,
  senderOf,
  stampOf,
  withFiled,
  withHanded,
  withIn,
  withOut,
  withWho,
  withoutNote,
  withoutThread,
} from './thread'
import type { Peer, State } from './thread'
import { liveOf, placeOf, seatOf, seatsDirOf, selfOf } from './roster'
import type { Seat } from './roster'
import { filled, foundIn } from './slot'
import { messageView } from './view'
import { isReturning } from './zoom'

/**
 * What this mod reaches the world through once its dispatch is over: one
 * closure per call it makes, each spelling its own call on the engine
 * beneath the plugin.
 *
 * Every button of the tab and every field of it runs outside a dispatch —
 * core runs an element's `onPress` and `onSubmit` in the plugin's own
 * environment, which is this closure table and not a `$`. So `$` is never
 * captured, and everything here is a core noun: the cockpit's own calls are
 * spelled out in the hooks that have a `$` of their own.
 */
type Host = {
  invalidate: () => void
  openPane: (pane: PaneOpenArgs) => Promise<void>
  closePane: (id: string) => Promise<void>
  toast: (text: string) => void
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  write: (path: string, text: string) => Promise<void>
  read: (path: string) => Promise<string>
  list: (path: string) => Promise<FsEntry[]>
  tools: () => Promise<ToolInfo[]>
  send: (to: string, message: string, isNotifying: boolean) => Promise<unknown>
  submit: (text: string) => Promise<unknown>
}

/**
 * Registers the message mod: the Message tab in the cockpit, the pane it
 * falls back on, the hold that keeps another session's delivery out of this
 * one's context, and the field that answers without starting a turn.
 *
 * The one hook that matters is `session.receive`. It is the only place in
 * the engine where an entry into the context can be refused before it costs
 * anything — the repository's rule is that one compresses on the way in and
 * never afterwards, and a delivery is exactly that case. Everything else
 * here exists so that the refusal is safe: the message is on disk before it
 * is taken, it is taken only where a person can see it, and one button hands
 * it over the moment they decide it is worth reading.
 *
 * @param on the engine's registrar
 * @param options the manifest's `userConfig`, as the person set it
 */
export function register(on: On, options: PluginOptions): void {
  const isToasting = options.toast !== false
  const isRaising = options.raise === true

  /**
   * Whether a peer's delivery is held out of the context. The manifest sets
   * what a session starts on; `/message hold` turns it over for this session
   * alone, which is what makes the whole path testable without writing a
   * line of config — and `$.config.set` would reload the module and lose the
   * thread with it.
   */
  let isHolding = options.hold !== false

  let host: Host | null = null
  let state: State = EMPTY
  let mailbox: Box | null = null
  let home: string | null = null

  let selfId = ''

  /**
   * Whether a person could actually see a held message: a session with no
   * one at the keyboard must not have its deliveries taken, since nobody
   * would ever press the button that hands them over.
   */
  let isShowable = false

  /**
   * Whether the cockpit took the tab. False leaves `/message` to open this
   * mod's own pane, which draws the very same view.
   */
  let hasTab = false

  let isOpen = false

  /**
   * Whether the pane open now is the one Enter opened over a cockpit that
   * stepped aside: the only pane that owes the cockpit a return.
   */
  let isZoomed = false

  let columns: number | null = null
  let isFullscreen = true

  /**
   * Whether the next answer also subscribes to the correspondent's next
   * idle. `SendMessage` carries that subscription on a message, so what the
   * button arms is the next send and not a request of its own.
   */
  let isNotifying = false

  /**
   * The sessions the engine's register has running, as the left column draws
   * them.
   */
  let seats: readonly Seat[] = []

  /**
   * This session, as the register has it: the name another session would
   * write to, drawn at the head of the column.
   */
  let me: Seat | null = null

  /**
   * How many notes this session has written in the millisecond it is in, so
   * two deliveries in one tick are two files and not one overwritten twice.
   */
  let lastWriteMs = 0
  let nthInMs = 0

  let rosterTimer: Timer | null = null
  let hasReadBack = false

  /**
   * The messages the person asked to see whole, by the address `idOf` gives
   * them.
   *
   * A thread draws a long message cut, with a `Show more` under it; this is
   * what that press holds. In memory and not in the config: a line of
   * `userConfig` would reload the module, and the thread would go with it.
   */
  const opened = new Set<string>()

  /**
   * The held messages picked for the next hand-over, by the same address.
   *
   * Empty means every held one, which is what the button did before a
   * message could be picked at all: a person who picks nothing still hands
   * over the pile.
   */
  const picked = new Set<string>()

  /**
   * Forgets what was remembered about messages the thread no longer has, or
   * no longer holds.
   *
   * Two sets address notes by their clock and their direction, and a note
   * removed, cleared or handed over leaves its address behind in both. An
   * address that outlived its note would pick a message that arrives in the
   * same millisecond in a later session — which is unlikely, and exactly the
   * kind of unlikely that is hard to explain afterwards.
   */
  function prune(): void {
    const drawn = new Set(state.notes.map(idOf))
    const held = new Set(heldOf(state).map(idOf))

    for (const id of opened) {
      if (!drawn.has(id)) {
        opened.delete(id)
      }
    }

    for (const id of picked) {
      if (!held.has(id)) {
        picked.delete(id)
      }
    }
  }

  /**
   * Writes one note to the mailbox.
   *
   * The first step of every path that keeps a message, and the one that is
   * allowed to fail loudly: a delivery this returns false for is handed
   * straight back to the engine, because a message that was neither written
   * nor queued would simply be gone.
   *
   * @param note the note
   * @returns whether it landed on disk
   */
  async function writeNote(note: Filed): Promise<boolean> {
    const engine = host
    const box = mailbox

    if (engine === null || box === null || selfId === '') {
      return false
    }

    nthInMs = note.at === lastWriteMs ? nthInMs + 1 : 0
    lastWriteMs = note.at

    try {
      await engine.write(
        `${threadDirOf(box, selfId)}/${noteNameOf(note.at, nthInMs)}`,
        noteTextOf(note),
      )

      return true
    } catch {
      return false
    }
  }

  /**
   * Reads this session's own thread back from disk, once, when the tab is
   * first looked at.
   *
   * On show rather than at `session.start`: a folder of notes is a read per
   * note, and a session whose person never opens the tab should not pay for
   * a conversation nobody asked to see.
   */
  async function readBack(): Promise<void> {
    const engine = host
    const box = mailbox

    if (engine === null || box === null || hasReadBack || selfId === '') {
      return
    }

    hasReadBack = true

    const dir = threadDirOf(box, selfId)
    const entries = await engine.list(dir).catch(() => [] as FsEntry[])
    const filed: Filed[] = []

    for (const name of readbackOf(
      entries.filter(entry => entry.kind === 'file').map(entry => entry.name),
    )) {
      const note = noteOf(await engine.read(`${dir}/${name}`).catch(() => ''))

      if (note !== null) {
        filed.push(note)
      }
    }

    if (filed.length > 0) {
      state = withFiled(state, filed)

      engine.invalidate()
    }
  }

  /**
   * Reads the engine's own register of running sessions.
   *
   * Nothing is written. The register carries the name each session goes by —
   * the one `/rename` sets, and the one `SendMessage` takes — where a
   * presence of this mod's own carried the repository's folder, which was the
   * same word for every session in one checkout and a recipient the engine
   * would have refused.
   *
   * The screen is asked to redraw only where the column actually changed, so
   * a reading every thirty seconds is not a repaint every thirty seconds.
   */
  async function readRoster(isAsked = false): Promise<void> {
    const engine = host

    if (engine === null || home === null) {
      return
    }

    const at = await engine.now().catch(() => 0)
    const dir = seatsDirOf(home)
    const entries = await engine.list(dir).catch(() => [] as FsEntry[])
    const seen: Seat[] = []

    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) {
        continue
      }

      if (seen.length >= ROSTER_MAX) {
        break
      }

      const one = seatOf(
        await engine.read(`${dir}/${entry.name}`).catch(() => ''),
      )

      if (one !== null) {
        seen.push(one)
      }
    }

    const live = liveOf(seen, selfId, at)
    const was = seats.map(one => `${one.name}:${String(one.isBusy)}`).join(',')

    seats = live
    me = selfOf(seen, selfId)

    // A reading that changed nothing asks for no repaint, unless a person
    // pressed for it: a button that answers with a still screen has not
    // obviously done anything.
    if (
      isAsked ||
      live.map(one => `${one.name}:${String(one.isBusy)}`).join(',') !== was
    ) {
      engine.invalidate()
    }

    if (isAsked) {
      engine.toast(TEXTS.refreshed(live.length))
    }
  }

  /**
   * Sends one answer, without a model turn: this calls the tool itself, in
   * the session's own loop.
   *
   * Nothing is recorded before the call comes back. A row saying a message
   * went out when it did not is worse than no row at all.
   *
   * @param who the correspondent
   * @param text the answer
   * @returns whether it went out
   */
  const peersNow = (): readonly Peer[] =>
    peersOf(
      state,
      seats.map(one => ({
        address: one.address,
        name: one.name,
        place: placeOf(one.cwd),
        at: one.at,
        isBusy: one.isBusy,
      })),
    )

  /**
   * Sends one answer, without a model turn.
   *
   * @param who the recipient, as `SendMessage` takes it
   * @param text the answer
   * @param key the thread it is filed under, the recipient where unsaid
   * @returns whether it went out
   */
  async function sendTo(
    who: string,
    text: string,
    key: string = who,
  ): Promise<boolean> {
    const engine = host

    if (engine === null || who === '' || text.trim() === '') {
      return false
    }

    const tools = await engine.tools().catch(() => [] as ToolInfo[])

    if (!tools.some(tool => tool.name === SEND_TOOL)) {
      engine.toast(TEXTS.noSendTool)

      return false
    }

    // Stamped once, here, so that the file on disk and the note in the
    // thread carry the same clock and a readback recognises its own work.
    const at = stampOf(state, await engine.now().catch(() => 0), 'out')

    try {
      await engine.send(who, text, isNotifying)
    } catch {
      engine.toast(TEXTS.sendFailed(who))

      return false
    }

    state = withOut(state, at, key, text)
    isNotifying = false

    await writeNote({ at, kind: 'out', who: key, text })

    engine.toast(TEXTS.sent(who))
    engine.invalidate()

    return true
  }

  /**
   * What the field does on Enter: the same send, started and not waited on,
   * since a closure the surface runs answers nothing to anyone.
   *
   * @param text the answer, as typed
   */
  function send(text: string): void {
    const key = state.who

    if (key === null) {
      return
    }

    // The key a thread is filed under is an address; what `SendMessage` takes
    // is the name the register gives that address, where it gives one.
    const peer = peersNow().find(one => one.key === key)

    void sendTo(peer?.sendTo ?? key, text, key)
  }

  /**
   * Hands the held messages to Claude: the one moment they cost what they
   * would have cost all along.
   *
   * They stop being held only once the prompt is in. A hand-over that failed
   * and left the thread saying it had happened would hide a message twice.
   *
   * @param who the correspondent, or undefined for every one of them
   * @returns how many went over
   */
  async function handOver(who?: string, only?: ReadonlySet<string>): Promise<number> {
    const engine = host
    const notes = heldOf(state, who, only)

    if (engine === null) {
      return 0
    }

    if (notes.length === 0) {
      engine.toast(TEXTS.handedNone)

      return 0
    }

    try {
      // The column, not the keys: what goes into the context names its
      // senders the way `SendMessage` takes them, so an answer costs the
      // model one call and not a search through the engine's register.
      await engine.submit(handOf(notes, peersNow()))
    } catch {
      return 0
    }

    state = withHanded(state, who, only)

    prune()

    engine.toast(TEXTS.handed(notes.length))
    engine.invalidate()

    return notes.length
  }

  /**
   * What the tab is handed: the thread at draw time and the four things a
   * press or a submit does.
   *
   * @param draw the elements, the box and how the pane sits
   * @returns the tab's tree
   */
  const view = (draw: CockpitDraw) =>
    messageView({
      draw,
      state,
      peers: peersNow(),
      isNotifying,
      self: me === null ? null : me.name,
      isAll: id => opened.has(id),
      showAll: (id, isAll) => {
        if (isAll) {
          opened.add(id)
        } else {
          opened.delete(id)
        }

        host?.invalidate()
      },
      isPicked: id => picked.has(id),
      pick: (id, isPicked) => {
        if (isPicked) {
          picked.add(id)
        } else {
          picked.delete(id)
        }

        host?.invalidate()
      },
      drop: id => {
        state = withoutNote(state, id)

        prune()

        host?.toast(TEXTS.dropped)
        host?.invalidate()
      },
      refresh: () => {
        void readRoster(true)
      },
      select: who => {
        state = withWho(state, who)

        host?.invalidate()
      },
      send,
      hand: () => {
        void handOver(state.who ?? undefined, picked)
      },
      clear: () => {
        const who = state.who

        if (who !== null) {
          state = withoutThread(state, who)

          prune()

          host?.invalidate()
        }
      },
      notify: () => {
        isNotifying = !isNotifying

        host?.invalidate()
      },
    })

  /**
   * Opens this mod's own pane: the one `/message` falls back on where no
   * cockpit is seated, and the one Enter on the cockpit's tile opens over a
   * cockpit that has stepped aside.
   *
   * Docked beside the transcript where the terminal is in its fullscreen
   * layout and wide enough, a dialog above the prompt otherwise — the same
   * choice the cockpit makes, so the tab sits the same way either way.
   *
   * @param isZoom whether the cockpit stepped aside for it, which is what
   *   makes Escape close the docked pane rather than merely hand the keyboard
   *   back, and what tells the close to bring the cockpit round again
   */
  async function openPane(isZoom = false): Promise<void> {
    const engine = host

    if (engine === null) {
      return
    }

    const isDocked =
      isFullscreen && (columns === null || columns >= DOCK_MIN_COLUMNS)

    await engine
      .openPane(
        isDocked
          ? {
              id: TAB_ID,
              title: TAB_TITLE,
              focus: true,
              holdToasts: true,
              // A docked pane keeps Escape to itself: the key hands the
              // keyboard back and the pane stays. The one Enter opened stands
              // in for the cockpit, so there the key closes it, and the
              // cockpit comes back in its place.
              closeOnEscape: isZoom ? true : undefined,
            }
          : {
              id: TAB_ID,
              title: TAB_TITLE,
              focus: true,
              closeOnEscape: true,
              rows: DIALOG_ROWS,
            },
      )
      .catch(() => undefined)

    isOpen = true
    isZoomed = isZoom

    void readBack()
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)

    host ??= {
      invalidate: () => beneath.ui.invalidate('ui.render'),
      // Whether the pane was drawn at once or waits is the engine's to say
      // (2.1.280); either way it is open, which is all this caller needs.
      openPane: pane => beneath.ui.open(pane).then(() => undefined),
      closePane: id => beneath.ui.close({ id }),
      toast: text => beneath.ui.toast(text),
      now: () => beneath.clock.now(),
      after: (ms, fn) => beneath.clock.after(ms, fn),
      every: (ms, fn) => beneath.clock.every(ms, fn),
      write: (path, text) => beneath.fs.write(path, text),
      read: path => beneath.fs.read(path),
      list: path => beneath.fs.list(path),
      tools: () => beneath.tool.list(),
      send: (to, message, isSubscribing) =>
        beneath.tool.call({
          tool: SEND_TOOL,
          to,
          message,
          summary: SEND_SUMMARY,
          notify_when_idle: isSubscribing,
        }),
      submit: text => beneath.prompt.submit({ text }),
    }

    const message: EngineInterface['message'] = {
      send: async (to, text) => sendTo(to, text),
      hand: async who => handOver(who),
      held: async () =>
        heldOf(state).map(note => ({
          at: note.at,
          who: note.who,
          text: note.text,
          bytes: note.bytes,
        })),
      counts: async () => ({
        sent: state.sent,
        held: heldOf(state).length,
        handed: state.handed,
        bytes: state.bytes,
      }),
    }

    return { ...beneath, message }
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    isShowable = e.isInteractive

    selfId = await $.session.id().catch(() => '')

    home = homeOf(
      await $.env.get('USERPROFILE').catch(() => undefined),
      await $.env.get('HOME').catch(() => undefined),
    )

    mailbox = home === null ? null : boxOf(home)

    // A recommended dependency is called, never hooked: reading `$.cockpit`
    // throws where nobody provides the noun, and the catch is what decides
    // whether this mod is a tab of the cockpit or a pane of its own.
    //
    // Three plain fields and no `render`. A call on another plugin's noun
    // crosses from this environment to that one and its arguments must be
    // structured-cloneable; a function is not, and the engine refuses the
    // whole call — *the object can not be cloned*. So the cockpit is told
    // that the tab exists, and the body is drawn from this mod's own
    // `ui.render` hook, into the slot the cockpit leaves for it.
    try {
      await $.cockpit.tab({
        id: TAB_ID,
        title: TAB_TITLE,
        order: TAB_ORDER,
      })

      hasTab = true
    } catch {
      hasTab = false
    }

    await $.command.register(COMMAND_SPEC).catch(() => undefined)

    if (host !== null) {
      await readRoster()

      rosterTimer ??= host.every(ROSTER_MS, () => {
        void readRoster()
      })
    }

    return started
  })

  on('session.receive', { origin: { kind: HELD_KINDS } }, async ($, e, next) => {
    if (!isHolding || !isShowable || host === null || mailbox === null) {
      return next(e)
    }

    const at = stampOf(state, await $.clock.now().catch(() => 0), 'in')
    const who = senderOf(e.text) ?? UNKNOWN_PEER

    // The disk first: what is not written is not taken. An engine that
    // cannot write is an engine whose deliveries go the way they always did.
    // The frame goes on disk with the message: it is what the delivery was,
    // and what the address in it was read from.
    if (!(await writeNote({ at, kind: 'in', who, text: e.text }))) {
      return next(e)
    }

    // The body is what is shown; the bytes are the whole of what the
    // transcript would have carried, frame and all.
    state = withIn(state, at, who, bodyOf(e.text), bytesOf(e.text))

    try {
      await $.cockpit.mark({ id: TAB_ID, badge: heldOf(state).length })

      if (isRaising) {
        await $.cockpit.show(TAB_ID)
      }
    } catch {
      // No cockpit under us: the toast and `/message` are the whole news.
    }

    if (isToasting) {
      $.ui.toast(
        TEXTS.arrived(
          labelIn(peersNow(), who),
          fitText(firstLineOf(bodyOf(e.text)), 60),
        ),
      )
    }

    $.ui.invalidate('ui.render')

    // Taken: not queued, not written to the transcript, never read by the
    // model. The reason is logged under this plugin's name.
    return { consumed: TEXTS.held }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const isOwn = e.requestId === TAB_ID

    if (!isOwn && e.requestId !== COCKPIT_PANE) {
      return next(e)
    }

    columns = e.viewport?.columns ?? columns

    // One cast, as the cockpit's own pane makes: `e` is a union over the four
    // surfaces and `$.ui.resolve` answers that surface's table, but the pair
    // only narrows together inside a per-surface branch.
    const drawOf = async (chromeRows: number) =>
      ({
        surface: e.surface,
        ui: await $.ui.resolve(e),
        columns: Math.max(1, e.props.bodyColumns - BODY_PAD_COLUMNS),
        rows: Math.max(1, e.props.scroll.bodyRows - chromeRows),
        isFocused: e.props.isFocused,
        placement: e.props.placement,
      }) as CockpitDraw

    if (isOwn) {
      return view(await drawOf(CHROME_ROWS))
    }

    // The cockpit's pane. What is beneath is asked for first, because whether
    // this mod's hook sits inside the cockpit's or outside it is nothing
    // either of them chooses — and the answer is in the tree that comes back.
    const below = await next(e)

    let rail: readonly CockpitTabInfo[] = []

    try {
      rail = await $.cockpit.tabs()
    } catch {
      return below
    }

    if (rail.find(tab => tab.id === TAB_ID)?.isSelected !== true) {
      return below
    }

    void readBack()

    const body = view(await drawOf(COCKPIT_CHROME_ROWS))

    // Outside the cockpit: its drawing is in hand, slot and all, and the body
    // goes in where the slot was. Inside it: the cockpit has not drawn yet, so
    // the body is returned under the slot's own key, and the cockpit finds it
    // there instead of drawing an empty one.
    return foundIn(below, SLOT_KEY) === null
      ? body
      : (filled(below, SLOT_KEY, body) as RenderElement)
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    columns = e.viewport?.columns ?? columns
    isFullscreen = e.viewport?.isFullscreen ?? isFullscreen

    return next(e)
  })

  // The rail is the cockpit's, and its tile is the only place the person can
  // say they want into this tab. Nothing else crosses: a `render` does not, a
  // closure does not, and neither does the focus ring — the engine refuses
  // `$.ui.focus` on an element another plugin drew (*no element of its own is
  // drawn under that key*), and a `ui.focus` hook may only land the ring on
  // an element of the plugin the move was already heading at. So the tile's
  // press is heard here and answered with the one surface this mod may ask
  // the keyboard for: its own pane.
  on(
    'ui.press',
    { plugin: COCKPIT_PLUGIN, element: COCKPIT_RAIL_KEY },
    async ($, e, next) => {
      if (e.requestId !== COCKPIT_PANE) {
        return next(e)
      }

      // Read before the press runs, because the press is what changes it: a
      // tile that is not the shown one shows its tab, and only a tile already
      // shown is the person asking to go in.
      let isShown = false

      try {
        const rail = await $.cockpit.tabs()

        isShown = rail.find(tab => tab.id === TAB_ID)?.isSelected === true
      } catch {
        // Nothing answering for the rail: nothing drew that tile either.
      }

      const pressed = await next(e)

      if (!isShown) {
        return pressed
      }

      // The cockpit steps aside first. `focus` is a request the surface
      // grants only while the prompt holds the keys over an empty composer —
      // a pane the person holds refuses it — so a pane opened beside the open
      // cockpit would open without the keyboard, which is the whole of what
      // was asked for.
      try {
        await $.cockpit.hide()
      } catch {
        // Gone since the rail answered: our own pane is the whole of it.
      }

      await openPane(true)

      return pressed
    },
  )

  on('ui.close', { id: TAB_ID }, async ($, e, next) => {
    isOpen = false

    // Only a zoom owes the cockpit a return, and only where the person is the
    // one closing: a pane this mod closed itself is on its way somewhere.
    const wasZoomed = isZoomed

    isZoomed = false

    const closed = await next(e)

    if (isReturning(wasZoomed, e.origin.kind)) {
      try {
        await $.cockpit.show(TAB_ID)
      } catch {
        // The cockpit went while its tab stood in for it: nothing to return
        // to, and the prompt has the keys back either way.
      }
    }

    return closed
  })

  on('command.run', { command: COMMAND_SPEC.name }, async ($, e) => {
    columns = e.presentation.columns
    isFullscreen = e.presentation.isFullscreen

    const asked = e.args.trim()

    if (asked === HOLD_ARG) {
      isHolding = !isHolding

      return { text: isHolding ? TEXTS.holdOn : TEXTS.holdOff }
    }

    if (asked === HAND_ARG) {
      const waiting = heldOf(state).length

      if (waiting === 0) {
        return { text: TEXTS.handedNone }
      }

      // Not from here. The engine refuses `prompt.submit` inside a
      // `command.run` hook — it would wait on the turn this hook is holding —
      // and says so by name. A timer outlives its dispatch, so the hand-over
      // is left to one, and the command says what is on its way rather than
      // what has landed. The toast that follows says the rest.
      host?.after(0, () => {
        void handOver()
      })

      return { text: TEXTS.handing(waiting) }
    }

    if (asked === WHO_ARG) {
      const tools = await $.tool.list().catch(() => [] as ToolInfo[])

      if (!tools.some(tool => tool.name === LIST_TOOL)) {
        return { text: TEXTS.noListTool }
      }

      // Shown and not parsed: the engine answers one formatted listing, so
      // what the person reads is exactly what `SendMessage` will take.
      const listed = await $.tool
        .call({ tool: LIST_TOOL })
        .catch(() => undefined)

      return { text: listingOf(listed) ?? TEXTS.listFailed }
    }

    if (hasTab) {
      try {
        // A zoom is this mod's pane standing in for the cockpit. The command
        // asks for the tab, so the pane goes and the cockpit comes back,
        // rather than the two of them sharing the dock.
        if (isOpen) {
          isZoomed = false

          await $.ui.close({ id: TAB_ID })

          isOpen = false
        }

        await $.cockpit.show(TAB_ID)

        void readBack()

        return { text: TEXTS.opened }
      } catch {
        // The cockpit took the tab and is gone since: fall through to the
        // pane of our own, which draws the same view.
      }
    }

    if (isOpen) {
      await host?.closePane(TAB_ID).catch(() => undefined)

      isOpen = false

      return { text: TEXTS.closed }
    }

    await openPane()

    return { text: isFullscreen ? TEXTS.opened : '' }
  })
}

/**
 * The listing `ListAgents` answered with, where it answered with one.
 *
 * @param result what `$.tool.call` resolved to
 * @returns the listing, or null where the answer carried none
 */
function listingOf(result: unknown): string | null {
  if (result === null || typeof result !== 'object') {
    return null
  }

  const value = (result as { result?: unknown }).result

  if (value === null || typeof value !== 'object') {
    return null
  }

  const listing = (value as { listing?: unknown }).listing

  return typeof listing === 'string' && listing.trim() !== '' ? listing : null
}
