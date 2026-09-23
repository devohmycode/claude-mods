/**
 * The cuts on a tool's result, once the engine has answered (T33, T35, T39,
 * T40): which form of fat each tool has, and the answer the mod gives.
 *
 * Every rewrite that removes content carries the original to file: the
 * register writes it first, and applies the rewrite only once the write went
 * through (T32). A rewrite that only drops noise — colour codes, a progress
 * bar — files nothing: nothing the model could want was removed.
 *
 * Read is not here: its answers depend on what the model has already read,
 * and live in `reads`.
 *
 * Pure.
 */

import type { ToolCallResult } from 'claude-code'

import { bashCutOf, cleanOf, grepCutOf, jsonCutOf, markerOf, reportCutOf } from '../cuts'
import { bytesOf } from '../format'
import { AGENT_BUDGET, CUT_MIN_SHARE, GREP_BUDGET, GREP_PER_FILE, MARK } from '../names'
import { ownAnswerOf } from './call'

/**
 * What the chain works with, beside the call.
 */
export type ChainContext = {
  /**
   * The bytes a Bash output may take, the manifest's cap when it set one.
   */
  bashBudget: number
  /**
   * The Grep lines already shown in this conversation.
   */
  grepSeen: ReadonlySet<string>
  /**
   * The working directory, as outputs spell it; `null` leaves paths alone.
   */
  root: string | null
  /**
   * Where this call's whole result is filed.
   */
  path: string
}

/**
 * What the chain decided for one call.
 */
export type ChainAnswer =
  | { kind: 'kept' }
  | {
      kind: 'rewritten'
      answer: ToolCallResult
      rule: string
      before: number
      after: number
      /**
       * The bytes of the mod's own markers in what the model reads.
       */
      shown: number
      /**
       * The original to file before the rewrite applies, or `null` when the
       * rewrite removed nothing worth keeping.
       */
      filed: string | null
      noise: Readonly<Record<string, number>>
      /**
       * The Grep lines the answer shows, for the next Grep's record.
       */
      grepShown: readonly string[]
    }

