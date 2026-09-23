/**
 * The steps: a step avoided is a whole prefix not re-read (T43–T49).
 *
 * The split into steps belongs to the model. A mod can inform it, bound it,
 * or move a search onto a smaller prefix — it cannot fold two requests into
 * one. So every lever here is a nudge or a bound, and each keeps two columns:
 * what it saved, and what it cost.
 *
 * - The explorer (T43): a subagent with read-only tools, no MCP server, no
 *   skill, no CLAUDE.md and a small model — its steps re-read a few thousand
 *   tokens where the main thread's re-read a hundred thousand.
 * - The detour (T44): on an open-ended search, the explorer is proposed —
 *   once a session, never forced: a one-step search loses by it.
 * - The smaller model (T45): a subagent has its own prefix, so routing it to
 *   a smaller model costs no cache; only the types listed, never one whose
 *   caller named a model.
 * - The loop guard (T46): two outputs identical byte for byte, whatever the
 *   commands looked like, are a loop; the mod says so, it forbids nothing.
 * - The effort (T47): after a mechanical step — tool calls and no text — one
 *   notch lower, never two, never on the first step, never in a subagent.
 *   Written, tested, and not applied: measured on 2.1.280, the first change
 *   of effort in a turn made the provider drop its cached messages (75 897
 *   tokens written again at one step) for output tokens that did not move.
 * - The switch guard (T48): a model switch that would rewrite a warm cache
 *   above a threshold asks first.
 * - The circuit breaker (T49): a turn that runs past twice its median length,
 *   and never fewer than thirty steps, is stopped between two steps.
 *
 * Pure.
 */

import { bytesOf } from '../format'
import { hashOf } from '../instructions'
import {
  BREAKER_MEDIAN_FACTOR,
  BREAKER_MIN_STEPS,
  LOOP_MIN_BYTES,
  MARK,
  SWITCH_ASK_USD,
  TEXTS,
} from '../names'

/**
 * Whether a call is an open-ended search the explorer would take on (T44):
 * a Grep with no path or the whole tree, a Glob over `**`, a command that
 * walks the tree. Nothing else.
 *
 * @param tool the tool called
 * @param input the call's arguments
 * @returns true for such a search
 */
export function isExploration(tool: string, input: Readonly<Record<string, unknown>>): boolean {
  if (tool === 'Grep') {
    const path = typeof input.path === 'string' ? input.path.trim() : ''

    return path === '' || path === '.' || path === './'
  }

  if (tool === 'Glob') {
    return typeof input.pattern === 'string' && input.pattern.includes('**')
  }

  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command.trim() : ''

    return /^(?:tree\b|find\s+\.(?:\s|$)|ls\s+-[a-zA-Z]*R)/.test(command)
  }

  return false
}

/**
 * The model the smaller-model rule gives a spawn (T45), or `null` to leave it.
 *
 * @param spawn the spawn: its type, the model its caller named, whether it
 *   is a fork
 * @param types the types the rule applies to
 * @param model the smaller model
 * @returns the model to set, or `null`
 */
export function spawnModelOf(
  spawn: { subagentType: string; model?: string; fork: boolean },
  types: readonly string[],
  model: string,
): string | null {
  if (spawn.fork || spawn.model !== undefined || !types.includes(spawn.subagentType)) {
    return null
  }

  return model
}

/**
 * The outputs of a turn's calls, by hash, with the steps they came at.
 */
export type Outputs = Readonly<Record<string, readonly number[]>>

/**
 * The loop guard's note for one output (T46), and the record after it.
 *
 * @param outputs the turn's outputs so far
 * @param text the output, as the model reads it
 * @param step the step the call came at
 * @returns the note — naming the earlier steps with the same output — or
 *   `null`, and the record
 */
export function loopNoteOf(
  outputs: Outputs,
  text: string,
  step: number,
): { note: string | null; outputs: Outputs } {
  if (bytesOf(text) < LOOP_MIN_BYTES) {
    return { note: null, outputs }
  }

  const hash = hashOf(text)
  const earlier = (outputs[hash] ?? []).filter(one => one !== step)
  const next = { ...outputs, [hash]: [...earlier, step] }

  if (earlier.length === 0) {
    return { note: null, outputs: next }
  }

  const which = earlier.length === 1 ? `${TEXTS.sameOutput} ${earlier[0]}` : `${TEXTS.sameOutputs} ${earlier.join(' and ')}`

  return { note: `${MARK} · ${which}: ${TEXTS.loopAdvice}.`, outputs: next }
}

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * The effort one notch below (T47).
 *
 * @param effort the effort the step asks for
 * @returns the level below, or `null` for `low`, a number, or none
 */
export function effortBelow(effort: unknown): (typeof LEVELS)[number] | null {
  const at = LEVELS.indexOf(effort as (typeof LEVELS)[number])

  return at <= 0 ? null : (LEVELS[at - 1] ?? null)
}

