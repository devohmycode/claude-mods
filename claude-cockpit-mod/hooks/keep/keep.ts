/**
 * What a session leaves for the next run of itself: the tallies its tabs
 * draw, written once a turn and read back when the same transcript reopens.
 *
 * A session's id is its transcript file's name, and `claude --resume`
 * continues the transcript it names — so the id is the key, and nothing else
 * has to be asked. The same session finds its own record; a `/clear` and a
 * fork open a transcript of their own, find nothing under their id, and
 * start on empty tabs, which is what they are.
 *
 * Everything here is pure: a state and a clock reading in, JSON out; JSON
 * and a state in, a state out. No `$`, so every rule is one a test can state
 * in a line.
 */

import {
  GONE_STATUS,
  KEPT_VERSION,
  SESSIONS_MAX,
  STORE_SESSION_PREFIX,
} from '../names'
import { isLive } from '../state'
import type { State } from '../state'
import { NO_LEDGER } from '../usage'

/**
 * One session's record, as the store holds it.
 *
 * `version` is stamped so that a record written by an older shape is dropped
 * rather than read into fields that have since moved, and `atMs` is when it
 * was written, which is the last moment anyone was watching.
 */
export type Kept = {
  version: number
  atMs: number
  files: State['files']
  tools: State['tools']
  recent: State['recent']
  history: State['history']
  agents: State['agents']

  /**
   * What the session had spent when the record was written. It is the one
   * figure here the engine does not hand back on its own: `$.session.usage`
   * answers the cost and the window, never the four token counters, which
   * only ever arrive one finished turn at a time.
   */
  ledger: State['ledger']
}

/**
 * The record of a state, as the store takes it.
 *
 * What is left out is as deliberate as what is kept. The vitals are not,
 * because the Session tab reads them fresh when it is looked at and a
 * reading from an hour ago is worse than no reading. The armed file is not
 * either: what it does is invisible by the engine's own contract, and a side
 * effect nobody can see must not survive a restart to go out with a prompt
 * typed the next day.
 *
 * @param state the state as the turn left it
 * @param atMs the engine's clock, milliseconds since the epoch
 * @returns the record
 */
export function keptOf(state: State, atMs: number): Kept {
  return {
    version: KEPT_VERSION,
    atMs,
    files: state.files,
    tools: state.tools,
    recent: state.recent,
    history: state.history,
    agents: state.agents,
    ledger: state.ledger,
  }
}

/**
 * The state a record restores into — or the state as it stands, where there
 * is no record, where it was written by another shape, or where what came
 * back from the store is not what a record looks like.
 *
 * An agent still running when the record was written is closed at that
 * moment rather than left counting. The session was shut: a row that reads
 * forty minutes because nobody was there for thirty-nine of them says
 * something untrue, and `gone` is the status the cockpit already has for an
 * agent whose end it did not witness.
 *
 * @param kept what the store answered, which is JSON and may be anything
 * @param state the state to restore into
 * @returns the state after it
 */
export function restoredOf(kept: unknown, state: State): State {
  // One cast, at the boundary where JSON becomes a type: everything the
  // shape promises is checked on the line below before any of it is read.
  const record = kept as Partial<Kept> | null | undefined

  if (
    !record ||
    typeof record !== 'object' ||
    record.version !== KEPT_VERSION ||
    typeof record.atMs !== 'number' ||
    !Array.isArray(record.files) ||
    !Array.isArray(record.tools) ||
    !Array.isArray(record.recent) ||
    !Array.isArray(record.history) ||
    !Array.isArray(record.agents) ||
    !record.ledger ||
    typeof record.ledger !== 'object'
  ) {
    return state
  }

  const atMs = record.atMs

  return {
    ...state,
    files: record.files,
    tools: record.tools,
    recent: record.recent,
    history: record.history,
    ledger: record.ledger ?? NO_LEDGER,
    agents: record.agents.map(agent =>
      isLive(agent.status)
        ? { ...agent, status: GONE_STATUS, endedMs: agent.endedMs ?? atMs }
        : agent,
    ),
    nowMs: atMs,
  }
}

/**
 * The session records to drop, oldest first.
 *
 * The store is the plugin's own and its four mebibytes are shared by every
 * session it has ever kept, so a session nobody will resume should not hold
 * a place in it forever. The keys come back in insertion order, which puts
 * the oldest at the front; the session running now is never dropped,
 * wherever it sits in that order.
 *
 * @param keys every key the store holds
 * @param keep the running session's key, or null where it has none
 * @param max the most session records to leave behind, this one included
 * @returns the keys to delete
 */
export function staleKeysOf(
  keys: readonly string[],
  keep: string | null,
  max: number = SESSIONS_MAX,
): readonly string[] {
  const sessions = keys.filter(
    key => key.startsWith(STORE_SESSION_PREFIX) && key !== keep,
  )

  const room = Math.max(0, keep === null ? max : max - 1)
  const over = sessions.length - room

  return over > 0 ? sessions.slice(0, over) : []
}

/**
 * The store key a session's record is kept under.
 *
 * @param id the session's id, as `$.session.id()` answers it
 * @returns the key, or null for a session with no id to key on
 */
export const sessionKeyOf = (id: string): string | null =>
  id === '' ? null : `${STORE_SESSION_PREFIX}${id}`
