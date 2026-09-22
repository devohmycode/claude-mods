/**
 * The pane's focus ring: which keys it may land on, and where a move that
 * would take it off the rail is sent instead.
 *
 * The surface keeps one ring per site, over every `Button`, `Input` and
 * `Select` drawn in it, plus stops of its own — the pane's close mark and,
 * with several panes open, their tabs. Tab and the arrows walk it, and the
 * cockpit draws two rows of stops into it that mean different things: the
 * rail of tabs across the top, then the elements of the shown tab under the
 * rule.
 *
 * Left alone, Tab walks out of the rail into the close mark and the body,
 * which is not what a rail is for. What this module says is: while the ring
 * is on the rail it stays on the rail and wraps, and while it is in the body
 * it stays in the body, the way a row of tabs and a form under it read
 * everywhere else.
 *
 * Pure: a drawing and a ring position in, the key the ring belongs on out.
 */

/**
 * What every rail key starts with, so the reading of a key says whether the
 * ring is on a tab or on something the tab drew.
 */
export const RAIL_PREFIX = 'tab:'

/**
 * The key a tab's rail button carries.
 *
 * @param id the tab's id
 * @returns the key
 */
export const railKey = (id: string): string => `${RAIL_PREFIX}${id}`

/**
 * The tab a rail key names, or null for any other key.
 *
 * @param key the element's key
 * @returns the tab's id, or null
 */
export const railIdOf = (key: string): string | null =>
  key.startsWith(RAIL_PREFIX) ? key.slice(RAIL_PREFIX.length) : null

/**
 * The elements a surface's ring stops on, as `$.ui.focus` names them.
 */
const FOCUSABLE: readonly string[] = ['Button', 'Input', 'Select']

/**
 * Every key the ring can land on in a drawing, in the order it is drawn.
 *
 * The drawing is plain data — `{ type, props, children }` — and is walked as
 * such rather than narrowed through `RenderElement`, whose union has leaves
 * with no children and a node of the engine's own with no props. A tab
 * another plugin contributed is in there too: its elements are stops of the
 * same ring, and leaving them out would make the ring jump over them.
 *
 * @param tree the drawing, or one of its nodes
 * @param into where the keys are collected, for the walk's own use
 * @returns the keys, in document order
 */
export function focusablesOf(
  tree: unknown,
  into: string[] = [],
): readonly string[] {
  if (Array.isArray(tree)) {
    for (const child of tree as readonly unknown[]) {
      focusablesOf(child, into)
    }

    return into
  }

  if (typeof tree !== 'object' || tree === null) {
    return into
  }

  const node = tree as {
    readonly type?: unknown
    readonly props?: { readonly key?: unknown }
    readonly children?: unknown
  }

  if (
    typeof node.type === 'string' &&
    FOCUSABLE.includes(node.type) &&
    typeof node.props?.key === 'string'
  ) {
    into.push(node.props.key)
  }

  return focusablesOf(node.children, into)
}

/**
 * The ring as the cockpit reads it: the rail across the top, and everything
 * the shown tab drew under it.
 */
export type Ring = {
  /**
   * The rail's keys, left to right.
   */
  rail: readonly string[]

  /**
   * The shown tab's own stops, in the order it drew them.
   */
  body: readonly string[]

  /**
   * Whether the body is the cockpit's own drawing rather than a tab another
   * plugin drew into the slot.
   *
   * It decides whether the ring may be moved off the body at all: the engine
   * refuses `$.ui.focus` while another plugin's element holds the keyboard,
   * so a body of somebody else's is left to walk itself rather than kept
   * where a call that cannot land would strand it.
   */
  isOwn: boolean
}

/**
 * A ring with nothing on it: what a pane that has not been drawn yet has.
 */
export const NO_RING: Ring = { rail: [], body: [], isOwn: false }

/**
 * The two rows of a drawing's keys, told apart by the rail's own.
 *
 * @param keys every key the ring stops on, in document order
 * @param ids the tabs on the rail, in rail order
 * @param isOwn whether the shown tab drew its own body
 * @returns the rail's keys and the body's
 */
