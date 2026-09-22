/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The band above the prompt: one button that opens the pane and closes it
 * again, the same toggle `/cockpit` is, for a person who would rather press
 * a thing than type a command.
 *
 * The band is shared, so the cockpit's row is drawn under whatever the
 * plugins beneath it drew there rather than in its place.
 */

import type { CockpitDraw, RenderElement, RenderNode } from 'claude-code'

import { BAND_HOTKEY, BAND_KEY } from '../names'
import { say } from '../say'

/**
 * What the band needs to draw itself.
 */
export type BandKit = {
  /**
   * The surface's element table, as `$.ui.resolve` answers it.
   */
  ui: CockpitDraw['ui']

  /**
   * What the plugins beneath the cockpit drew in the same band, which the
   * cockpit's own row sits under.
   */
  below: RenderNode

  /**
   * Whether the pane is open, which is what the button offers to undo.
   */
  isOpen: boolean

  /**
   * Opens the pane, or closes the open one: what pressing the button does.
   */
  toggle: () => void
}

/**
 * The band's tree.
 *
 * @param kit the elements, what is beneath, the pane's state and the toggle
 * @returns the band's tree, the cockpit's button last
 */
export function bandView(kit: BandKit): RenderElement {
  const { Box, Button } = kit.ui

  return (
    <Box flexDirection="column">
      {kit.below}
      <Box flexDirection="row">
        <Button key={BAND_KEY} hotkey={BAND_HOTKEY} onPress={kit.toggle}>
          {say().pane.band(kit.isOpen)}
        </Button>
      </Box>
    </Box>
  )
}
