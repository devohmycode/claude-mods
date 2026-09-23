/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The tab's body: the journal as a person reads it.
 *
 * One column of lines, because that is what the figures are — one row per
 * side, one per fault, one for the mod's own column. A chart would have to
 * choose a unit, and choosing one is exactly what this mod does not do.
 *
 * The same lines the ticket writes to the transcript and the debug log, so
 * there is one wording for a figure and not three. The body is drawn from
 * this mod's own `ui.render` hook into the slot the cockpit leaves: a call on
 * another plugin's noun must carry plain data, and a `render` function is not
 * plain data.
 */

import type { CockpitDraw, RenderElement } from 'claude-code'

import { fitText } from '../format'
import type { Ledger } from '../ledger'
import { TEXTS } from '../names'
import type { Spend } from '../spend'
import { reportLines } from '../ticket'

/**
 * What the tab draws from: the journal, the mod's own column, and the surface
 * the pane is on.
 */
export type ClaugetView = {
  draw: CockpitDraw
  ledger: Ledger
  spend: Spend
}

/**
 * The body.
 *
 * @param view the journal, the column and the surface
 * @returns the drawing
 */
export function view(view: ClaugetView): RenderElement {
  const { Box, Text } = view.draw.ui
  const columns = Math.max(20, view.draw.columns)
  const lines = reportLines(view.ledger, view.spend)
  const rows = Math.max(1, view.draw.rows - 2)

  return (
    <Box flexDirection="column" width={columns}>
      <Text bold>{fitText(TEXTS.title, columns)}</Text>
      <Text> </Text>
      {lines.slice(0, rows).map((line, at) => (
        <Text key={`line-${at}`} dimColor={at >= lines.length - 1}>
          {fitText(line, columns)}
        </Text>
      ))}
    </Box>
  )
}
