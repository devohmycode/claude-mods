/* @jsxRuntime classic */
/* @jsx h */
/**
 * The Usage tab: what the session spent, what the account has left, and what
 * the skill listings cost the system prompt every turn.
 *
 * The Session tab draws what is happening; this one draws what it costs. The
 * plan windows moved here from there for that reason: they describe the
 * account and not the session, and they are the first thing anyone opening a
 * cockpit about spending is looking for.
 */

import type { CockpitDraw, CockpitTab, RenderElement } from 'claude-code'

import {
  barText,
  churnParts,
  countText,
  fitText,
  limitName,
  longMsText,
  modelText,
  pad,
  padLeft,
  percentText,
  untilText,
  usdText,
} from '../format'
import {
  LIMIT_HOT_PERCENT,
  PLUGINS_MAX,
  SKILLS_LIST,
} from '../names'
import { say } from '../say'
import type { State } from '../state'
import { agentShareOf, totalOf } from '../usage'
import type { Ledger, Side } from '../usage'
import { more } from './more'

/**
 * What the Usage tab needs: the state at draw time, and the reading the
 * Session tab already asks for when it is looked at.
 */
export type UsageDeps = {
  state: () => State
  refreshVitals: () => void

  /**
   * Whether the skill listing draws whole rather than the rows the body has.
   */
  isAll: (id: string) => boolean

  /**
   * Draws it whole, or goes back to the rows the body has.
   */
  showAll: (id: string, isAll: boolean) => void
}

/**
 * One `label  value` line, the same measure the Session tab draws its vitals
 * on so the two tabs read as one pane.
 *
 * @param ui the surface's elements
 * @param label the label
 * @param value the value
 * @param note a dim word after the value, where there is one
 * @returns the line
 */
function line(
  ui: CockpitDraw['ui'],
  label: string,
  value: string,
  note?: string,
): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" gap={1}>
      <Text dimColor>{pad(label, 10)}</Text>
      <Text>{value}</Text>
      {note !== undefined && <Text dimColor>{note}</Text>}
    </Box>
  )
}

/**
 * The width of one token column, so the four of them and the row's label fit
 * the pane without any of them being cut.
 *
 * @param columns the body's width in cells
 * @returns the label's width and one column's
 */
export function tokenColumnsOf(columns: number): {
  label: number
  cell: number
} {
  const cell = Math.max(6, Math.min(9, Math.floor((columns - 12) / 4)))

  return { label: Math.max(8, columns - cell * 4), cell }
}

/**
 * One row of the token table: a side of the ledger, its four counters right
 * aligned under their headings.
 *
 * @param ui the surface's elements
 * @param label the row's name
 * @param side the counters
 * @param width the label's width and one column's
 * @param isTotal whether the row is the total, drawn plainly where the two
 *   above it are dim
 * @returns the row
 */
function tokenRow(
  ui: CockpitDraw['ui'],
  label: string,
  side: Side,
  width: { label: number; cell: number },
  isTotal: boolean,
): RenderElement {
  const { Box, Text } = ui

  const counts = [side.input, side.output, side.cacheRead, side.cacheWrite]

  return (
    <Box key={`tokens:${label}`} flexDirection="row">
      <Text dimColor={!isTotal}>{pad(label, width.label)}</Text>
      {counts.map((count, at) => (
        <Text key={`count:${label}:${at}`} dimColor={!isTotal}>
          {padLeft(countText(count), width.cell)}
        </Text>
      ))}
    </Box>
  )
}

/**
 * The token table: the main loop, the subagents and the total, each on its
 * own row, under the four headings the API spells its counters with.
 *
 * The four stay four. Adding them would make one number out of four prices,
 * and every share drawn off it would be a figure with no unit behind it.
 *
 * @param draw the pane's draw
 * @param ledger the session's ledger
 * @returns the table
 */
function tokenTable(draw: CockpitDraw, ledger: Ledger): RenderElement {
  const { Box, Text } = draw.ui
  const width = tokenColumnsOf(draw.columns)
  const total = totalOf(ledger)

  return (
    <Box marginTop={1} flexDirection="column">
      <Box flexDirection="row">
        <Text dimColor>{pad(say().usage.tokens, width.label)}</Text>
        {say().usage.columns.map(heading => (
          <Text key={`head:${heading}`} dimColor>
            {padLeft(heading, width.cell)}
          </Text>
        ))}
      </Box>
      {tokenRow(draw.ui, say().usage.main, ledger.main, width, false)}
      {ledger.agents.turns > 0 &&
        tokenRow(draw.ui, say().usage.agents, ledger.agents, width, false)}
      {tokenRow(draw.ui, say().usage.total, total, width, true)}
    </Box>
  )
}

/**
 * The models that answered, one row each, with the turns they took and what
 * they wrote: a session that switched model mid-way says so here.
 *
 * @param draw the pane's draw
 * @param ledger the session's ledger
 * @returns the rows, or null where one model answered every turn
 */
