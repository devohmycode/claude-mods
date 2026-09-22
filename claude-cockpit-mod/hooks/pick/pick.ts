/**
 * The row a tab is looking at: the key its button carries, and the reading
 * of that key back into what it names.
 *
 * A list draws one row per file or per call, cut to the cells it has. The
 * card under the list is where the whole of one row is written out, and what
 * says which row that is is the key of the button the person pressed — or
 * the one the focus ring landed on, which is the same thing said with Tab.
 *
 * Pure: a key in, what it names out.
 */

/**
 * What every pickable key starts with, so one look at a key says whether it
 * is one: the lists carry keys of their own (`file:`, `arm:`) that name the
 * same rows and do something else.
 */
export const PICK_PREFIX = 'pick:'

/**
 * What a picked row is: a file of the Files tab, a tool's tally or one of
 * the last calls of the Tools tab.
 */
export type PickKind = 'file' | 'tool' | 'call'

/**
 * A picked row, read back from its key.
 */
export type Picked = {
  kind: PickKind

  /**
   * Which row: a file's path, a tool's name, or a call's place in the list.
   *
   * A call has no name of its own, so it is picked by where it sits: the
   * card is a magnifying glass over the list as drawn, and a call that slides
   * down the list as newer ones land takes its place with it.
   */
  id: string
}

/**
 * The key a row's button carries.
 *
 * @param kind which list the row is in
 * @param id the file's path, the tool's name, or the call's place
 * @returns the key
 */
export const pickKey = (kind: PickKind, id: string): string =>
  `${PICK_PREFIX}${kind}:${id}`

/**
 * Whether a key is one of a row, which is what the focus hook asks of every
 * element the ring lands on.
 *
 * @param key the element's key
 * @returns whether it names a row
 */
export const isPickable = (key: string): boolean => key.startsWith(PICK_PREFIX)

/**
 * What a key names, or null for anything that is not a row's key.
 *
 * @param key the key, or null where nothing is picked
 * @returns the row it names, or null
 */
export function pickedOf(key: string | null): Picked | null {
  if (key === null || !isPickable(key)) {
    return null
  }

  const rest = key.slice(PICK_PREFIX.length)
  const at = rest.indexOf(':')

  if (at <= 0) {
    return null
  }

  const kind = rest.slice(0, at)
  const id = rest.slice(at + 1)

  return kind === 'file' || kind === 'tool' || kind === 'call'
    ? { kind, id }
    : null
}