export function ringOf(
  keys: readonly string[],
  ids: readonly string[],
  isOwn = true,
): Ring {
  const rail = new Set(ids.map(railKey))

  return {
    rail: keys.filter(key => rail.has(key)),
    body: keys.filter(key => !rail.has(key)),
    isOwn,
  }
}

/**
 * The stop a press on a rail tile asks the ring for, or null where the press
 * is not a way in.
 *
 * A tile that is not the one shown shows its tab, and the ring follows on its
 * own; a tile already shown is the way into what that tab drew. Save where
 * another plugin drew it: the engine refuses `$.ui.focus` on an element this
 * plugin did not draw — *no element of its own is drawn under that key* — so
 * asking would be asking to be refused. There the press is left whole to the
 * plugin that drew the body, which hears it as `ui.press` on the tile and
 * answers it with a surface of its own.
 *
 * @param ring the rail and the body, as the last drawing left them
 * @param selected the shown tab's id
 * @param id the tab whose tile was pressed
 * @returns the key to put the ring on, or null to leave it where it is
 */
export const entryOf = (
  ring: Ring,
  selected: string,
  id: string,
): string | null =>
  id === selected && ring.isOwn ? (ring.body[0] ?? null) : null

/**
 * Where the ring belongs once a move has been asked for, or null to let the
 * move stand.
 *
 * The surface tells a hook where the ring is going and not which key sent it
 * there: in a pane Tab and the down arrow raise the same move, so the rail
 * and the body cannot be given a key each. They are given a row each
 * instead — the ring walks the row it is already on, and the way into the
 * body is Enter on the shown tab, the way out either of its ends.
 *
 * Neither row reaches the surface's own stops, which is the whole of the
 * complaint this answers: the close mark is a click, Escape or ctrl+x x, and
 * not something Tab should walk into between a list and its rail.
 *
 * A move that lands where neither row ends is somebody pointing at a row
 * with the mouse, and is left alone.
 *
 * @param ring the rail and the body, as the last drawing left them
 * @param selected the shown tab's rail key, where the body sends the ring back
 * @param from the key the ring is on, or null where it is on none of ours
 * @param wanted the key the move names, or undefined for a stop of the
 *   surface's own (the pane's close mark, another pane's tab)
 * @returns the key to land on instead, or null to let the move stand
 */
export function landingOf(
  ring: Ring,
  selected: string | null,
  from: string | null,
  wanted: string | undefined,
): string | null {
  if (from === null) {
    return null
  }

  const { rail, body } = ring
  const first = rail[0]
  const last = rail[rail.length - 1]
  const top = body[0]
  const bottom = body[body.length - 1]

  if (first !== undefined && last !== undefined && rail.includes(from)) {
    // Off the rail's right-hand end: the stop past the last tab is the first
    // thing the tab drew, or the surface's own where it drew nothing.
    if (from === last && (wanted === undefined || wanted === top)) {
      return first
    }

    // And off its left-hand end, where Tab lands on the surface's stops and
    // the up arrow, which never leaves the plugin's own, on the last of them.
    if (from === first && (wanted === undefined || wanted === bottom)) {
      return last
    }

    return null
  }

  // A tab that is shown without being on the rail — one the `/config` row
  // hides, one nobody registered — is no landing for the ring, and a body
  // another plugin drew is not the cockpit's to move the ring off.
  if (
    !ring.isOwn ||
    !body.includes(from) ||
    selected === null ||
    !rail.includes(selected) ||
    wanted === selected
  ) {
    return null
  }

  // Out of the body by either end, and onto the tab being shown rather than
  // the one the ring's own order would give: walking out of a list is no
  // reason to change what the pane is showing.
  const isOut =
    (from === bottom && (wanted === undefined || wanted === first)) ||
    (from === top && wanted === last)

  return isOut ? selected : null
}
