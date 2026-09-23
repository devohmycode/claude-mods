/**
 * Every name, number and line the message mod shows, in one place: what the
 * tab is called, where the mailbox sits on disk, and the limits the thread
 * holds itself to.
 */

/**
 * The plugin's name, as the manifest spells it: the name a held delivery's
 * reason is logged under, and the one another plugin would name this mod by
 * in a matcher of its own.
 */
export const PLUGIN_NAME = 'message'

/**
 * The cockpit tab's id, and the id of the pane this mod opens for itself
 * where no cockpit is seated under it.
 */
export const TAB_ID = 'message'

/**
 * The id of the cockpit's own pane, which this mod draws its body into when
 * its tab is the one on screen.
 */
export const COCKPIT_PANE = 'cockpit'

/**
 * The name the cockpit is registered under: whose `ui.press` this mod listens
 * for, since the tile of its own tab is drawn over there.
 */
export const COCKPIT_PLUGIN = 'cockpit'

/**
 * The key the cockpit's rail gives this tab's tile: its own `tab:` prefix
 * before this mod's id.
 *
 * The one address that does not cross. The cockpit draws the tile in its own
 * environment and cannot hand a closure over, so what reaches this mod is a
 * `ui.press` naming that key — which is the whole of how the person asking
 * to go into this tab is heard. A cockpit that renamed its prefix would take
 * the way in with it, so both mods' tests hold this string.
 */
export const COCKPIT_RAIL_KEY = `tab:${TAB_ID}`

/**
 * The key of the slot the cockpit leaves for the tab whose body it does not
 * hold — every foreign tab, since a `render` cannot cross from one plugin's
 * environment to another's.
 */
export const SLOT_KEY = 'cockpit:body'

/**
 * The rows the cockpit keeps off a tab's body for its rail, its rule and its
 * footer.
 *
 * Read from the cockpit's own `CHROME_ROWS`, and a coupling this mod owns:
 * the body it draws is sized against the pane it is given, and a cockpit that
 * changed its frame would have this mod drawing two rows too tall until the
 * number here followed.
 */
export const COCKPIT_CHROME_ROWS = 4

/**
 * The tab's title in the cockpit's rail, and the title of the fallback pane.
 */
export const TAB_TITLE = 'Message'

/**
 * Where the tab sits in the cockpit's rail: after the four the cockpit ships
 * (0, 10, 20, 30) and before a plugin that asks for no order at all (50).
 */
export const TAB_ORDER = 40

/**
 * The command that opens the tab, hands the held messages over, or turns the
 * holding off for this session.
 */
export const COMMAND_NAME = 'message'

/**
 * The argument that hands every held message to Claude at once.
 */
export const HAND_ARG = 'hand'

/**
 * The argument that turns the holding off, and on again.
 */
export const HOLD_ARG = 'hold'

/**
 * The argument that answers with the register of sessions this one can
 * write to, in the engine's own words.
 *
 * `ListAgents` answers one formatted listing and not a list of records, so
 * the register is shown rather than parsed: what the person reads is exactly
 * what `SendMessage` will accept as a recipient.
 */
export const WHO_ARG = 'who'

/**
 * What `$.command.register` is handed, the one place the spec is built.
 */
export const COMMAND_SPEC = {
  name: COMMAND_NAME,
  description:
    'The messages other sessions sent, held out of the context until you say otherwise, and a field to answer from',
  argumentHint: '[hand|hold|who]',
} as const

/**
 * The element key of the compose field, and the prefix of every button the
 * tab draws: an address is what a press and a submit carry.
 */
export const COMPOSE_KEY = 'message:compose'

/**
 * The element key of the button that hands the held thread to Claude.
 */
export const HAND_KEY = 'message:hand'

/**
 * The element key of the button that clears the thread on screen.
 */
export const CLEAR_KEY = 'message:clear'

/**
 * The element key of the button that subscribes to the correspondent's next
 * idle, and the prefix of a correspondent's own row.
 */
export const NOTIFY_KEY = 'message:notify'

/**
 * The element key of the button that reads the register again.
 */
export const REFRESH_KEY = 'message:refresh'

/**
 * The letter that presses it while the pane holds the keys.
 *
 * Not while the field does: an `Input` with the focus takes every printable
 * key alone, and Esc hands them back. The cockpit's rail keeps the digits for
 * its tabs, so a letter it is.
 */
export const REFRESH_HOTKEY = 'r'

/**
 * The prefix a correspondent's row in the left column is keyed by.
 */
export const PEER_PREFIX = 'message:peer:'

/**
 * The prefix of the button under a cut message, one per message: the press
 * that draws the whole of it, and the press that folds it back.
 */
export const MORE_PREFIX = 'message:more:'

/**
 * The prefix of the button that picks one held message for the hand-over,
 * and unpicks it.
 */
export const PICK_PREFIX = 'message:pick:'

/**
 * The prefix of the button that drops one message from the screen.
 */
export const DROP_PREFIX = 'message:drop:'

/**
 * The tool an answer goes out through, and the one the register is read
 * from: both are asked for by name before either is called.
 */
