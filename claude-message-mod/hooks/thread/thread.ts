/**
 * The thread as the tab draws it, and every move that changes it: what
 * arrived, what went out, what was handed to Claude, and the three figures
 * the footer keeps apart.
 *
 * Pure. Nothing here reaches the engine, which is what lets the tests say
 * what the mod does without an engine under them.
 */

import { bytesOf, firstLineOf } from '../format'
import { NOTES_MAX, TEXTS, UNKNOWN_PEER } from '../names'
import { shortOf } from '../roster'

/**
 * One message of the thread, in or out.
 */
export type Note = {
  /**
   * When it arrived or went out, on the engine's clock.
   */
  at: number

  /**
   * `in` for a delivery another session sent, `out` for an answer from the
   * field.
   */
  kind: 'in' | 'out'

  /**
   * The correspondent: who sent it, or who it went to.
   */
  who: string

  /**
   * The message itself, as delivered or as typed.
   */
  text: string

  /**
   * Its length in bytes, measured (see `bytesOf`): for an incoming note, what
   * the transcript did not have to carry.
   */
  bytes: number

  /**
   * Whether this delivery is still held out of the context: true from the
   * moment it is taken until it is handed to Claude.
   *
   * Always false for an outgoing note, which was never in a context to begin
   * with.
   */
  isHeld: boolean
}

/**
 * What one note is addressed by: its clock and its direction.
 *
 * The element key of its block, the key its three presses carry — read the
 * rest, pick it for the hand-over, drop it — and what tells a note read back
 * from disk from one this session already has.
 *
 * Unique because `stampOf` makes it so: a note is stamped with the first
 * millisecond free in its direction, so two deliveries in one tick are two
 * addresses and the press that drops one of them drops one of them.
 *
 * @param note the note
 * @returns its address
 */
export const idOf = (note: Pick<Note, 'at' | 'kind'>): string =>
  `${note.at}:${note.kind}`

/**
 * A stamp no note of that kind already carries: the clock's own, or the
 * next millisecond free after it.
 *
 * Two deliveries in one millisecond are two notes, and an address is
 * `idOf`'s clock and direction — so without this they would be one address
 * for two messages, and the press that drops one of them would drop both.
 * The nudge is a millisecond on a stamp drawn to the minute: nothing on
 * screen moves, the order is kept, and every note is addressable.
 *
 * The hook stamps the file on disk with the same call, so the mailbox and
 * the thread agree and a note read back is recognised rather than doubled.
 *
 * @param state the thread as it stands
 * @param at the clock's reading
 * @param kind which direction the note goes
 * @returns a stamp free in that direction
 */
export function stampOf(state: State, at: number, kind: Note['kind']): number {
  let stamp = Math.max(0, Math.floor(at))

  while (state.notes.some(note => note.kind === kind && note.at === stamp)) {
    stamp += 1
  }

  return stamp
}

/**
 * One correspondent, as the left column lists it.
 */
export type Peer = {
  /**
   * What the thread files it under: its address where one is known, its name
   * otherwise. A note's `who` is this.
   */
  key: string

  /**
   * What the column draws: the name the engine's register gives it — the one
   * `/rename` sets — or the tail of its address where the register has none.
   */
  label: string

  /**
   * What `SendMessage` is handed as `to`: the register's name where there is
   * one, else the address the delivery came from, which the engine says to
   * copy as the `to` of a reply.
   */
  sendTo: string

  /**
   * The folder it works in, where the register said so.
   */
  place: string

  /**
   * When it was last heard from: its last word in the register, or its last
   * message.
   */
  at: number

  /**
   * Whether the engine's register has it running; false for a correspondent
   * known only from the thread.
   */
  isLive: boolean

  /**
   * Whether it is working, as against waiting at its prompt; false for one
   * that is not running.
   */
  isBusy: boolean
}

