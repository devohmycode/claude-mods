/**
 * Which tabs the rail draws: the person's own choice, read off one
 * `/config` line and applied to whatever is registered when it is read.
 *
 * It is a list of what to leave *out* rather than of what to keep. The
 * cockpit's contract is that a plugin adds a tab in three lines and the tab
 * appears — a list of what to keep would swallow every tab written after the
 * line was last edited, silently, which is the one failure a plugin author
 * could never debug from their own side.
 *
 * `/config` has four kinds of row and none of them picks several of a list
 * (`ConfigKind`), and a `config.describe` hook may rewrite a row's label,
 * help and hidden flag but neither its kind nor its options
 * (`ConfigDescribeResult` omits them). So the row is a line of text, and what
 * makes it readable is the help under it, which `describeOf` writes fresh
 * from the tabs that are actually there.
 *
 * Pure: strings and ids in, strings and ids out. No `$`.
 */

import { TABS_SEPARATOR } from '../names'

/**
 * The ids a `hideTabs` line names, however the person spaced and cased them.
 *
 * An id is a tab's own, which the cockpit lower-cases nowhere else — but the
 * line is typed by hand, and `Stats` naming the `stats` tab is what anyone
 * typing it would expect.
 *
 * @param value the line as the option carries it: a string, or the list a
 *   settings file may hold in its place
 * @returns the ids, in the order they were written, each once
 */
export function hiddenOf(value: unknown): readonly string[] {
  const parts = Array.isArray(value)
    ? value.map(one => String(one))
    : typeof value === 'string'
      ? value.split(TABS_SEPARATOR)
      : []

  const ids: string[] = []

  for (const part of parts) {
    const id = part.trim().toLowerCase()

    if (id !== '' && !ids.includes(id)) {
      ids.push(id)
    }
  }

  return ids
}

/**
 * The tabs the rail draws, in the order they were handed over, the hidden
 * ones left out.
 *
 * An id naming no tab hides nothing and is not an error here: the line
 * outlives the plugins that were loaded when it was written, and a session
 * started without one of them should draw its rail rather than refuse to.
 *
 * @param tabs every registered tab, by id
 * @param hidden the ids to leave out
 * @returns the ids the rail draws
 */
export const shownOf = <T extends { id: string }>(
  tabs: readonly T[],
  hidden: readonly string[],
): readonly T[] => tabs.filter(tab => !hidden.includes(tab.id.toLowerCase()))

/**
 * Whether one tab is left out.
 *
 * @param id the tab's id
 * @param hidden the ids to leave out
 * @returns whether it is hidden
 */
export const isHidden = (id: string, hidden: readonly string[]): boolean =>
  hidden.includes(id.toLowerCase())

/**
 * What a typed line is written as once it is accepted: the ids as they were
 * given, trimmed and deduplicated, joined the one way the line reads back.
 *
 * @param ids the ids
 * @returns the line
 */
export const lineOf = (ids: readonly string[]): string => ids.join(', ')

/**
 * What the `/config` row takes, or why it does not.
 *
 * An id no registered tab carries is refused rather than written. A line
 * that hides nothing is the one mistake nobody could see they had made: the
 * rail looks exactly as it did, and the row shows the typo as if it had
 * taken. The menu draws a deny's reason beside the row, so the reason names
 * what there was to choose from.
 *
 * @param value the value the menu is about to write
 * @param known every registered tab's id
 * @param unknownText the reason, given the bad ids and the known ones
 * @returns the line to write, or the reason to refuse it
 */
export function checkOf(
  value: unknown,
  known: readonly string[],
  unknownText: (bad: readonly string[], known: readonly string[]) => string,
): { value: string; deny?: undefined } | { deny: string; value?: undefined } {
  const ids = hiddenOf(value)
  const lower = known.map(id => id.toLowerCase())
  const bad = ids.filter(id => !lower.includes(id))

  return bad.length > 0
    ? { deny: unknownText(bad, known) }
    : { value: lineOf(ids) }
}
