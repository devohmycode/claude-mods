/**
 * The rule of the pane that stands in for the cockpit.
 *
 * Enter on the cockpit's rail tile is the only word this mod gets that the
 * person wants into its tab. The ring cannot be led there: the engine refuses
 * `$.ui.focus` on an element another plugin drew — *no element of its own is
 * drawn under that key* — and a `ui.focus` hook may only land the ring on an
 * element of the plugin the move was already heading at. So the way in is a
 * pane of this mod's own, opened where the cockpit has stepped aside, and the
 * way back is that pane closing.
 *
 * Pure, and here rather than in `register.ts`, because the moment it decides
 * is one no test can raise: Escape on a pane is the surface's own key and not
 * a call the kit makes. What the rule comes to is what is checked instead.
 */

import type { PaneCloseOrigin } from 'claude-code'

/**
 * Whether a pane closing owes the cockpit its tab back.
 *
 * Only the pane Enter opened does, and only where the person is the one
 * closing it: a pane this mod closed itself is on its way somewhere and would
 * be met halfway by a cockpit coming up, and `unload` is a pane that is gone
 * before its plugin hears of it.
 *
 * @param isZoomed whether the pane closing is the one opened over a cockpit
 *   that stepped aside
 * @param kind who is closing it, as the engine stamped the close
 * @returns whether to ask the cockpit for its tab again
 */
export const isReturning = (
  isZoomed: boolean,
  kind: PaneCloseOrigin['kind'],
): boolean => isZoomed && kind === 'person'