/**
 * One correspondent this session has exchanged with, kept apart from the
 * messages themselves.
 *
 * The column used to be built out of the thread, which made **Clear** empty
 * it: dropping a correspondent's messages dropped the correspondent, and
 * with them the only row that could be selected to answer. Who this session
 * has spoken to is a different fact from what was said, so it is held
 * separately and nothing on this tab ever removes it.
 */
export type Known = {
  /**
   * The thread's key for them: their address where one is known.
   */
  key: string

  /**
   * When they were last heard from or written to.
   */
  at: number
}

/**
 * Everything the tab draws, and the three figures under it.
 */
export type State = {
  /**
   * The thread, oldest first, capped at `NOTES_MAX`; the disk keeps the rest.
   */
  notes: readonly Note[]

  /**
   * Every correspondent this session has exchanged with, whatever is left of
   * the messages: what the left column lists beside the register's own
   * sessions.
   */
  seen: readonly Known[]

  /**
   * The correspondent on screen, or null before anything has arrived.
   */
  who: string | null

  /**
   * Messages sent from the field. Each one is a model turn that did not
   * start, since the field calls the tool itself.
   */
  sent: number

  /**
   * Deliveries taken before they were queued.
   */
  held: number

  /**
   * The bytes those deliveries would have written to the transcript.
   *
   * Bytes, measured. Never added to the counts beside it: a count of
   * messages and a length in bytes are two quantities, and their sum is
   * nothing at all.
   */
  bytes: number

  /**
   * Held deliveries since handed to Claude, which is the one moment they
   * cost what they would have cost all along.
   */
  handed: number
}

/**
 * A session that has heard nothing and said nothing.
 */
export const EMPTY: State = {
  notes: [],
  seen: [],
  who: null,
  sent: 0,
  held: 0,
  bytes: 0,
  handed: 0,
}

/**
 * The notes, oldest dropped where there are more than the thread keeps.
 *
 * @param notes the notes, oldest first
 * @returns at most `NOTES_MAX` of them
 */
const capped = (notes: readonly Note[]): readonly Note[] =>
  notes.length <= NOTES_MAX ? notes : notes.slice(notes.length - NOTES_MAX)

/**
 * The correspondents with one of them noted, or its clock moved on.
 *
 * @param seen the correspondents as they stand
 * @param key the one that was heard from or written to
 * @param at when
 * @returns the correspondents, that one among them
 */
const withKnown = (
  seen: readonly Known[],
  key: string,
  at: number,
): readonly Known[] => [
  ...seen.filter(one => one.key !== key),
  { key, at: Math.max(seen.find(one => one.key === key)?.at ?? 0, at) },
]

/**
 * Whether a note is one this hand-over takes: held, this correspondent's,
 * and picked where anything at all was picked.
 *
 * An empty set of picks means every held message, which is what the button
 * did before a message could be picked at all: a person who picks nothing
 * hands over the pile, as they always could.
 *
 * @param note the note
 * @param who the correspondent, or undefined for every one of them
 * @param ids the messages picked, or undefined for no pick at all
 * @returns whether it goes over
 */
const isTaken = (
  note: Note,
  who?: string,
  ids?: ReadonlySet<string>,
): boolean =>
  note.isHeld &&
  (who === undefined || note.who === who) &&
  (ids === undefined || ids.size === 0 || ids.has(idOf(note)))

/**
 * Who a delivery came from: the address in the frame the engine wrapped it
 * in.
 *
 * A peer's delivery arrives as
 * `<cross-session-message from="uds:\.\pipe\LOCAL\cc-msg-…">…</cross-session-message>`,
 * and the engine's own instruction to the model is to copy that `from` as the
 * `to` of a reply. So it is read rather than guessed, and it is both the key
 * the thread is filed under and a recipient that works.
 *
 * `../roster` is what puts a name on it: the same string, less its `uds:`,
 * is the `messagingSocketPath` the engine keeps for that session.
 *
 * @param text the delivery as it arrived
 * @returns the address, or null where the delivery carries no frame
 */
