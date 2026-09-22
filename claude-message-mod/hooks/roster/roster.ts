/**
 * The sessions this one can write to, read from the engine's own register.
 *
 * Claude Code keeps one small file per running session under
 * `~/.claude/sessions/<pid>.json`, and it holds exactly what a column of
 * correspondents wants: the name the session goes by — the one `/rename`
 * sets, and the one `SendMessage` takes — its status, its working directory
 * and its id.
 *
 * **A reading, not a contract.** Nothing in `claude-code.d.ts` declares this
 * folder; it is the engine's own bookkeeping, and a version that moved it
 * would leave this mod with an empty column and nothing worse. Every field is
 * checked before it is believed, an unreadable file is skipped, and
 * `/message who` remains the authority, since it asks `ListAgents` itself.
 *
 * This is why the mod writes no presence of its own. It did, for a while, and
 * published the repository's folder as every session's name — so two sessions
 * in one checkout were both called `claude-mods`, and neither name was one
 * `SendMessage` would have taken.
 *
 * Pure: text in, sessions out.
 */

import { ADDRESS_PREFIX, ROSTER_TTL_MS } from '../names'

/**
 * One session of the register.
 */
export type Seat = {
  /**
   * Its id, which is its transcript's name.
   */
  id: string

  /**
   * What it goes by: `test` where it was renamed, `claude-mods-79` where the
   * engine derived one. This is what `SendMessage` is handed as `to`.
   */
  name: string

  /**
   * Whether the name is the person's own (`/rename`) rather than derived.
   */
  isNamed: boolean

  /**
   * Whether it is working, as against waiting at its prompt.
   */
  isBusy: boolean

  /**
   * Where it works.
   */
  cwd: string

  /**
   * The address it is reached at, as a delivery's own frame spells it:
   * `uds:` and the socket the engine keeps under `messagingSocketPath`.
   *
   * This is what ties an incoming message to a name. A delivery arrives
   * wrapped in `<cross-session-message from="uds:…">`, and the engine's own
   * instruction to the model is to copy that `from` as the `to` of a reply —
   * so it is both the key a thread is filed under and a recipient that works.
   */
  address: string

  /**
   * When it last said anything about itself.
   */
  at: number
}

/**
 * The folder the engine keeps its register in.
 *
 * @param home the person's home directory, forward slashes
 * @returns the folder
 */
export const seatsDirOf = (home: string): string => `${home}/.claude/sessions`

/**
 * One session, read from its file.
 *
 * @param text the file's text
 * @returns the session, or null where the text is not one
 */
export function seatOf(text: string): Seat | null {
  let read: unknown

  try {
    read = JSON.parse(text) as unknown
  } catch {
    return null
  }

  if (read === null || typeof read !== 'object') {
    return null
  }

  const one = read as Record<string, unknown>

  if (typeof one.sessionId !== 'string' || typeof one.name !== 'string') {
    return null
  }

  const at = [one.updatedAt, one.statusUpdatedAt, one.startedAt].find(
    value => typeof value === 'number',
  )

  const socket =
    typeof one.messagingSocketPath === 'string' ? one.messagingSocketPath : ''

  return {
    id: one.sessionId,
    name: one.name,
    address: socket === '' ? '' : `${ADDRESS_PREFIX}${socket}`,
    isNamed: one.nameSource === 'user',
    isBusy: one.status === 'busy',
    cwd: typeof one.cwd === 'string' ? one.cwd.replace(/\\/g, '/') : '',
    at: typeof at === 'number' ? at : 0,
  }
}

/**
 * The sessions worth drawing: this one left out, and anything that stopped
 * saying so long enough ago to be gone.
 *
 * A session that exits does not always take its file with it, which is why a
 * stale one is dropped by its clock rather than trusted for being there.
 *
 * @param all every session read from the folder
 * @param selfId this session's id
 * @param nowMs the engine's clock
 * @returns the live ones, the busy first and the most recent after
 */
export function liveOf(
  all: readonly Seat[],
  selfId: string,
  nowMs: number,
): readonly Seat[] {
  return all
    .filter(one => one.id !== selfId && nowMs - one.at <= ROSTER_TTL_MS)
    .sort((a, b) => Number(b.isBusy) - Number(a.isBusy) || b.at - a.at)
}

/**
 * This session itself, as the register has it.
 *
 * The register knows this session as well as it knows the others, and the
 * name it gives it is the one another session would write to. A person who
 * has renamed two of them should not have to work out which one they are
 * sitting in.
 *
 * @param all every session read from the folder
 * @param selfId this session's id
 * @returns this session's own row, or null where the register has none
 */
export const selfOf = (
  all: readonly Seat[],
  selfId: string,
): Seat | null => all.find(one => one.id === selfId) ?? null

/**
 * The folder a session works in, as a row names it.
 *
 * @param cwd the session's working directory
 * @returns its last segment, or the empty string
 */
export function placeOf(cwd: string): string {
  const path = cwd.replace(/\/+$/, '')

  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * A short, readable stand-in for an address nothing else names: the tail of
 * its socket, which is what tells two of them apart.
 *
 * @param address the address, as a delivery's frame spelled it
 * @returns a name of six characters at the end of it
 */
export function shortOf(address: string): string {
  const tail = address.replace(/[^A-Za-z0-9]+$/, '')

  return tail.slice(Math.max(0, tail.length - 6))
}
