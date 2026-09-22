/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The pane's own tree: the rail of tabs, the rule under it, the selected
 * tab's body, and the footer. Everything below the rule belongs to the tab.
 */

import type {
  CockpitBadge,
  CockpitDraw,
  CockpitTab,
  RenderElement,
} from 'claude-code'

import { BODY_KEY, BODY_PAD_COLUMNS, CHROME_ROWS } from '../names'
import { railKey } from '../ring'
import { say } from '../say'

/**
 * What the pane needs beyond its tabs to draw itself.
 */
export type PaneKit = {
  /**
   * The draw the selected tab is handed, the pane's own box already taken off
   * its `columns` and `rows`.
   */
  draw: CockpitDraw

  /**
   * The tabs in rail order.
   */
  tabs: readonly CockpitTab[]

  /**
   * The selected tab's id.
   */
  selected: string

  /**
   * Each flagged tab's flag, by id.
   */
  badges: Readonly<Record<string, CockpitBadge | null>>

  /**
   * What pressing a rail button does: shows the tab, or, where it is the one
   * already shown, moves the focus ring into what it drew.
   *
   * The ring shows a tab as it lands on it, so Enter on the tab under the
   * ring has nothing left to select: it is the way in, and the ends of the
   * body are the way back out.
   *
   * A tab another plugin drew has no way in of the cockpit's: the engine
   * refuses `$.ui.focus` on an element this plugin did not draw. The press
   * goes through whole all the same, and the plugin that drew the body
   * answers it from its own `ui.press` hook on this tile.
   */
  press: (id: string) => void

  /**
   * What the hooks beneath this one drew, where a tab of another plugin has
   * already put its body there under the slot's key.
   *
   * A plugin cannot hand the cockpit a `render` — a call on another plugin's
   * noun crosses an environment boundary and its arguments must be plain
   * data, which a function is not — so it draws its own body from its own
   * `ui.render` hook. Whether that hook sits inside this one or outside it is
   * nothing either of them chooses: inside, the body arrives here; outside,
   * the slot this draws is what the body replaces.
   */
  below: RenderElement | null

  /**
   * What the pane says where the rail has nothing on it. An empty rail means
   * two different things — nothing registered, or everything left out by the
   * `/config` row — and only the register module knows which, so it says.
   */
  emptyText?: string
}

/**
 * The element keyed `key`, anywhere in a drawing.
 *
 * The drawing is plain data — `{ type, props, children }` — and is walked as
 * such rather than narrowed through `RenderElement`, whose union has leaves
 * with no children and a node of the engine's own with no props.
 *
 * @param tree the drawing, or one of its nodes
 * @param key the key to look for
 * @returns the element, or null where the drawing holds none
 */
export function foundIn(tree: unknown, key: string): RenderElement | null {
  if (Array.isArray(tree)) {
    for (const child of tree as readonly unknown[]) {
      const found = foundIn(child, key)

      if (found !== null) {
        return found
      }
    }

    return null
  }

  if (typeof tree !== 'object' || tree === null) {
    return null
  }

  const node = tree as {
    readonly props?: { readonly key?: unknown }
    readonly children?: unknown
  }

  return node.props?.key === key
    ? (tree as RenderElement)
    : foundIn(node.children, key)
}

/**
 * The body's box, the pane's less the frame the cockpit keeps for its rail,
 * its rule and its footer.
 *
 * @param bodyColumns the pane's own width
 * @param bodyRows the pane's own height
 * @returns the cells a tab draws into, never less than one
 */
export const bodyBoxOf = (
  bodyColumns: number,
  bodyRows: number,
): { columns: number; rows: number } => ({
  columns: Math.max(1, bodyColumns - BODY_PAD_COLUMNS),
  rows: Math.max(1, bodyRows - CHROME_ROWS),
})

/**
 * A tab's title as the rail draws it, its flag beside it.
 *
 * @param title the tab's title
 * @param badge its flag, or null
 * @returns the label
 */
export const labelOf = (title: string, badge: CockpitBadge | null): string =>
  badge === null || badge === 0
    ? title
    : badge === 'dot'
      ? `${title} •`
      : `${title} ${badge}`

/**
 * The pane's tree.
 *
 * A tab that draws nothing leaves its line to the pane, which says so rather
 * than showing an empty box; a pane with no tab at all says that instead.
 *
 * @param kit the draw, the tabs, the selection and its handler
 * @returns the pane's tree
 */
export function paneView(kit: PaneKit): RenderElement {
  const { Box, Text, Button } = kit.draw.ui
  const { columns } = kit.draw

  const tab = kit.tabs.find(one => one.id === kit.selected) ?? kit.tabs[0]

  // A tab of this module draws itself; a tab another plugin contributed draws
  // into the slot, either by having already put its body in what came from
  // beneath, or by replacing the empty one this leaves for it.
  const body =
    tab?.render !== undefined
      ? tab.render(kit.draw)
      : (foundIn(kit.below, BODY_KEY) ?? <Box key={BODY_KEY} flexDirection="column" />)

  return (
    <Box key="cockpit" flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {kit.tabs.map((one, index) => (
          <Button
            key={railKey(one.id)}
            plain
            hotkey={index < 9 ? String(index + 1) : undefined}
            dimColor={one.id !== kit.selected}
            // The ring starts on the tab already being shown when the pane
            // takes the keyboard, rather than on the rail's first: landing on
            // a tab shows it, and a pane that changed tabs because somebody
            // pressed Tab once would be a pane that reads the key twice.
            autoFocus={one.id === kit.selected ? true : undefined}
            onPress={() => kit.press(one.id)}
          >
            {labelOf(one.title, kit.badges[one.id] ?? null)}
          </Button>
        ))}
      </Box>
      <Text dimColor>{'─'.repeat(Math.max(1, columns))}</Text>
      {body ?? (
        <Text dimColor>
          {kit.tabs.length === 0 ? (kit.emptyText ?? say().pane.noTabs) : ' '}
        </Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>{say().pane.footer}</Text>
      </Box>
    </Box>
  )
}