export function senderOf(text: string): string | null {
  const from = /<cross-session-message\b[^>]*\bfrom="([^"]+)"/i.exec(text)

  return from?.[1] ?? null
}

/**
 * The message itself, with the frame taken off.
 *
 * What the person reads is what was sent, not the envelope it travelled in —
 * a row that began `<cross-session-message from="uds:\.\pipe\…` said
 * nothing at all in the cells a column has.
 *
 * @param text the delivery as it arrived
 * @returns the text inside the frame, or the whole of it where there is none
 */
export function bodyOf(text: string): string {
  const open = /<cross-session-message\b[^>]*>/i.exec(text)

  if (open === null) {
    return text.trim()
  }

  const rest = text.slice(open.index + open[0].length)
  const close = rest.lastIndexOf('</cross-session-message>')

  return (close === -1 ? rest : rest.slice(0, close)).trim()
}

/**
 * What a correspondent is called where nothing names it: the tail of its
 * address, which is what tells two of them apart, or a plain word for a
 * delivery that carried no address at all.
 *
 * @param key the thread's key for it
 * @returns the label
 */
export const labelFor = (key: string): string =>
  key === UNKNOWN_PEER ? TEXTS.somePeer : TEXTS.unknownPeer(shortOf(key))

/**
 * What the column calls the correspondent a note came from.
 *
 * @param peers the column as it stands
 * @param key the thread's key
 * @returns the name the register gave it, or its address's tail
 */
export const labelIn = (peers: readonly Peer[], key: string): string =>
  peers.find(peer => peer.key === key)?.label ?? labelFor(key)

/**
 * Takes one delivery into the thread, held out of the context.
 *
 * @param state the thread as it stands
 * @param at when it arrived, on the engine's clock
 * @param who the key it is filed under, `senderOf`'s address
 * @param text the message, its frame already off
 * @param bytes the length of the whole delivery, frame and all: what the
 *   transcript would have carried, which is not what is shown
 * @returns the thread with it, and the correspondent selected where none was
 */
export function withIn(
  state: State,
  at: number,
  who: string,
  text: string,
  bytes: number,
): State {
  const stamp = stampOf(state, at, 'in')

  return {
    ...state,
    notes: capped([
      ...state.notes,
      { at: stamp, kind: 'in', who, text, bytes, isHeld: true },
    ]),
    seen: withKnown(state.seen, who, stamp),
    who: state.who ?? who,
    held: state.held + 1,
    bytes: state.bytes + bytes,
  }
}

/**
 * Puts notes read back from disk under the thread, oldest first.
 *
 * None of them is held and none of them counts: a note on disk was decided
 * long ago, and the figures under the tab are this session's own. What the
 * readback restores is the conversation, so that a resumed session answers
 * into a thread rather than into a blank.
 *
 * @param state the thread as it stands
 * @param filed the notes read back, oldest first
 * @returns the thread with them under what this session already knows
 */
export function withFiled(
  state: State,
  filed: readonly Omit<Note, 'bytes' | 'isHeld'>[],
): State {
  if (filed.length === 0) {
    return state
  }

  // Against what this session already has, and against itself: two files
  // claiming one millisecond in one direction are one note as far as the
  // thread can address them, and a thread cannot draw two rows under one
  // address without one of them answering for the other.
  const known = new Set(state.notes.map(idOf))
  const older = filed
    .filter(note => {
      const id = idOf(note)

      if (known.has(id)) {
        return false
      }

      known.add(id)

      return true
    })
    .map(note => ({
      ...note,
      text: note.kind === 'in' ? bodyOf(note.text) : note.text,
      bytes: bytesOf(note.text),
      isHeld: false,
    }))

  return {
    ...state,
    notes: capped([...older, ...state.notes].sort((a, b) => a.at - b.at)),
    seen: older.reduce(
      (seen, note) => withKnown(seen, note.who, note.at),
      state.seen,
    ),
    who: state.who ?? older[older.length - 1]?.who ?? null,
  }
}

