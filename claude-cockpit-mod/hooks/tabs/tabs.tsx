/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The cockpit's own four tabs, each one a `CockpitTab` like any a plugin
 * adds: they read the state the hooks record and draw it, and reach the
 * engine through the handlers the register module hands them.
 */

import type { CockpitDraw, CockpitTab, RenderElement } from 'claude-code'

import {
  churnParts,
  countText,
  fitPath,
  fitText,
  gbText,
  msText,
  pad,
  padLeft,
  percentText,
  relativeOf,
  toolText,
  usdText,
} from '../format'
import { isStaged, letterOf } from '../git'
import type { HostStat } from '../host'
import { CARD_ROWS } from '../names'
import { say } from '../say'
import { pickKey, pickedOf } from '../pick'
import { sparklineOf } from '../raster'
import { elapsedOf, isLive } from '../state'
import type { AgentRow, Call, FileStat, State, ToolStat } from '../state'
import type { Prompt, Range } from '../stats'
import { more } from './more'
import { statsTab } from './stats'
import { usageTab } from './usage'

/**
 * What the built-in tabs need from the register module: the state as it
 * stands when the pane draws, and the one thing a press does.
 */
export type TabDeps = {
  /**
   * The state at draw time, read rather than closed over, so a tab drawn
   * after a tool call shows that call.
   */
  state: () => State

  /**
   * Arms a file for the next prompt, or disarms the armed one.
   */
  arm: (path: string) => void

  /**
   * The root the Files tab draws its paths against: the repository's, or the
   * session's working directory where there is no repository.
   */
  root: () => string

  /**
   * The last reading of the machine, or null where the readings are off, no
   * reading has landed yet, or this host answered none of the probes.
   */
  host: () => HostStat | null

  /**
   * The row the person is looking at, by its key, or null for none: what the
   * card under a list is drawn from.
   */
  picked: () => string | null

  /**
   * Picks a row, or drops the one picked where it is pressed again.
   */
  pick: (key: string) => void

  /**
   * Whether the tab named draws its whole list rather than the rows its body
   * has; what the `Show more` button under a cut list turns on.
   */
  isAll: (id: string) => boolean

  /**
   * Draws the whole list, or goes back to the rows the body has.
   */
  showAll: (id: string, isAll: boolean) => void

  /**
   * Asks for a fresh reading of what git makes of the listed files; run when
   * the Files tab becomes the one on screen.
   */
  refreshGit: () => void

  /**
   * Asks for a fresh reading of the session's vitals; run when the Session tab
   * becomes the one on screen, since a turn is what fills them and the first
   * one ends long after the person may have opened the pane.
   */
  refreshVitals: () => void

  /**
   * The prompts the history file holds, or null while it has not been read —
   * or could not be.
   */
  prompts: () => readonly Prompt[] | null

  /**
   * Whether a read of the history is under way, so an empty Stats tab says
   * which empty it is.
   */
  isReading: () => boolean

  /**
   * The window the Stats tab draws its figures over.
   */
  range: () => Range

  /**
   * Chooses that window.
   */
  setRange: (range: Range) => void

  /**
   * Reads the history file; run when the Stats tab becomes the one on screen.
   */
  refreshStats: () => void

  /**
   * The engine's clock as the last poll read it, which the Stats tab reads
   * without going through the state, since a day is settled against it.
   */
  nowMs: () => number
}

/**
 * One field of a card: what it is, and what this row has for it.
 */
type Field = {
  label: string
  value: string
  color?: string
}

/**
 * The card under a list: the row the person picked, written out a field to
 * the line, where the list itself has one cut line for it.
 *
 * @param ui the surface's element table
 * @param fields the fields, in the order they are read
 * @returns the card
 */