/**
 * Whether a step's effort goes one notch lower (T47): the step before it in
 * the same turn produced tool calls and no text — a mechanical step — and
 * this is neither the first step nor a subagent's.
 *
 * @param step the step: its index, its loop, its effort
 * @param previous the step before it in the same turn, or `null`
 * @returns the effort to ask for, or `null` to leave it
 */
export function loweredEffortOf(
  step: { index: number; agentId?: string; effort?: unknown },
  previous: { tools: number; hasText: boolean } | null,
): (typeof LEVELS)[number] | null {
  if (step.index === 0 || step.agentId !== undefined || previous === null) {
    return null
  }

  return previous.tools > 0 && !previous.hasText ? effortBelow(step.effort) : null
}

/**
 * The circuit breaker's ceiling (T49): twice the median turn, never fewer
 * than the minimum.
 *
 * @param stepsPerTurn the main loop's steps of each finished turn
 * @returns the ceiling, in steps
 */
export function breakerCapOf(stepsPerTurn: readonly number[]): number {
  const sorted = [...stepsPerTurn].sort((a, b) => a - b)
  const median = sorted.length === 0 ? 0 : (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0)

  return Math.max(BREAKER_MIN_STEPS, Math.ceil(median * BREAKER_MEDIAN_FACTOR))
}

/**
 * Whether the breaker stops a turn before this step.
 *
 * @param step the step about to be requested: its index and loop
 * @param cap the ceiling
 * @param hasBroken whether the breaker already stopped this turn
 * @returns true to stop it
 */
export function isBreaking(step: { index: number; agentId?: string }, cap: number, hasBroken: boolean): boolean {
  return !hasBroken && step.agentId === undefined && step.index >= Math.max(cap, BREAKER_MIN_STEPS)
}

/**
 * Whether a model switch asks first (T48): the cache is warm and rewriting
 * it on the new model is estimated above the threshold.
 *
 * @param e the switch, as `classic.PreModelSwitch` carries it
 * @param threshold the dollars above which the switch asks
 * @returns the reason to show, or `null` to let it through
 */
export function switchAskOf(
  e: { prompt_cache_warm: boolean; estimated_cache_write_usd: number; context_tokens: number; source: string },
  threshold: number = SWITCH_ASK_USD,
): string | null {
  if (!e.prompt_cache_warm || e.source === 'sdk' || !(e.estimated_cache_write_usd > threshold)) {
    return null
  }

  return `${TEXTS.switchAsk}: about ${e.context_tokens} tokens, estimated $${e.estimated_cache_write_usd.toFixed(2)} (${MARK}).`
}

/**
 * What the step levers did this session: each with what it saved and what it
 * cost, in the unit it is counted in.
 */
export type StepStats = {
  /**
   * Explorer runs, and the tokens its steps read from the cache, by step
   * position: the prefix it re-reads, the figure T43 is judged by.
   */
  explorerRuns: number
  explorerReads: readonly number[]
  /**
   * Proposals of the explorer, and their bytes shown to the model.
   */
  proposals: number
  proposalBytes: number
  /**
   * Spawns moved to the smaller model.
   */
  rerouted: number
  /**
   * Loops flagged, and the bytes of the notes.
   */
  loops: number
  loopBytes: number
  /**
   * Switches asked about, and turns stopped.
   */
  asked: number
  broken: number
}

export const NO_STEP_STATS: StepStats = {
  explorerRuns: 0,
  explorerReads: [],
  proposals: 0,
  proposalBytes: 0,
  rerouted: 0,
  loops: 0,
  loopBytes: 0,
  asked: 0,
  broken: 0,
}

/**
 * The report's lines of the step levers: each with its two columns.
 *
 * @param stats the record
 * @param mainRead the main thread's average cache read per step, tokens
 * @returns the lines
 */
export function stepLines(stats: StepStats, mainRead: number): string[] {
  const reads = stats.explorerReads
  const explorerRead = reads.length === 0 ? 0 : Math.round(reads.reduce((sum, one) => sum + one, 0) / reads.length)

  return [
    `${MARK} · ${TEXTS.stepsLine}`,
    `  explorer · ${stats.explorerRuns} runs · ${reads.length} steps reading ${explorerRead} tok each from the cache, against ${Math.round(mainRead)} for a main step (engine) · proposed ${stats.proposals}× (${stats.proposalBytes} bytes shown)`,
    `  smaller model · ${stats.rerouted} subagents moved (counted)`,
    `  loop guard · ${stats.loops} loops named (${stats.loopBytes} bytes shown)`,
    `  effort · not applied: a change of effort mid-turn made the provider rewrite its cached messages`,
    `  model switch · ${stats.asked} switches asked about · breaker · ${stats.broken} turns stopped`,
  ]
}