/**
 * Notes one answer that went out from the field.
 *
 * @param state the thread as it stands
 * @param at when it went, on the engine's clock
 * @param who who it went to
 * @param text what was typed
 * @returns the thread with it
 */
export function withOut(state: State, at: number, who: string, text: string): State {
  const stamp = stampOf(state, at, 'out')

  return {
    ...state,
    notes: capped([
      ...state.notes,
      { at: stamp, kind: 'out', who, text, bytes: bytesOf(text), isHeld: false },
    ]),
    seen: withKnown(state.seen, who, stamp),
    who,
    sent: state.sent + 1,
  }
}

/**
 * The held deliveries, whole thread, one correspondent's, or the ones a
 * person picked out of them.
 *
 * @param state the thread
 * @param who the correspondent, or undefined for every one of them
 * @param ids the messages picked; an empty or absent set means every held
 *   one, which is what the button did before a message could be picked
 * @returns the notes still held, oldest first
 */
export const heldOf = (
  state: State,
  who?: string,
  ids?: ReadonlySet<string>,
): readonly Note[] => state.notes.filter(note => isTaken(note, who, ids))

/**
 * Hands the held deliveries over: they stop being held, and the count of
 * what this session chose to pay for goes up by as many.
 *
 * @param state the thread
 * @param who the correspondent, or undefined for every one of them
 * @param ids the messages picked, or an empty set for every held one
 * @returns the thread with those notes released
 */
export function withHanded(
  state: State,
  who?: string,
  ids?: ReadonlySet<string>,
): State {
  const handed = heldOf(state, who, ids).length

  if (handed === 0) {
    return state
  }

  return {
    ...state,
    notes: state.notes.map(note =>
      isTaken(note, who, ids) ? { ...note, isHeld: false } : note,
    ),
    handed: state.handed + handed,
  }
}

/**
 * Selects a correspondent.
 *
 * @param state the thread
 * @param who the correspondent
 * @returns the thread drawn on that one
 */
export const withWho = (state: State, who: string): State => ({ ...state, who })

/**
 * Drops one correspondent's notes from the screen.
 *
 * The disk keeps them: `$.fs` has no delete, and a mod that promised to
 * purge a thread would be promising something the engine cannot do. What
 * this clears is the thread in memory, and the figures beneath it stand.
 *
 * **The correspondent stays, and stays selected.** The first version worked
 * the column out of the notes and moved the selection to whatever was left,
 * so clearing a thread took the correspondent off the column with it and
 * the field at the bottom — which only draws for a selected correspondent —
 * went with them. Clearing what was said is not forgetting who said it.
 *
 * @param state the thread
 * @param who the correspondent
 * @returns the thread without that one's notes
 */
export const withoutThread = (state: State, who: string): State => ({
  ...state,
  notes: state.notes.filter(note => note.who !== who),
})

/**
 * Drops one message from the screen.
 *
 * The disk keeps it, as it keeps a cleared thread: a message read and dealt
 * with can leave the tab without leaving the mailbox. A held message dropped
 * this way is one this session decided never to pay for, so the count of
 * what is held falls with it — and the bytes it kept out of the transcript
 * stand, because they were kept whatever happens next.
 *
 * @param state the thread
 * @param id the message, as `idOf` addresses it
 * @returns the thread without it
 */
export const withoutNote = (state: State, id: string): State => ({
  ...state,
  notes: state.notes.filter(note => idOf(note) !== id),
})

/**
 * One correspondent's notes, oldest first.
 *
 * @param state the thread
 * @param who the correspondent, or null for none
 * @returns that one's notes
 */
export const threadOf = (state: State, who: string | null): readonly Note[] =>
  who === null ? [] : state.notes.filter(note => note.who === who)

