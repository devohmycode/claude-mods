/* @jsxRuntime classic */
/* @jsx h */
/**
 * The row under a list the body had no room for: what it hides, and the
 * press that draws the whole of it instead.
 *
 * Its own module, and its own parameter type, because two tabs draw it and
 * one of them is drawn by the other: a helper reaching back for `TabDeps`
 * would close a circle between the modules. `TabDeps` satisfies `MoreDeps`
 * by its shape, so neither tab has to hand it anything of its own.
 */

import type { CockpitDraw, RenderElement } from 'claude-code'

import { say } from '../say'

/**
 * The one handler the row needs: the press that draws the whole list, or
 * goes back to the rows the body has.
 */
export type MoreDeps = {
  showAll: (id: string, isAll: boolean) => void
}

/**
 * The row itself.
 *
 * A list longer than the body is one the surface scrolls, which is worth
 * paying for where the person asked for it and not before.
 *
 * @param ui the surface's element table
 * @param id the list's id, which holds the choice
 * @param isAll whether the whole list is already drawn
 * @param hidden the rows the body had no room for
 * @param deps the press
 * @returns the row
 */
export function more(
  ui: CockpitDraw['ui'],
  id: string,
  isAll: boolean,
  hidden: number,
  deps: MoreDeps,
): RenderElement {
  const { Button } = ui

  return (
    <Button
      key={`more:${id}`}
      plain
      dimColor
      onPress={() => deps.showAll(id, !isAll)}
    >
      {isAll ? say().pane.showLess : say().pane.showMore(hidden)}
    </Button>
  )
}
