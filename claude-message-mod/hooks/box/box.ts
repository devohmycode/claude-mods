/**
 * The mailbox on disk: where it sits, what one note looks like as a file,
 * and how a folder of them reads back.
 *
 * Pure — every function here takes paths and text and answers paths and
 * text. The hook does the writing, which is what makes all of this testable
 * without a filesystem.
 *
 * One shape of file, and no other. A note is one file, written once and never
 * touched again: `$.fs.write` writes a whole file, so a thread that appended
 * would read and rewrite itself on every delivery, and a thread that is one
 * file per note never does.
 *
 * Nothing here says who is running. That is the engine's own register, read
 * in `../roster`, and reading it is better than publishing a presence of our
 * own: it carries the name `/rename` sets, which is also the name
 * `SendMessage` takes.
 */

import { BOX_DIR, READBACK_MAX } from '../names'

/**
 * Where the mailbox sits: one folder for the threads, one for the beats.
 */
export type Box = {
  /**
   * The mailbox's own folder.
   */
  root: string

  /**
   * The folder the threads sit in, one folder per session inside it.
   */
  threads: string
}

/**
 * One note as its file carries it: the thread's own note, less the fields a
 * reader can work out for itself.
 */
export type Filed = {
  at: number
  kind: 'in' | 'out'
  who: string
  text: string
}

/**
 * A path with one kind of separator, and no trailing one.
 *
 * The engine takes absolute paths and this mod builds them from the home
 * directory the host reports, which on Windows comes back with backslashes.
 * Everything below joins with `/`, as the cockpit's own paths do.
 *
 * @param path the path
 * @returns the path, forward slashes, no trailing slash
 */
export const cleanPath = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * The person's home directory, from the one of the two variables the host
 * sets.
 *
 * @param userProfile `USERPROFILE`, as Windows sets it
 * @param home `HOME`, as everywhere else sets it
 * @returns the home directory, or null where neither is set
 */
export function homeOf(
  userProfile: string | undefined,
  home: string | undefined,
): string | null {
  const found = [userProfile, home].find(
    one => typeof one === 'string' && one.trim() !== '',
  )

  return found === undefined ? null : cleanPath(found)
}

/**
 * The mailbox under a home directory.
 *
 * @param home the home directory
 * @returns its three folders
 */
export function boxOf(home: string): Box {
  const root = `${cleanPath(home)}/${BOX_DIR}`

  return { root, threads: `${root}/threads` }
}

/**
 * The folder one session's notes sit in.
 *
 * @param box the mailbox
 * @param sessionId the session whose thread it is
 * @returns the folder
 */
export const threadDirOf = (box: Box, sessionId: string): string =>
  `${box.threads}/${safeName(sessionId)}`

/**
 * A name a path can carry: anything a file name would have to escape becomes
 * a dash, so a session id from a host that spells them freely still writes.
 *
 * @param name the name
 * @returns the name, safe in a path
 */
export const safeName = (name: string): string =>
  name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unnamed'

/**
 * One note's file name, stamped so that the folder sorts oldest first.
 *
 * The stamp is padded to a fixed width on purpose: a folder listing comes
 * back as names, and `"9"` sorts after `"10"` while `"000…009"` does not.
 *
 * @param at when the note landed, on the engine's clock
 * @param nth how many notes this session had already written at that
 *   millisecond, so two deliveries in one tick are two files
 * @returns the file's name
 */
export const noteNameOf = (at: number, nth: number): string =>
  `${String(Math.max(0, Math.floor(at))).padStart(15, '0')}-${String(nth).padStart(3, '0')}.json`

/**
 * One note as its file's text.
 *
 * @param note the note
 * @returns the file's text
 */
export const noteTextOf = (note: Filed): string => JSON.stringify(note)

/**
 * One note read back from its file's text.
 *
 * @param text the file's text
 * @returns the note, or null where the text is not one
 */
export function noteOf(text: string): Filed | null {
  const read: unknown = parse(text)

  if (read === null || typeof read !== 'object') {
    return null
  }

  const one = read as Record<string, unknown>

  if (
    typeof one.at !== 'number' ||
    typeof one.who !== 'string' ||
    typeof one.text !== 'string' ||
    (one.kind !== 'in' && one.kind !== 'out')
  ) {
    return null
  }

  return { at: one.at, kind: one.kind, who: one.who, text: one.text }
}

/**
 * The note files worth reading back when the tab is first looked at: the
 * most recent of them, in the order they were written.
 *
 * @param names every file name in the thread's folder
 * @returns at most `READBACK_MAX` names, oldest first
 */
export function readbackOf(names: readonly string[]): readonly string[] {
  const notes = [...names].filter(name => name.endsWith('.json')).sort()

  return notes.slice(Math.max(0, notes.length - READBACK_MAX))
}

/**
 * `JSON.parse`, answering null rather than throwing: a half-written file is
 * a file to skip and not a session to stop.
 *
 * @param text the text
 * @returns what it parsed to, or null
 */
function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