function card(ui: CockpitDraw['ui'], fields: readonly Field[]): RenderElement {
  const { Box, Text } = ui

  return (
    <Box
      marginTop={1}
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
    >
      {fields.map(field => (
        <Box key={`field:${field.label}`} flexDirection="row">
          <Text dimColor>{pad(field.label, 8)}</Text>
          <Text color={field.color}>{field.value}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * What a picked file is: how often it was touched, how, where it is, and
 * what it moved.
 *
 * The path is the whole of it rather than the row's short one: a row draws
 * the file from the root the session works in, and the card is where the
 * file itself is written out.
 *
 * @param file the file
 * @param columns the cells the body has
 * @returns its fields
 */
function fileFields(file: FileStat, columns: number): readonly Field[] {
  const kinds: string[] = []

  if (file.reads > 0) {
    kinds.push(`${say().pane.read} ${file.reads}`)
  }

  if (file.writes > 0) {
    kinds.push(`${say().pane.written} ${file.writes}`)
  }

  const letters = `${file.reads > 0 ? 'r' : ''}${file.writes > 0 ? 'w' : ''}`

  return [
    { label: 'Count', value: String(file.reads + file.writes) },
    { label: 'Kind', value: `${pad(letters, 3)}${kinds.join(' · ')}` },
    { label: 'Path', value: fitPath(file.path, Math.max(8, columns - 11)) },
    {
      label: 'Churn',
      value:
        file.added === 0 && file.removed === 0
          ? '—'
          : `+${file.added} -${file.removed}`,
    },
  ]
}

/**
 * What a picked tool is: its own name, whole, and what this session spent in
 * it.
 *
 * @param tool the tally
 * @returns its fields
 */
const toolFields = (tool: ToolStat): readonly Field[] => [
  { label: 'Tool', value: tool.tool },
  { label: 'Calls', value: String(tool.calls) },
  { label: 'Time', value: msText(tool.ms) },
  { label: 'Failed', value: tool.failed === 0 ? '—' : String(tool.failed) },
]

/**
 * What a picked call is: the tool, what it was about, what it took and how
 * it ended.
 *
 * @param call the call
 * @param columns the cells the body has
 * @returns its fields
 */
const callFields = (call: Call, columns: number): readonly Field[] => [
  { label: 'Tool', value: call.tool },
  { label: 'Detail', value: fitText(call.detail, Math.max(8, columns - 11)) },
  { label: 'Time', value: msText(call.ms) },
  {
    label: 'Result',
    value: call.isErrored ? say().pane.failed : say().pane.ok,
    color: call.isErrored ? 'diffRemovedWord' : 'diffAddedWord',
  },
]

/**
 * The color a column of the context sparkline draws in: green while the
 * window is roomy, amber past half, red where compaction is near.
 *
 * @param percent the context the turn ended on
 * @returns the color, `0x00RRGGBB`
 */
const contextColorAt = (percent: number): number =>
  percent >= 80 ? 0xf85149 : percent >= 50 ? 0xd29922 : 0x3fb950

/**
 * The color a git letter draws in: green for a file git does not yet track
 * or has just been given, red for one that is gone, amber for one that
 * changed.
 *
 * @param letter the letter the code drew as
 * @returns the element's color name
 */
const statusColor = (letter: string): string =>
  letter === 'D'
    ? 'diffRemovedWord'
    : letter === 'A' || letter === '?'
      ? 'diffAddedWord'
      : 'warning'

/**
 * The color an agent's status draws in: green where it finished, red where
 * it did not, and the plain foreground while it is still at work, since a
 * running agent is the row the eye should land on.
 *
 * @param status the status the engine reports
 * @returns the element's color name, or undefined for the plain one
 */
const agentColor = (status: string): string | undefined =>
  isLive(status)
    ? undefined
    : status === 'completed'
      ? 'diffAddedWord'
      : 'diffRemovedWord'

/**
 * The context sparkline, the one drawing that is the terminal's alone: a
 * `Raster` of two rows, one column a turn, fitted to the width it has.
 *
 * @param draw the pane's draw, narrowed to the terminal by this call
 * @param percents the context every finished turn ended on
 * @returns the raster, or null off the terminal and before the first turn
 */
function contextSpark(
  draw: CockpitDraw,
  percents: readonly number[],
): RenderElement | null {
  if (draw.surface !== 'terminal') {
    return null
  }

  const { Raster } = draw.ui
  const line = sparklineOf(percents, Math.min(draw.columns, 64), contextColorAt)

  if (!line) {
    return null
  }

  return (
    <Raster
      key="context-spark"
      columns={line.columns}
      rows={line.rows}
      cells={line.cells}
    />
  )
}

/**
 * One `label  value` line of the Session tab.
 *
 * @param ui the surface's elements
 * @param label the label, padded to a fixed width
 * @param value the value
 * @returns the line
 */
function vital(
  ui: CockpitDraw['ui'],
  label: string,
  value: string,
): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row">
      <Text dimColor>{pad(label, 10)}</Text>
      <Text>{value}</Text>
    </Box>
  )
}

/**
 * The cockpit's four tabs, in rail order.
 *
 * @param deps the state and the arm handler
 * @returns the tabs, ready for `$.cockpit.tab`
 */
export function builtinTabs(deps: TabDeps): readonly CockpitTab[] {
  return [
    sessionTab(deps),
    usageTab(deps),
    statsTab(deps),
    filesTab(deps),
    toolsTab(deps),
    agentsTab(deps),
  ]
}

/**
 * Session: the model, the turns, the context and the cost, over a sparkline
 * of the context every finished turn ended on and the weight of what is in
 * the window now.
 *
 * The plan windows are not here. They are the account's and not the
 * session's, and they are the first thing anyone opening a cockpit about
 * spending looks for: the Usage tab draws them, with the bars they deserve.
 *
 * A finished turn is what fills these, and the first one of a session ends
 * long after the person could have opened the pane on this tab — so looking
 * at it asks for a reading of its own, which marks no column: a column is a
 * turn that ended, and a tab someone looked at is not one.
 *
 * @param deps the state and the vitals refresh
 * @returns the tab
 */
function sessionTab(deps: TabDeps): CockpitTab {
  return {
    id: 'session',
    title: say().titles.session,
    order: 0,
    onShow: () => {
      deps.refreshVitals()
    },
    render: draw => {
      const { Box, Text } = draw.ui
      const { vitals, history } = deps.state()

      const window =
        vitals.tokens === null || vitals.window === null
          ? '—'
          : `${countText(vitals.tokens)} / ${countText(vitals.window)}`

      const line = contextSpark(
        draw,
        history.map(mark => mark.percent),
      )

      const peak = history.reduce((high, mark) => Math.max(high, mark.percent), 0)

      const machine = deps.host()
      const hostRows =
        machine === null ? 0 : (machine.gpu === null ? 3 : 4) + 2

      const categories = [...vitals.categories]
        .sort((a, b) => b.tokens - a.tokens)
        .slice(
          0,
          Math.max(0, Math.min(6, draw.rows - 9 - hostRows)),
        )

      return (
        <Box flexDirection="column">
          {vital(draw.ui, 'Model', vitals.model ?? '—')}
          {vital(draw.ui, 'Turns', vitals.turns === null ? '—' : String(vitals.turns))}
          {vital(draw.ui, 'Context', `${percentText(vitals.percent)}  ${window}`)}
          {vital(draw.ui, 'Cost', usdText(vitals.costUsd))}
          {machine !== null && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>{say().pane.host(msText(machine.readMs))}</Text>
              {vital(draw.ui, 'CPU', percentText(machine.cpuPercent))}
              {vital(
                draw.ui,
                'Memory',
                `${percentText(machine.memPercent)}  ${gbText(machine.memUsedKb)} / ${gbText(machine.memTotalKb)}`,
              )}
              {machine.gpu !== null &&
                vital(
                  draw.ui,
                  'GPU',
                  `${percentText(machine.gpuPercent)}${
                    machine.gpuMemPercent === null
                      ? ''
                      : `  vram ${percentText(machine.gpuMemPercent)}`
                  }`,
                )}
            </Box>
          )}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>{`Context per turn · ${history.length} turns · peak ${percentText(history.length === 0 ? null : peak)}`}</Text>
            {line ?? <Text dimColor>{say().pane.emptyHistory}</Text>}
          </Box>
          {categories.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>In the window now</Text>
              {categories.map(category => (
                <Box key={`cat:${category.name}`} flexDirection="row">
                  <Text color={category.color}>{'██ '}</Text>
                  <Text>{pad(fitText(category.name, draw.columns - 14), draw.columns - 14)}</Text>
                  <Text dimColor>{padLeft(countText(category.tokens), 8)}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    },
  }
}

/**
 * Files: what Claude read and wrote this session, the files it kept coming
 * back to first, with the lines each one moved and what git makes of it now,
 * each row a button that rides the file on the next prompt.
 *
 * The count on the left is what this session did; the letter on the right is
 * what is still there. They answer different questions, and a file that was
 * edited four times and reads as clean is worth seeing at a glance.
 *
 * The button reads `ask` before, `armed` once pressed, and `sent` on the row
 * whose file went with the last prompt: what an armed file adds is a context
 * block, which the person never sees, so this word is the whole of what the
 * cockpit tells them about something it did on their behalf.
 *
 * @param deps the state, the arm handler and the git refresh
 * @returns the tab
 */
function filesTab(deps: TabDeps): CockpitTab {
  return {
    id: 'files',
    title: say().titles.files,
    order: 10,
    onShow: () => {
      deps.refreshGit()
    },
    render: draw => {
      const { Box, Text, Button } = draw.ui
      const { files, armed, sent } = deps.state()

      if (files.length === 0) {
        return <Text dimColor>{say().pane.emptyFiles}</Text>
      }

      const churnCells = files.some(file => file.writes > 0) ? 11 : 0
      const pathCells = Math.max(8, draw.columns - 20 - churnCells)
      const root = deps.root()

      const chosen = pickedOf(deps.picked())
      const shown =
        chosen?.kind === 'file'
          ? (files.find(file => file.path === chosen.id) ?? null)
          : null

      // One row of the body is the button's where there is one to draw, and
      // the card takes its own, so a cut list never hides a file behind the
      // very rows that describe it.
      const isAll = deps.isAll('files')
      const room = Math.max(1, draw.rows - 1 - (shown === null ? 0 : CARD_ROWS))
      const hidden = Math.max(0, files.length - room)

      return (
        <Box flexDirection="column">
          {(isAll ? files : files.slice(0, room)).map(file => {
            const isArmed = armed.includes(file.path)
            const isSent = !isArmed && sent.includes(file.path)
            const letter = letterOf(file.status)
            const churn = churnParts(file.added, file.removed, churnCells - 1)

            const kind = `${file.reads > 0 ? 'r' : ' '}${file.writes > 0 ? 'w' : ' '}`
            const key = pickKey('file', file.path)

            return (
              <Box key={`file:${file.path}`} flexDirection="row" gap={1}>
                <Text dimColor>
                  {`${shown === file ? '›' : ' '}${padLeft(String(file.reads + file.writes), 3)}`}
                </Text>
                <Text color={file.writes > 0 ? 'diffAddedWord' : undefined} dimColor={file.writes === 0}>
                  {kind}
                </Text>
                <Button key={key} plain onPress={() => deps.pick(key)}>
                  {pad(fitPath(relativeOf(file.path, root), pathCells), pathCells)}
                </Button>
                {churnCells > 0 && (
                  // One box, so the row's gap falls between the columns and
                  // not between the two halves of this one.
                  <Box flexDirection="row">
                    <Text>{churn.blank}</Text>
                    <Text color="diffAddedWord">{churn.added}</Text>
                    <Text color="diffRemovedWord">{churn.removed}</Text>
                  </Box>
                )}
                <Text
                  color={letter === null ? undefined : statusColor(letter)}
                  dimColor={letter !== null && !isStaged(file.status)}
                >
                  {letter ?? ' '}
                </Text>
                <Button
                  key={`arm:${file.path}`}
                  plain
                  dimColor={!isArmed && !isSent}
                  onPress={() => deps.arm(file.path)}
                >
                  {isArmed ? 'armed' : isSent ? 'sent ' : 'ask  '}
                </Button>
              </Box>
            )
          })}
          {hidden > 0 && more(draw.ui, 'files', isAll, hidden, deps)}
          {shown !== null && card(draw.ui, fileFields(shown, draw.columns))}
        </Box>
      )
    },
  }
}

/**
 * Tools: every tool this session called, the one it spent the most time in
 * first, and the last calls as they landed.
 *
 * An MCP tool is drawn as its server and its own name; the engine's own
 * `mcp__server__tool` is mostly the prefix every one of them shares, and a
 * column of those cut to fit reads as one tool called over and over.
 *
 * @param deps the state
 * @returns the tab
 */
function toolsTab(deps: TabDeps): CockpitTab {
  return {
    id: 'tools',
    title: say().titles.tools,
    order: 20,
    render: draw => {
      const { Box, Text, Button } = draw.ui
      const { tools, recent } = deps.state()

      if (tools.length === 0) {
        return <Text dimColor>{say().pane.emptyTools}</Text>
      }

      const chosen = pickedOf(deps.picked())
      const tally =
        chosen?.kind === 'tool'
          ? (tools.find(one => one.tool === chosen.id) ?? null)
          : null
      const call =
        chosen?.kind === 'call' ? (recent[Number(chosen.id)] ?? null) : null

      const isAll = deps.isAll('tools')
      const rows = Math.max(
        1,
        draw.rows - 1 - (tally === null && call === null ? 0 : CARD_ROWS),
      )
      const tallyRoom = Math.max(1, Math.min(tools.length, Math.floor(rows / 2)))
      const callRoom = Math.max(0, rows - tallyRoom - 2)
      const detailCells = Math.max(8, draw.columns - 28)

      // The two lists share the body, so what is hidden is what neither of
      // them had room for.
      const hidden =
        Math.max(0, tools.length - tallyRoom) +
        Math.max(0, recent.length - callRoom)

      const tallyRows = isAll ? tools.length : tallyRoom
      const callRows = isAll ? recent.length : callRoom

      return (
        <Box flexDirection="column">
          {tools.slice(0, tallyRows).map(tool => (
            <Box key={`tool:${tool.tool}`} flexDirection="row" gap={1}>
              <Text dimColor>{tally === tool ? '›' : ' '}</Text>
              <Button
                key={pickKey('tool', tool.tool)}
                plain
                onPress={() => deps.pick(pickKey('tool', tool.tool))}
              >
                {pad(toolText(tool.tool, 14), 14)}
              </Button>
              <Text dimColor>{padLeft(String(tool.calls), 4)}</Text>
              <Text dimColor>{padLeft(msText(tool.ms), 8)}</Text>
              {tool.failed > 0 && (
                <Text color="diffRemovedWord">{`${tool.failed} failed`}</Text>
              )}
            </Box>
          ))}
          {callRows > 0 && recent.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Last calls</Text>
              {recent.slice(0, callRows).map((one, index) => (
                <Box key={`call:${index}`} flexDirection="row" gap={1}>
                  <Text color={one.isErrored ? 'diffRemovedWord' : 'diffAddedWord'}>
                    {one.isErrored ? '✗' : '✓'}
                  </Text>
                  <Text>{pad(toolText(one.tool, 10), 10)}</Text>
                  <Button
                    key={pickKey('call', String(index))}
                    plain
                    dimColor
                    onPress={() => deps.pick(pickKey('call', String(index)))}
                  >
                    {pad(fitText(one.detail, detailCells), detailCells)}
                  </Button>
                  <Text dimColor>{padLeft(msText(one.ms), 7)}</Text>
                </Box>
              ))}
            </Box>
          )}
          {hidden > 0 && more(draw.ui, 'tools', isAll, hidden, deps)}
          {tally !== null && card(draw.ui, toolFields(tally))}
          {call !== null && card(draw.ui, callFields(call, draw.columns))}
        </Box>
      )
    },
  }
}

/**
 * Agents: every subagent and teammate this session started, each under the
 * one that spawned it, with how long it has been at it — and the ones that
 * finished kept where they were, with the status they ended on.
 *
 * @param deps the state
 * @returns the tab
 */
function agentsTab(deps: TabDeps): CockpitTab {
  return {
    id: 'agents',
    title: say().titles.agents,
    order: 30,
    render: draw => {
      const { Box, Text } = draw.ui
      const { agents, nowMs } = deps.state()

      if (agents.length === 0) {
        return <Text dimColor>{say().pane.emptyAgents}</Text>
      }

      const running = agents.filter(agent => isLive(agent.status)).length
      const rows = Math.max(1, draw.rows - 2)

      return (
        <Box flexDirection="column">
          <Text dimColor>{say().pane.agentCount(agents.length, running)}</Text>
          {agents.slice(0, rows).map(agent => agentRow(draw, agent, nowMs))}
        </Box>
      )
    },
  }
}

/**
 * One agent's line: its indent under its parent, its status, what it runs as,
 * what it was asked for, and how long that has taken.
 *
 * @param draw the pane's draw
 * @param agent the agent's row
 * @param nowMs the clock the state last read
 * @returns the line
 */
function agentRow(
  draw: CockpitDraw,
  agent: AgentRow,
  nowMs: number,
): RenderElement {
  const { Box, Text } = draw.ui

  const indent = agent.depth === 0 ? '' : `${' '.repeat((agent.depth - 1) * 2)}↳ `
  const elapsed = elapsedOf(agent, nowMs)
  const typeCells = Math.max(6, 16 - indent.length)
  const whatCells = Math.max(8, draw.columns - 20 - typeCells - indent.length)

  return (
    <Box key={`agent:${agent.id}`} flexDirection="row" gap={1}>
      <Text dimColor>{indent}</Text>
      <Text color={agentColor(agent.status)}>
        {pad(fitText(agent.status, 9), 9)}
      </Text>
      <Text>{pad(fitText(agent.name ?? agent.type, typeCells), typeCells)}</Text>
      <Text dimColor>{pad(fitText(agent.description, whatCells), whatCells)}</Text>
      <Text dimColor>{padLeft(elapsed === null ? '—' : msText(elapsed), 7)}</Text>
    </Box>
  )
}
