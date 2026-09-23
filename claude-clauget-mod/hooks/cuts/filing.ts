/**
 * The filing cabinet (T32): everything on disk, an excerpt to the model.
 *
 * The context is a workbench, not a warehouse. A result cut short is written
 * whole under a stable path first, and the excerpt the model reads names that
 * path: the cut is undone by one Read. No filing, no cut — a result too large
 * to file, or whose write failed, goes through whole, because a cut the model
 * cannot undo is a loss, not an economy.
 *
 * `$.fs` has no `delete`: the folder grows by one file per cut and nothing
 * here promises a purge.
 *
 * Pure: these functions say where and whether; the register writes.
 */

import { bytesOf } from '../format'
import { FILE_MAX_BYTES, FILES_DIR, JOURNAL_DIR, MARK, TEXTS } from '../names'

/**
 * Where a cut result is filed.
 *
 * @param home the home directory
 * @param sessionId the session
 * @param key what names the result: the call's `tool_use_id`, or the prompt's
 *   block number
 * @returns `<home>/.claude/clauget/files/<session>/<key>.txt`, forward slashes
 */
export function filedPathOf(home: string, sessionId: string, key: string): string {
  const root = home.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const safe = (part: string) => part.replace(/[^A-Za-z0-9._-]/g, '-')

  return `${root}/${JOURNAL_DIR}/${FILES_DIR}/${safe(sessionId)}/${safe(key)}.txt`
}

/**
 * Whether a text may be filed: under the ceiling.
 *
 * @param text the whole result
 * @returns true when it fits
 */
export const isFileable = (text: string): boolean => bytesOf(text) <= FILE_MAX_BYTES

/**
 * The words that point at the filed whole.
 *
 * @param path where it is filed
 * @returns `whole output: <path> — read it for the rest`
 */
export const filedText = (path: string): string => `${TEXTS.filed}: ${path} — ${TEXTS.readIt}`

/**
 * Whether a path is one the cabinet filed: a Read of it is a targeted reread,
 * the measure of whether a cut was too deep.
 *
 * @param path the path a Read asked for
 * @returns true for a path under the cabinet's folder
 */
export const isFiledPath = (path: string): boolean =>
  path.replace(/\\/g, '/').includes(`/${JOURNAL_DIR}/${FILES_DIR}/`)

/**
 * The marker a cut leaves where the text went, as the model reads it.
 *
 * @param parts what the cut says of itself
 * @param path where the whole is filed
 * @returns `[clauget: 4 523 lines cut, 3 error lines kept · whole output: … — read it for the rest]`
 */
export const markerOf = (parts: readonly string[], path: string): string =>
  `[${MARK}: ${[parts.join(', '), filedText(path)].filter(one => one !== '').join(' · ')}]`
