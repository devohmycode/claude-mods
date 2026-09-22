/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The Stats tab: how the person has used Claude Code on this machine, read
 * from `~/.claude/history.jsonl` — one line per prompt typed, with its
 * instant, its session and its project.
 *
 * It counts prompts and days, never tokens, and every line of it says so.
 * The token totals of a lifetime live in the transcripts: 2 GB of them here,
 * and a hundred of those files past the 4 MiB `$.fs.read` will carry. A tab
 * that printed a token total off the part it could read would be drawing a
 * figure it cannot stand behind.
 */

import type { CockpitDraw, CockpitTab, RenderElement } from 'claude-code'

import { countText, dateText, fitPath, pad, padLeft } from '../format'
import {
  CALENDAR_SHADES,
  CALENDAR_WEEKS,
  STATS_RANGES,
} from '../names'
import { say } from '../say'
import { calendarRasterOf } from '../raster'
import { calendarOf, startOf, statsOf } from '../stats'
import type { Prompt, Range, Stats } from '../stats'

/**
 * What the Stats tab needs: the prompts as the history file gave them, the
 * window the person chose, and the two presses that move either.
 */
export type StatsDeps = {
  /**
   * The prompts, or null while the file has not been read — or could not be.
   */
  prompts: () => readonly Prompt[] | null

  /**
   * Whether a read is under way, so an empty tab says which empty it is.
   */
  isReading: () => boolean

  /**
   * The window the figures are drawn over.
   */
  range: () => Range

  /**
   * Chooses the window.
   */
  setRange: (range: Range) => void

  /**
   * Reads the history file; run when the tab becomes the one on screen.
   */
  refreshStats: () => void

  /**
   * The engine's clock as the last poll read it.
   */
  nowMs: () => number
}

/**
 * The offset the calendar and the streaks are built on: minutes behind UTC,
 * as the host reads it, so a day is the day the person lived.
 *
 * @param nowMs the clock
 * @returns the offset in minutes
 */
const offsetOf = (nowMs: number): number => new Date(nowMs).getTimezoneOffset()

/**
 * One `label  value` line of the tab's two columns.
 *
 * @param ui the surface's elements
 * @param label the label
 * @param value the value
 * @param width the label's width
 * @returns the line
 */
/**
 * The contribution calendar, the one drawing that is the terminal's alone: a
 * `Raster` of seven rows, one column a week, every cell shaded by the
 * prompts of its day against the busiest day of the window.
 *
 * @param draw the pane's draw, narrowed to the terminal by this call
 * @param stats the figures of the chosen window
 * @param offsetMin the local offset in minutes behind UTC
 * @param nowMs the engine's clock
 * @returns the calendar, or null off the terminal and before the first prompt
 */
function calendar(
  draw: CockpitDraw,
  stats: Stats,
  offsetMin: number,
  nowMs: number,
): RenderElement | null {
  if (draw.surface !== 'terminal' || stats.days.length === 0) {
    return null
  }

  const { Raster } = draw.ui

  const weeks = Math.max(1, Math.min(CALENDAR_WEEKS, draw.columns))
  const grid = calendarRasterOf(
    calendarOf(stats.days, nowMs, weeks, offsetMin),
    CALENDAR_SHADES,
  )

  if (!grid) {
    return null
  }

  return (
    <Raster
      key="stats-calendar"
      columns={grid.columns}
      rows={grid.rows}
      cells={grid.cells}
    />
  )
}

function figure(
  ui: CockpitDraw['ui'],
  label: string,
  value: string,
  width: number,
): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row">
      <Text dimColor>{pad(label, width)}</Text>
      <Text>{value}</Text>
    </Box>
  )
}

/**
 * The buttons that choose the window, the chosen one drawn plainly and the
 * others dim.
 *
 * @param ui the surface's elements
 * @param deps the tab's handlers
 * @returns the row
 */
function ranges(ui: CockpitDraw['ui'], deps: StatsDeps): RenderElement {
  const { Box, Button } = ui
  const chosen = deps.range()

  return (
    <Box flexDirection="row" gap={2}>
      {STATS_RANGES.map(id => (
        <Button
          key={`range:${id}`}
          plain
          dimColor={id !== chosen}
          onPress={() => deps.setRange(id)}
        >
          {say().stats.ranges[id]}
        </Button>
      ))}
    </Box>
  )
}

/**
 * Stats: the prompts of this machine, by day, session and project.
 *
 * @param deps the history and the window
 * @returns the tab
 */
export function statsTab(deps: StatsDeps): CockpitTab {
  return {
    id: 'stats',
    title: say().titles.stats,
    order: 8,
    onShow: () => {
      deps.refreshStats()
    },
    render: draw => {
      const { Box, Text } = draw.ui
      const prompts = deps.prompts()
      const nowMs = deps.nowMs()

      if (prompts === null) {
        return (
          <Box flexDirection="column">
            <Text dimColor>
              {deps.isReading() ? say().stats.reading : say().stats.none}
            </Text>
          </Box>
        )
      }

      const offset = offsetOf(nowMs)
      const stats = statsOf(prompts, nowMs, deps.range(), offset)

      const grid = calendar(draw, stats, offset, nowMs)

      const label = Math.min(16, Math.max(12, Math.floor(draw.columns * 0.35)))

      const busiest =
        stats.busiest === null
          ? '—'
          : `${dateText(startOf(stats.busiest.day, offset), nowMs)} · ${stats.busiest.prompts}`

      return (
        <Box flexDirection="column">
          {grid !== null && (
            <Box flexDirection="column">
              {grid}
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{say().stats.legend}</Text>
                <Text dimColor>{'░▒▓█'}</Text>
                <Text dimColor>{say().stats.legendMore}</Text>
              </Box>
            </Box>
          )}

          <Box marginTop={1}>{ranges(draw.ui, deps)}</Box>

          <Box marginTop={1} flexDirection="column">
            {figure(
              draw.ui,
              say().stats.prompts,
              countText(stats.prompts),
              label,
            )}
            {figure(
              draw.ui,
              say().stats.sessions,
              String(stats.sessions),
              label,
            )}
            {figure(
              draw.ui,
              say().stats.projects,
              String(stats.projects),
              label,
            )}
            {figure(
              draw.ui,
              say().stats.activeDays,
              `${stats.activeDays}/${stats.spanDays}`,
              label,
            )}
            {figure(draw.ui, say().stats.busiest, busiest, label)}
            {figure(
              draw.ui,
              say().stats.currentStreak,
              say().stats.days(stats.currentStreak),
              label,
            )}
            {figure(
              draw.ui,
              say().stats.longestStreak,
              say().stats.days(stats.longestStreak),
              label,
            )}
            {stats.topProject !== null &&
              figure(
                draw.ui,
                say().stats.topProject,
                `${fitPath(stats.topProject.project.replace(/\\/g, '/'), Math.max(8, draw.columns - label - 8))} ${padLeft(String(stats.topProject.prompts), 5)}`,
                label,
              )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              {stats.firstMs === null
                ? say().stats.title
                : `${say().stats.title} · ${say().stats.since(dateText(stats.firstMs, nowMs))}`}
            </Text>
            <Text dimColor>{say().stats.source}</Text>
          </Box>
        </Box>
      )
    },
  }
}
