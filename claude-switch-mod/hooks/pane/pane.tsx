/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The pane's tree: one framed list of models and one of effort levels, a
 * row each, so it holds in a narrow dock. Each model has its color, each
 * level a gauge running cool to hot; the current row carries a filled dot
 * and full strength, the others a hollow one and dim. One line at the foot
 * says what a switch costs.
 */

import type { EngineInterface, RenderElement } from 'claude-code'

import { EFFORTS, EFFORT_COLORS, MODELS, choiceOf, gaugeOf } from '../catalog'
import type { Effort } from '../catalog'
import { TEXTS, effortKey, modelKey } from '../names'

/**
 * The elements of the surface the pane is drawn on.
 */
export type Elements = ReturnType<EngineInterface['ui']['resolve']>

/**
 * The letter that presses each effort's button while the pane has the
 * focus; the models take the digits.
 */
const EFFORT_HOTKEYS: Record<Effort, string> = {
  low: 'l',
  medium: 'm',
  high: 'h',
  xhigh: 'x',
  max: 'a',
}

/** The frame's color where no model is known. */
const NEUTRAL = '#888888'

/** The width labels are padded to, so the taglines and gauges line up. */
const LABEL_WIDTH = 10

/**
 * A row's dot: filled when it names the current value.
 *
 * @param isCurrent whether the row names the current value
 * @returns the dot
 */
export function dotOf(isCurrent: boolean): string {
  return isCurrent ? '●' : '○'
}

/**
 * What the pane draws and what its buttons do.
 */
export type PaneView = {
  /** The session's model id, as the engine last reported it. */
  model: string | undefined
  /** The effort the last request went with, or the one asked for since. */
  effort: Effort | undefined
  /** False when the session has no `/effort`: the mod holds the level itself. */
  hasEffortCommand: boolean
  /** Switches to the model of that key. */
  pickModel: (key: string) => void
  /** Switches to that effort level. */
  pickEffort: (level: Effort) => void
}

/**
 * Draws the pane.
 *
 * @param ui the surface's elements
 * @param view the current values and the two switches
 * @returns the pane's tree
 */
export function drawPane(ui: Elements, view: PaneView): RenderElement {
  const { Box, Button, Text } = ui
  const current = choiceOf(view.model)
  const hasEffort = current?.hasEffort ?? true
  const accent = current?.color ?? NEUTRAL
  const heat = view.effort === undefined ? NEUTRAL : EFFORT_COLORS[view.effort]

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold color={accent}>
          ◆ {TEXTS.models}
        </Text>
        <Text dimColor wrap="truncate-end">
          {view.model ?? TEXTS.unknown}
        </Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        {MODELS.map((one, index) => {
          const isCurrent = one.key === current?.key

          return (
            <Box key={`row:${modelKey(one.key)}`} flexDirection="row" gap={1}>
              <Text color={one.color}>
                {dotOf(isCurrent)}
              </Text>
              <Button
                key={modelKey(one.key)}
                plain
                hotkey={String(index + 1)}
                dimColor={!isCurrent}
                onPress={() => view.pickModel(one.key)}
              >
                {one.label.padEnd(LABEL_WIDTH)}
              </Button>
              <Text color={isCurrent ? one.color : undefined} dimColor={!isCurrent} italic>
                {one.tagline}
              </Text>
            </Box>
          )
        })}
      </Box>

      <Box flexDirection="row" gap={1} marginTop={1}>
        <Text bold color={heat}>
          ⚡ {TEXTS.efforts}
        </Text>
        <Text dimColor>{hasEffort ? view.effort ?? TEXTS.unknown : TEXTS.noEffortShort}</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={hasEffort ? heat : NEUTRAL} borderDimColor={!hasEffort} paddingX={1}>
        {EFFORTS.map(level => {
          const isCurrent = level === view.effort
          const gauge = gaugeOf(level)

          return (
            <Box key={`row:${effortKey(level)}`} flexDirection="row" gap={1}>
              <Text color={EFFORT_COLORS[level]} dimColor={!hasEffort}>
                {dotOf(isCurrent)}
              </Text>
              <Button
                key={effortKey(level)}
                plain
                hotkey={EFFORT_HOTKEYS[level]}
                dimColor={!hasEffort || !isCurrent}
                onPress={() => view.pickEffort(level)}
              >
                {level.padEnd(LABEL_WIDTH)}
              </Button>
              <Text>
                <Text color={EFFORT_COLORS[level]} dimColor={!hasEffort || !isCurrent}>
                  {gauge.filled}
                </Text>
                <Text dimColor>{gauge.empty}</Text>
              </Text>
            </Box>
          )
        })}
      </Box>
      {!hasEffort && <Text dimColor>{TEXTS.noEffort}</Text>}
      {!view.hasEffortCommand && <Text dimColor>{TEXTS.heldEffort}</Text>}

      <Box flexDirection="column" marginTop={1}>
        <Text color="#facc15" dimColor>
          ⚠ {TEXTS.coldCache}
        </Text>
        <Text dimColor>{TEXTS.keys}</Text>
      </Box>
    </Box>
  )
}