export const SEND_TOOL = 'SendMessage'

/**
 * The tool that lists the sessions this one can reach.
 */
export const LIST_TOOL = 'ListAgents'

/**
 * The label an answer carries in this session's own transcript row.
 *
 * `SendMessage` does not transmit it — the recipient previews the first line
 * of the message itself — so it says where the message came from rather than
 * what it says.
 */
export const SEND_SUMMARY = 'answer from the Message tab'

/**
 * The deliveries this mod holds: another session's message, and another
 * session's `SendMessage`.
 *
 * Deliberately not the rest. A task notification, a scheduled trigger and a
 * Remote Control prompt are work the session was waiting for, and holding
 * one would stop that work rather than save a context.
 */
//
// A pattern rather than a list: since 2.1.280 the two kinds belong to two
// shapes of origin, and a list in a matcher cannot span both.
export const HELD_KINDS = /^peer(?:-send-message)?$/

/**
 * The folder the mailbox sits in, under the person's home: one folder per
 * session for the thread, one file per session for the presence.
 */
export const BOX_DIR = '.claude/message'

/**
 * How often the engine's register of running sessions is read.
 *
 * Six small files on a busy machine, and nothing at all is written: the
 * register is the engine's own, kept under `~/.claude/sessions`.
 */
export const ROSTER_MS = 30_000

/**
 * What a session's address begins with, as a delivery's frame spells it and
 * as the engine's own register keeps the socket behind it.
 */
export const ADDRESS_PREFIX = 'uds:'

/**
 * The key a delivery with no frame is filed under: a peer's message that is
 * not a `SendMessage`, which names no address to answer.
 */
export const UNKNOWN_PEER = '?'

/**
 * The most files of the register read at once.
 *
 * A session that exits does not always take its file with it, so the folder
 * grows; the reading happens in a hook, and a hook has ten seconds. Measured
 * on this machine: twelve files, six of them sessions, no measurable time.
 */
export const ROSTER_MAX = 32

/**
 * How long after its last word a session is still drawn. A session that exits
 * does not always take its file with it, so a stale one is dropped by its
 * clock rather than trusted for being there.
 */
export const ROSTER_TTL_MS = 10 * 60_000

/**
 * The most notes read back from disk when the tab is first looked at: a
 * session that ran for a week is not worth a thousand reads.
 */
export const READBACK_MAX = 40

/**
 * The most notes the thread keeps in memory, the oldest dropped first; the
 * disk keeps every one of them.
 */
export const NOTES_MAX = 200

/**
 * The rows an inline pane opens with, tall enough for a thread and a field.
 */
export const DIALOG_ROWS = 18

/**
 * The terminal width from which this mod's own pane docks beside the
 * transcript, the width the cockpit uses for the same choice.
 */
export const DOCK_MIN_COLUMNS = 110

/**
 * The cells the fallback pane's frame keeps off the body, one each side.
 */
export const BODY_PAD_COLUMNS = 2

/**
 * The rows that pane keeps for its own footer and rule.
 */
export const CHROME_ROWS = 2

/**
 * The cells the left column of correspondents takes, where the body is wide
 * enough to carry two columns at all.
 */
export const PEERS_COLUMNS = 22

/**
 * The cells that column never goes under: four for the two marks in front of
 * a name, and enough of the name left to tell two sessions apart.
 */
export const PEERS_MIN = 16

/**
 * The cells the rule between the two columns takes, its blank on either
 * side.
 */
export const RULE_COLUMNS = 3

/**
 * The cells the thread never goes under, whatever the column beside it
 * would rather have.
 */
export const THREAD_MIN = 24

/**
 * The body width from which the tab draws the correspondents beside the
 * thread rather than above it.
 */
export const TWO_COLUMN_MIN = 64

/**
 * The characters of a message the thread draws before it cuts.
 *
 * Past this a `Show more` under it draws the whole of it — the same press
 * the cockpit's Usage tab cuts its own lists with. Roughly five lines at the
 * width a docked pane has, which is a message a person reads at a glance and
 * the point past which a thread of them stops being one.
 */
export const NOTE_CHARS = 280

/**
 * What is drawn in front of the correspondent on screen.
 */
export const MARK_HERE = '▸'

/**
 * What is drawn against a session that is working.
 */
export const MARK_BUSY = '●'

/**
 * What is drawn against a session waiting at its prompt.
 */
export const MARK_IDLE = '○'

/**
 * What is drawn against a correspondent the register does not have running:
 * one this session heard from before, and cannot reach now.
 */
export const MARK_GONE = '·'

/**
 * The rule under a heading and above the controls.
 */
export const RULE_ROW = '─'

/**
 * The rule between the correspondents and the thread.
 */
export const RULE_COLUMN = '│'

/**
 * Every line this mod puts on screen.
 */