function modelRows(draw: CockpitDraw, ledger: Ledger): RenderElement | null {
  const { Box, Text } = draw.ui

  if (ledger.models.length < 2) {
    return null
  }

  const width = Math.max(10, draw.columns - 20)

  return (
    <Box marginTop={1} flexDirection="column">
      {ledger.models.map(row => (
        <Box key={`model:${row.model}`} flexDirection="row">
          <Text>{pad(modelText(row.model, width), width)}</Text>
          <Text dimColor>{padLeft(`${row.turns}t`, 6)}</Text>
          <Text dimColor>{padLeft(`${countText(row.output)} out`, 14)}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * The plan windows, each a bar of how much of it is spent and how long is
 * left of it.
 *
 * @param draw the pane's draw
 * @param state the state at draw time
 * @returns the block, or null before a response has carried one
 */
function limitRows(draw: CockpitDraw, state: State): RenderElement | null {
  const { Box, Text } = draw.ui
  const { vitals, nowMs } = state

  if (vitals.limits.length === 0) {
    return null
  }

  const name = Math.min(18, Math.max(10, Math.floor(draw.columns * 0.3)))
  const bar = Math.max(6, Math.min(24, draw.columns - name - 18))

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>{say().pane.limits}</Text>
      {vitals.limits.map(limit => (
        <Box key={`limit:${limit.kind}`} flexDirection="row" gap={1}>
          <Text>{pad(fitText(limitName(limit.kind), name), name)}</Text>
          <Text
            color={
              limit.percent >= LIMIT_HOT_PERCENT ? 'diffRemovedWord' : undefined
            }
          >
            {barText(limit.percent, bar)}
          </Text>
          <Text>{padLeft(percentText(limit.percent), 4)}</Text>
          <Text dimColor>
            {limit.resetsMs === null
              ? ''
              : untilText(limit.resetsMs - nowMs)}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * The skill listings, by the provider that carries them: how many skills
 * each one lists and what the listing costs every turn the prompt is sent.
 *
 * A session lists more providers than the body has rows, so the list is cut
 * and a `Show more` row under it draws the whole of it — the same press the
 * Files and Tools tabs cut their lists with. The total counts every provider
 * whichever way the list stands, because the total is the figure anyone came
 * to this block for.
 *
 * @param draw the pane's draw
 * @param state the state at draw time
 * @param rows how many rows the body has left
 * @param deps the tab's handlers
 * @returns the block, or null where the session lists no skill
 */
function skillRows(
  draw: CockpitDraw,
  state: State,
  rows: number,
  deps: UsageDeps,
): RenderElement | null {
  const { Box, Text } = draw.ui
  const plugins = state.vitals.plugins

  if (plugins.length === 0) {
    return null
  }

  const isAll = deps.isAll(SKILLS_LIST)

  // The heading, the total and the `Show more` row are the block's own three,
  // so a cut list never hides a provider behind the rows that describe it.
  const room = Math.max(1, Math.min(PLUGINS_MAX, rows - 3))
  const shown = isAll ? plugins : plugins.slice(0, room)
  const hidden = plugins.length - shown.length

  const tokens = plugins.reduce((sum, one) => sum + one.tokens, 0)
  const skills = plugins.reduce((sum, one) => sum + one.skills, 0)

  const name = Math.max(10, draw.columns - 22)

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>{say().usage.skills}</Text>
      {shown.map(one => (
        <Box key={`plugin:${one.plugin}`} flexDirection="row">
          <Text>{pad(fitText(one.plugin, name), name)}</Text>
          <Text dimColor>{padLeft(say().usage.skillCount(one.skills), 10)}</Text>
          <Text dimColor>{padLeft(`~${countText(one.tokens)}`, 8)}</Text>
        </Box>
      ))}
      <Box flexDirection="row">
        <Text>{pad(say().usage.total, name)}</Text>
        <Text dimColor>{padLeft(say().usage.skillCount(skills), 10)}</Text>
        <Text>{padLeft(`~${countText(tokens)}`, 8)}</Text>
      </Box>
      {(hidden > 0 || isAll) && more(draw.ui, SKILLS_LIST, isAll, hidden, deps)}
    </Box>
  )
}

/**
 * Usage: the session's bill and the account's windows.
 *
 * @param deps the state and the vitals refresh
 * @returns the tab
 */
export function usageTab(deps: UsageDeps): CockpitTab {
  return {
    id: 'usage',
    title: say().titles.usage,
    order: 5,
    onShow: () => {
      deps.refreshVitals()
    },
    render: draw => {
      const { Box, Text } = draw.ui
      const state = deps.state()
      const { ledger, vitals } = state

      const total = totalOf(ledger)
      const share = agentShareOf(ledger)

      const churn = state.files.reduce(
        (sum, file) => ({
          added: sum.added + file.added,
          removed: sum.removed + file.removed,
        }),
        { added: 0, removed: 0 },
      )

      const lines = churnParts(churn.added, churn.removed, 0)

      // The body's rows, less the four vitals, the token table and the plan
      // windows: what the skill listing has left to draw in.
      const spent =
        5 +
        (ledger.agents.turns > 0 ? 5 : 4) +
        (ledger.models.length >= 2 ? ledger.models.length + 1 : 0) +
        (vitals.limits.length === 0 ? 0 : vitals.limits.length + 2)

      return (
        <Box flexDirection="column">
          <Text dimColor>{say().usage.session}</Text>
          {line(draw.ui, say().usage.cost, usdText(vitals.costUsd))}
          {line(
            draw.ui,
            say().usage.turns,
            String(total.turns),
            ledger.agents.turns > 0
              ? say().usage.underAgents(ledger.agents.turns)
              : undefined,
          )}
          {line(draw.ui, say().usage.wall, longMsText(total.durationMs))}
          {line(
            draw.ui,
            say().usage.lines,
            `${lines.added}${lines.removed}` || '—',
          )}
          {total.turns === 0 ? (
            <Box marginTop={1}>
              <Text dimColor>{say().usage.noTurns}</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {tokenTable(draw, ledger)}
              {share !== null && share >= 1 && (
                <Text dimColor>
                  {say().usage.share(percentText(share))}
                </Text>
              )}
              {modelRows(draw, ledger) ?? false}
            </Box>
          )}
          {limitRows(draw, state) ?? false}
          {skillRows(draw, state, draw.rows - spent, deps) ?? false}
        </Box>
      )
    },
  }
}