/**
 * The correspondents the left column lists: everyone who wrote or was written
 * to, and every session the engine's register has running.
 *
 * Both are keyed by address, which is what makes them one row rather than
 * two: the `from` of a delivery is the `messagingSocketPath` of the session
 * that sent it.
 *
 * At work first, then by when they were last heard from.
 *
 * @param state the thread
 * @param live the sessions the register has running
 * @returns the rows of the column
 */
export function peersOf(
  state: State,
  live: readonly {
    address: string
    name: string
    place: string
    at: number
    isBusy: boolean
  }[],
): readonly Peer[] {
  const rows = new Map<string, Peer>()

  // Built from who this session has spoken to, and not from what was said:
  // a thread a person cleared is not a correspondent they can no longer
  // write to.
  for (const one of state.seen) {
    rows.set(one.key, {
      key: one.key,
      label: labelFor(one.key),
      sendTo: one.key,
      place: '',
      at: one.at,
      isLive: false,
      isBusy: false,
    })
  }

  for (const one of live) {
    const key = one.address === '' ? one.name : one.address
    const seen = rows.get(key)

    rows.set(key, {
      key,
      label: one.name,
      sendTo: one.name,
      place: one.place,
      at: Math.max(seen?.at ?? 0, one.at),
      isLive: true,
      isBusy: one.isBusy,
    })
  }

  return [...rows.values()].sort(
    (a, b) => Number(b.isBusy) - Number(a.isBusy) || b.at - a.at,
  )
}

/**
 * How a held delivery's sender is headed in the hand-over prompt: a
 * recipient the model can copy, and nothing more than it needs.
 *
 * The frame is off by the time a delivery is handed over, and with it the
 * `from` the engine tells the model to copy as the `to` of a reply. So the
 * head puts one back, and picks the shortest one that reaches:
 *
 * - nothing in the register names it — its address, which always reaches;
 * - one session answers to that name — the name, which is what a person
 *   reads and what `SendMessage` prefers;
 * - two do — the name and the address, since the bare name is then not
 *   enough.
 *
 * Without this the receiving session reads a socket path, and spends three
 * tool calls on `~/.claude/sessions` working out who wrote to it — which
 * costs more than the bytes the holding saved.
 *
 * @param peers the column as it stands
 * @param key the thread's key for the sender
 * @returns the head, without its colon
 */
export function fromOf(peers: readonly Peer[], key: string): string {
  if (key === UNKNOWN_PEER) {
    return TEXTS.somePeer
  }

  // A row whose `sendTo` is its key is one nothing named: a correspondent
  // known from the thread alone, or a session the register has without an
  // address. Either way the key is already the best recipient there is.
  const named = peers.find(peer => peer.key === key && peer.sendTo !== key)

  if (named === undefined) {
    return key
  }

  const sharing = peers.filter(peer => peer.sendTo === named.sendTo)

  return sharing.length === 1
    ? named.sendTo
    : TEXTS.handFrom(named.sendTo, key)
}

/**
 * The prompt the held deliveries are handed over as: one block per message,
 * headed by its sender, in the order they arrived.
 *
 * This is the only text this mod ever puts in a context, and it is built
 * here rather than in the hook so that a test can read it.
 *
 * @param notes the notes being handed over
 * @param peers the column as it stands, which is what puts a name on an
 *   address; an empty one heads every block with its raw key
 * @returns the prompt, or the empty string for no notes
 */
export function handOf(
  notes: readonly Note[],
  peers: readonly Peer[] = [],
): string {
  if (notes.length === 0) {
    return ''
  }

  const blocks = notes.map(
    note => `${fromOf(peers, note.who)}:\n${note.text.trim()}`,
  )

  return `${TEXTS.handPreamble(notes.length)}\n\n${blocks.join('\n\n')}`
}

/**
 * The one-line preview of a note, for a toast and for a row.
 *
 * @param note the note
 * @returns its first line
 */
export const previewOf = (note: Note): string => firstLineOf(note.text)