export const TEXTS = {
  held: 'held in the Message tab',
  emptyThread: 'No message yet. What another session sends lands here.',
  emptyPeers: 'No other session has said anything yet.',
  unknownPeer: (short: string) => `session ${short}`,
  somePeer: 'another session',
  you: 'you',
  peers: 'SESSIONS',
  /**
   * This session, named at the head of the column: the register knows it as
   * well as it knows the others, and a person who has renamed two of them
   * should not have to guess which one they are sitting in.
   */
  self: (name: string) => `you · ${name}`,
  selfUnknown: 'you · this session',
  /**
   * The heading over the thread: who is on screen, and what the register
   * says they are doing.
   */
  busy: 'working',
  waiting: 'waiting',
  gone: 'not running',
  /**
   * What is drawn to the right of that heading: the state, and the folder
   * the session works in where the register gave one.
   */
  doing: (state: string, place: string) =>
    place === '' ? state : `${state} · ${place}`,
  /**
   * The heading before anything has arrived, where the thread is empty and
   * no correspondent is selected.
   */
  noPeerHead: 'No correspondent',
  /**
   * What marks a message that is on screen and not in the context. Held is
   * the whole point of this tab: the word says that reading it has so far
   * cost nothing.
   */
  heldNote: '• held',
  /**
   * The press under a message the thread cut, and the one that folds it
   * back.
   *
   * The figure carries its unit, as every figure this mod draws does: these
   * are characters, counted, and they are never added to the bytes in the
   * footer.
   */
  showMore: (hidden: number) => `Show more (+${hidden} characters)`,
  showLess: 'Show less',
  /**
   * The press that picks one held message for the hand-over, and the press
   * that unpicks it. Only a held message carries one: an answer of your own
   * and a message already handed over are both in the context already.
   */
  pick: '☐ hand this one',
  picked: '☑ handing this one',
  /**
   * The press that drops one message from the screen. What it says it does
   * is what it does: the mailbox keeps it, because `$.fs` has no delete.
   */
  drop: '✕ remove',
  dropped: 'Message removed from the tab; the mailbox keeps it.',
  refresh: '↻ refresh',
  refreshed: (count: number) =>
    `${count} session${count === 1 ? '' : 's'} beside this one.`,
  compose: '›',
  composePlaceholder: (who: string) => `answer ${who}`,
  composeNoPeer: 'Nobody to answer yet — a message picks its own sender.',
  composeNoField: 'This surface has no text field yet; the buttons still decide.',
  submitLabel: 'send',
  hand: 'Hand to Claude',
  /**
   * What the button says once messages have been picked out of the pile:
   * exactly what will go into the context, and out of how many.
   */
  handSome: (picked: number, held: number) =>
    `Hand to Claude (${picked} of ${held})`,
  clear: 'Clear',
  /**
   * What the third button says. `SendMessage` carries the subscription on a
   * message rather than on its own — its `message` is required — so what the
   * button arms is the next answer, and the label says so once it is armed.
   */
  notify: 'Tell me when idle',
  notifyOn: 'Idle notice rides the next answer',
  handed: (count: number) =>
    `${count} message${count === 1 ? '' : 's'} handed to Claude.`,
  handedNone: 'Nothing held to hand over.',
  /**
   * What `/message hand` answers with. The engine refuses `prompt.submit`
   * from inside a `command.run` hook — it would wait on the turn the hook is
   * holding — so the command hands the messages to a timer of its own and
   * says exactly that: on their way, not yet handed. The toast that follows
   * says `handed`, once they are.
   */
  handing: (count: number) =>
    `${count} message${count === 1 ? '' : 's'} on their way to Claude.`,
  handPreamble: (count: number) =>
    `${count} message${count === 1 ? '' : 's'} another session sent, held out of this context until now. Each is headed by its sender, as ${SEND_TOOL} takes it for a reply:`,
  /**
   * How a held delivery's sender is headed where its name alone would not
   * reach it: two sessions of the register answer to that name, so the
   * address the delivery came from is given beside it.
   *
   * `SendMessage`'s own rule, in its own words: send the bare name, and
   * append what tells two of them apart only where the bare name is not
   * enough.
   */
  handFrom: (name: string, address: string) => `${name} (${address})`,
  noListTool: `${LIST_TOOL} is not mounted in this session.`,
  listFailed: 'The register of reachable sessions could not be read.',
  sent: (who: string) => `Sent to ${who}.`,
  sendFailed: (who: string) => `${who} did not take the message.`,
  noSendTool: `${SEND_TOOL} is not mounted in this session.`,
  arrived: (who: string, line: string) => `${who}: ${line}`,
  holdOn:
    'Holding on: what another session sends waits in the Message tab instead of entering the context.',
  holdOff:
    'Holding off: what another session sends goes to the model as it always did.',
  opened: 'Message open.',
  closed: 'Message closed.',
  footer: '/message hand · /message hold',
  /**
   * The three figures, side by side and never added up: two counts and a
   * length in bytes are three quantities, and their sum says nothing.
   */
  counts: (sent: number, held: number, bytes: string) =>
    [
      `${sent} sent without a model turn`,
      `${held} held`,
      `${bytes} bytes kept out of the transcript`,
    ].join(' · '),
} as const