const KEPT: ChainAnswer = { kind: 'kept' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A cut, if it is worth making: one that takes away at least `share` of the
 * text. Anything less invites a reread of the whole for a small saving.
 *
 * @param cut the cut a shape proposed, or `null`
 * @param share the least share it must take away
 * @returns the cut, or `null` to leave the text as it came
 */
export function worthOf<C extends { before: number; after: number }>(
  cut: C | null,
  share: number = CUT_MIN_SHARE,
): C | null {
  return cut !== null && cut.after <= cut.before * (1 - share) ? cut : null
}

/**
 * The bytes of the mod's markers in a text.
 *
 * @param text the text the model reads
 * @returns the bytes of its `[clauget: …]` lines
 */
export function markerBytesOf(text: string): number {
  return text
    .split('\n')
    .filter(line => line.startsWith(`[${MARK}:`))
    .reduce((sum, line) => sum + bytesOf(line), 0)
}

/**
 * The answer for one call under the cuts.
 *
 * @param tool the tool called
 * @param got what the engine answered
 * @param context the budgets, the Grep record, the working directory and
 *   where the whole is filed
 * @returns the decision
 */
export function chainOf(tool: string, got: ToolCallResult, context: ChainContext): ChainAnswer {
  if (got.deny !== undefined || got.isError === true) {
    return KEPT
  }

  const record = got.result

  // An output the engine already put aside is read by the model as the
  // engine's own preview and path, not as `stdout`: cutting `stdout` then
  // changes nothing the model reads, and files a copy for nothing. Measured
  // on 2.1.280 with a 245 kB `git log -p`.
  if (tool === 'Bash' && isRecord(record) && record.persistedOutputPath !== undefined) {
    return KEPT
  }

  if (tool === 'Bash' && isRecord(record) && typeof record.stdout === 'string') {
    const stdout = cleanOf(record.stdout, context.root)
    const stderr = typeof record.stderr === 'string' ? cleanOf(record.stderr, context.root) : null
    const cut = worthOf(bashCutOf(stdout.text, context.bashBudget, context.path))
    const text = cut?.text ?? stdout.text
    const noise: Record<string, number> = { ...stdout.counts }

    for (const [rule, count] of Object.entries(stderr?.counts ?? {})) {
      noise[rule] = (noise[rule] ?? 0) + count
    }

    if (cut === null && Object.keys(noise).length === 0) {
      return KEPT
    }

    const before = bytesOf(record.stdout) + bytesOf(typeof record.stderr === 'string' ? record.stderr : '')
    const after = bytesOf(text) + bytesOf(stderr?.text ?? '')

    return {
      kind: 'rewritten',
      answer: ownAnswerOf({ ...record, stdout: text, ...(stderr === null ? {} : { stderr: stderr.text }) }, got.context),
      rule: cut === null ? 'noise' : 'bash',
      before,
      after,
      shown: markerBytesOf(text),
      filed: cut === null ? null : record.stdout,
      noise,
      grepShown: [],
    }
  }

  if (tool === 'Grep' && isRecord(record) && typeof record.content === 'string') {
    const cut = worthOf(grepCutOf(record.content, context.grepSeen, GREP_BUDGET, GREP_PER_FILE, context.path))

    if (cut === null) {
      return KEPT
    }

    return {
      kind: 'rewritten',
      answer: ownAnswerOf({ ...record, content: cut.text, numLines: cut.shown.length }, got.context),
      rule: 'grep',
      before: cut.before,
      after: cut.after,
      shown: markerBytesOf(cut.text),
      filed: record.content,
      noise: {},
      grepShown: cut.shown,
    }
  }

  if (tool === 'Agent' && isRecord(record) && Array.isArray(record.content)) {
    const whole = record.content
      .filter((block): block is { type: 'text'; text: string } => isRecord(block) && typeof block.text === 'string')
      .map(block => block.text)
      .join('\n\n')
    const cut = worthOf(reportCutOf(whole, AGENT_BUDGET, context.path))

    if (cut === null) {
      return KEPT
    }

    return {
      kind: 'rewritten',
      answer: ownAnswerOf({ ...record, content: [{ type: 'text', text: cut.text }] }, got.context),
      rule: 'report',
      before: cut.before,
      after: cut.after,
      shown: markerBytesOf(cut.text),
      filed: whole,
      noise: {},
      grepShown: [],
    }
  }

  if (tool.startsWith('mcp__')) {
    return mcpOf(got, record, context.path)
  }

  return KEPT
}

/**
 * An MCP tool's result on the JSON diet (T35): its text, or each of its text
 * blocks, when it holds JSON over the thresholds. Every other part of the
 * result stays as it came.
 *
 * @param got what the engine answered
 * @param record its `result`
 * @param path where the whole is filed
 * @returns the decision
 */
function mcpOf(got: ToolCallResult, record: unknown, path: string): ChainAnswer {
  const originals: string[] = []
  let before = 0
  let after = 0

  const diet = (text: string): string => {
    const cut = worthOf(jsonCutOf(text))

    if (cut === null) {
      return text
    }

    originals.push(text)
    before += cut.before
    after += cut.after

    return cut.text
  }

  const blocks = (list: readonly unknown[]): unknown[] =>
    list.map(block =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? { ...block, text: diet(block.text) }
        : block,
    )

  let result: unknown

  if (typeof record === 'string') {
    result = diet(record)
  } else if (Array.isArray(record)) {
    result = blocks(record)
  } else if (isRecord(record) && Array.isArray(record.content)) {
    result = { ...record, content: blocks(record.content) }
  } else {
    return KEPT
  }

  if (originals.length === 0) {
    return KEPT
  }

  // The diet says in place how many items and characters went; where the
  // whole is filed goes in the note after the result.
  const note = markerOf([], path)

  return {
    kind: 'rewritten',
    answer: ownAnswerOf(result, [...(got.context ?? []), note]),
    rule: 'json',
    before,
    after,
    shown: bytesOf(note),
    filed: originals.join('\n\n'),
    noise: {},
    grepShown: [],
  }
}
