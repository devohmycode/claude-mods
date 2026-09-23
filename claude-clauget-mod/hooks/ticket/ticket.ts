/**
 * The ticket: the lines the mod writes, and the one rule they all follow.
 *
 * Four units are four columns. Tokens are the engine's own figures, steps and
 * engine calls are counted here, milliseconds are the clock's, and characters
 * are exact. No line adds one to another, and no line carries a total over
 * them — a mod that summed them would be lying in a currency it invented.
 *
 * Where a figure is the engine's, the line says so once, at the end. There is
 * nothing estimated in this version, which is the whole reason the first
 * milestone cuts nothing: `chars/4` would be wrong on exactly the dense JSON
 * a later fiche compresses most.
 *
 * Pure: these functions make strings, and the register decides where a string
 * goes — the transcript as a dim row, or the debug log, never the model.
 */

import type { SessionContextBreakdown, SessionMeasureInput } from 'claude-code'

import { billLines, billOf } from '../bill'
import { causeText, isFault } from '../cache'
import { byteText, countText, modelText, msText, pctText } from '../format'
import type { Ledger, Step, Totals } from '../ledger'
import { prefixOf, totalsOf, turnStepsOf } from '../ledger'
import { DELTA_TYPE, MARK, TEXTS } from '../names'
import type { Inventory } from '../inventory'
import { inventoryOf } from '../inventory'
import type { Instructions } from '../instructions'
import { instructionLines, pathKeyOf } from '../instructions'
import type { CutStats } from '../cuts'
import { cutsLines } from '../cuts'
import type { Policy } from '../policy'
import { deferredKnownOf, frontedKnownOf } from '../policy'
import type { Reminders } from '../reminders'
import type { Spend } from '../spend'
import type { Usage } from '../usage'
import { isSilent } from '../spend'

/**
 * The four counters of one side, in one phrase.
 *
 * @param totals the side
 * @returns `read 640k · wrote 12k · in 3.1k · out 1.8k`
 */
export function tokensText(totals: Totals): string {
  return [
    `${TEXTS.read} ${countText(totals.cacheRead)}`,
    `${TEXTS.wrote} ${countText(totals.cacheWrite)}`,
    `${TEXTS.in} ${countText(totals.input)}`,
    `${TEXTS.out} ${countText(totals.output)}`,
  ].join(' · ')
}

/**
 * One step's line, for the debug log: what it carried, what it produced, and
 * the shape it had.
 *
 * @param step the step
 * @returns the line
 */
export function stepLine(step: Step): string {
  const where = step.agentId === null ? TEXTS.main : `${TEXTS.agents}:${step.agentId}`
  const usage = step.usage

  if (usage === null) {
    return `${MARK} · ${TEXTS.step} ${step.index} (${where}) · no response · ${msText(step.ms)}`
  }

  const shape = step.tools > 0 ? `${step.tools} tool` : step.hasText ? 'text' : 'silent'

  return [
    `${MARK} · ${TEXTS.step} ${step.index} (${where})`,
    modelText(usage.model),
    `${TEXTS.read} ${countText(usage.cacheRead)}`,
    `${TEXTS.wrote} ${countText(usage.cacheWrite)}`,
    `${TEXTS.in} ${countText(usage.input)}`,
    `${TEXTS.out} ${countText(usage.output)}`,
    shape,
    msText(step.ms),
  ].join(' · ')
}

/**
 * The line a cache miss gets: what it cost, what it was, and how long the gap
 * before it was.
 *
 * The cold first request of a loop is not printed as a fault; it is printed
 * as what it is, so that a reader who sees one is not left wondering.
 *
 * @param step the step whose cache was written again
 * @returns the line, or null where the step missed nothing
 */
export function missLine(step: Step): string | null {
  const miss = step.miss

  if (miss === null) {
    return null
  }

  const where = step.agentId === null ? TEXTS.main : `${TEXTS.agents}:${step.agentId}`
  const gap = miss.sinceMs < 0 ? null : `after ${msText(miss.sinceMs)}`
  const share = pctText(miss.tokens, Math.max(1, prefixOf(step.usage)))

  return [
    `${MARK} · ${isFault(miss) ? TEXTS.miss : TEXTS.cold}`,
    `${TEXTS.step} ${step.index} (${where})`,
    causeText(miss.cause),
    `${countText(miss.tokens)} ${TEXTS.wrote} (${share} of the request)`,
    gap,
    miss.detail,
  ]
    .filter((one): one is string => one !== null)
    .join(' · ')
}

/**
 * The turn's line: what this turn's requests cost, read off the engine.
 *
 * @param ledger the journal
 * @param turnId the turn that just ended
 * @returns the line, or null where the turn had no finished request
 */
export function turnLine(ledger: Ledger, turnId: string): string | null {
  const steps = turnStepsOf(ledger, turnId)

  if (steps.length === 0) {
    return null
  }

  const totals = totalsOf(steps)
  const agents = steps.filter(step => step.agentId !== null).length
  const shared = agents === 0 ? null : `${agents} in ${TEXTS.agents}`

  return [
    `${MARK} · ${TEXTS.turn}`,
    `${totals.steps} ${TEXTS.steps}`,
    shared,
    tokensText(totals),
    msText(totals.ms),
    `(${TEXTS.engine})`,
  ]
    .filter((one): one is string => one !== null)
    .join(' · ')
}

/**
 * The mod's own line: what it spent to know the line above.
 *
 * @param spend the column
 * @returns the line
 */
export function spendLine(spend: Spend): string {
  const calls = Object.entries(spend.calls)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`)

  const made = calls.length === 0 ? `0 ${TEXTS.calls}` : calls.join(', ')
  const shown =
    spend.shownChars === 0
      ? TEXTS.silent
      : `${countText(spend.shownChars)} chars ${TEXTS.shown}`

  return [
    `${MARK} · ${TEXTS.spent}`,
    made,
    shown,
    `${countText(spend.dispatches)} ${TEXTS.dispatches}`,
    `(${TEXTS.counted})`,
  ].join(' · ')
}

/**
 * The report: the journal as a person reads it, one line per row, with the
 * two sides apart, the faults listed and the mod's own column at the foot.
 *
 * @param ledger the journal
 * @param spend the mod's own column
 * @returns the lines, in order
 */
export function reportLines(ledger: Ledger, spend: Spend): string[] {
  if (ledger.main.steps === 0 && ledger.agents.steps === 0) {
    return [TEXTS.noSteps, TEXTS.method]
  }

  const faults = ledger.misses.filter(step => isFault(step.miss))

  const lines = [
    `${TEXTS.main} · ${ledger.main.steps} ${TEXTS.steps} · ${tokensText(ledger.main)} · ${msText(ledger.main.ms)}`,
    `${TEXTS.agents} · ${ledger.agents.steps} ${TEXTS.steps} · ${tokensText(ledger.agents)} · ${msText(ledger.agents.ms)}`,
    `${ledger.turns} turns · ${ledger.acks} ${TEXTS.acks} · ${countText(ledger.ackCacheRead)} ${TEXTS.read} by them`,
  ]

  if (faults.length > 0) {
    lines.push(
      `${faults.length} ${TEXTS.miss} · ${countText(
        faults.reduce((sum, step) => sum + (step.miss?.tokens ?? 0), 0),
      )} ${TEXTS.wrote} again`,
    )

    for (const step of faults.slice(-5)) {
      const line = missLine(step)

      if (line !== null) {
        lines.push(line.replace(`${MARK} · `, '  '))
      }
    }
  }

  if (ledger.dropped > 0) {
    lines.push(`${countText(ledger.dropped)} older steps are no longer listed; their figures are in the totals`)
  }

  lines.push(spendLine(spend).replace(`${MARK} · `, ''))

  if (isSilent(spend)) {
    lines.push(TEXTS.method)
  }

  return lines
}

/**
 * The debug log's line for one rewrite the cap made: which tool, and the
 * bytes of the field it shortened, before and after — bytes, measured, and
 * nothing converted into tokens.
 *
 * @param tool the tool the call went to
 * @param before the field's bytes as the engine made it
 * @param after the field's bytes as the model reads it, marker included
 * @returns `clauget · Bash · stdout capped · 84 312 → 4 051 bytes`
 */
export function capLine(tool: string, before: number, after: number): string {
  return `${MARK} · ${tool} · ${TEXTS.capped} · ${byteText(before)} → ${byteText(after)} ${TEXTS.bytes}`
}

/**
 * The live window and the session's cost, as the last `session.measure`
 * carried them: the engine's figures, each in its own unit.
 *
 * @param measured the last measurement, or `null` before the first
 * @returns `clauget · window 42% · 84k of 200k tok · cost $1.23 (engine)`
 */
export function measureLine(measured: SessionMeasureInput | null): string {
  if (measured === null) {
    return `${MARK} · ${TEXTS.measured} · ${TEXTS.noMeasure}`
  }

  const { context, cost } = measured
  const fill =
    context.tokens === undefined
      ? `${countText(context.window)} tok`
      : `${context.percent ?? 0}% · ${countText(context.tokens)} of ${countText(context.window)} tok`

  return [
    `${MARK} · ${TEXTS.measured} ${fill}`,
    cost === undefined ? null : `${TEXTS.cost} $${cost.usd.toFixed(2)}`,
    `(${TEXTS.engine})`,
  ]
    .filter((one): one is string => one !== null)
    .join(' · ')
}

/**
 * The listed tools, counted by provider: the check that every tool the model
 * can call has exactly one, and how many the mod never saw described.
 *
 * @param inventory who provides each tool
 * @param listed the tools' names as `$.tool.list()` answered them
 * @returns `clauget · tools · 42 listed · engine 20 · mcp:linear 18 · ? 4`
 */
export function toolsLine(inventory: Inventory, listed: readonly string[]): string {
  const counts = new Map<string, number>()

  for (const row of inventoryOf(inventory, listed)) {
    counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1)
  }

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([provider, count]) => `${provider} ${count}`)

  return [`${MARK} · ${TEXTS.tools}`, `${listed.length} listed`, ...parts].join(' · ')
}

/**
 * Everything the /clauget report says, in the order it says it.
 */
export type ReportInput = {
  ledger: Ledger
  spend: Spend
  measured: SessionMeasureInput | null
  /**
   * The breakdown the report asked for, or `null` when the engine had none
   * (no session bound, or the call failed): the bill is then left out rather
   * than guessed.
   */
  breakdown: SessionContextBreakdown | null
  detail: 'summary' | 'full'
  inventory: Inventory
  listed: readonly string[]
  usage: Usage
  instructions: Instructions
  /**
   * The prefix the last main request re-read, tokens.
   */
  prefix: number
  /**
   * The levers and what they saw, or `null` to leave them out.
   */
  levers: LeverReport | null
  /**
   * What the cuts did, or `null` to leave them out.
   */
  cuts: CutStats | null
}

/**
 * What the report says of the levers.
 */
export type LeverReport = {
  policy: Policy
  reminders: Reminders
  /**
   * Calls to tools the mod deferred this session, by provider.
   */
  deferredCalls: Readonly<Record<string, number>>
  /**
   * The instruction files the scope left out, by path.
   */
  dropped: readonly string[]
  /**
   * The system prompt's sections as the engine composed them, bytes by name.
   */
  sections: Readonly<Record<string, number>>
  /**
   * The bytes of the mod's own context block, zero when there is none.
   */
  blockBytes: number
}

/**
 * The ticket's line of what the deferral cost back (T21): the reminders the
 * engine injected when the deferred list moved, and the calls that paid a
 * search first. Occurrences and bytes, counted; nothing when both are zero.
 *
 * @param reminders the attachments counted this session
 * @param deferredCalls calls to tools the mod deferred, by provider
 * @returns the line, or `null`
 */
export function leverLine(
  reminders: Reminders,
  deferredCalls: Readonly<Record<string, number>>,
): string | null {
  const delta = reminders.counts[DELTA_TYPE]
  const calls = Object.values(deferredCalls).reduce((sum, one) => sum + one, 0)
  const brief = Object.values(reminders.counts).reduce((sum, one) => sum + one.brief, 0)

  if ((delta?.count ?? 0) === 0 && calls === 0 && brief === 0) {
    return null
  }

  return [
    `${MARK} · ${TEXTS.deferCost}`,
    `${delta?.count ?? 0} ${TEXTS.deltas} (${byteText(delta?.bytes ?? 0)} ${TEXTS.bytes})`,
    `${calls} ${TEXTS.deferredCalls}`,
    `${brief} ${TEXTS.repeats}`,
    `(${TEXTS.counted})`,
  ].join(' · ')
}

/**
 * The report's lines on the levers: what the policy decided at the start and
 * why, what the reminders cost, the system prompt's sections (shown, never
 * removed), and the skill listing's share.
 *
 * @param levers what the levers saw
 * @param breakdown the breakdown, for the skill listing; `null` without one
 * @returns the lines
 */
export function leverLines(levers: LeverReport, breakdown: SessionContextBreakdown | null): string[] {
  const { policy } = levers

  if (!policy.isOn) {
    return [`${MARK} · ${TEXTS.policy} · ${TEXTS.policyOff}`]
  }

  const lines = [
    `${MARK} · ${TEXTS.policy} · on · ${policy.sessions} ${TEXTS.sessions} of history · ${policy.projectSessions} in this project · block ${byteText(levers.blockBytes)} ${TEXTS.bytes}`,
  ]
  const deferred = deferredKnownOf(policy)
  const fronted = frontedKnownOf(policy)

  lines.push(`  ${TEXTS.blockDeferred} · ${deferred.length === 0 ? '-' : deferred.join(', ')}`)
  lines.push(`  ${TEXTS.blockFronted} · ${fronted.length === 0 ? '-' : fronted.join(', ')}`)
  lines.push(`  ${TEXTS.blockAgents} (by hand) · ${policy.agents.hide.join(', ') || '-'}`)
  lines.push(`  ${TEXTS.blockCommands} (by hand) · ${policy.commands.hide.join(', ') || '-'}`)
  lines.push(`  ${TEXTS.blockScoped} · ${levers.dropped.join(', ') || '-'}`)

  const counted = leverLine(levers.reminders, levers.deferredCalls)

  if (counted !== null) {
    lines.push(counted)
  }

  for (const [type, count] of Object.entries(levers.reminders.counts).sort((a, b) => b[1].bytes - a[1].bytes)) {
    lines.push(`  ${type} · ${count.count}× · ${byteText(count.bytes)} ${TEXTS.bytes} · ${count.brief} brief`)
  }

  const sections = Object.entries(levers.sections).sort((a, b) => b[1] - a[1])

  if (sections.length > 0) {
    lines.push(
      `${MARK} · ${TEXTS.sections} · ${sections.map(([name, bytes]) => `${name} ${byteText(bytes)}`).join(' · ')} (${TEXTS.bytes}, shown, never removed)`,
    )
  }

  if (breakdown?.skills !== undefined) {
    const skills = breakdown.skills

    lines.push(
      `  skill listing · ${skills.includedSkills} of ${skills.totalSkills} listed · ${countText(skills.tokens)} ${TEXTS.tokEst} · condensing not opened`,
    )
  }

  return lines
}

/**
 * The report: the journal's lines, the window, the bill with its break-even,
 * the tools by provider and the instruction files.
 *
 * @param input what the report reads
 * @returns the lines, none of which reaches the model
 */
export function commandReportOf(input: ReportInput): string[] {
  const lines = [...reportLines(input.ledger, input.spend), measureLine(input.measured)]

  if (input.breakdown !== null) {
    lines.push(
      ...billLines(
        billOf(input.breakdown, input.inventory),
        input.usage,
        input.detail,
        input.prefix,
        input.ledger.main.steps,
      ),
    )
  }

  lines.push(toolsLine(input.inventory, input.listed))

  const weights: Record<string, number> = {}

  for (const file of input.breakdown?.memoryFiles ?? []) {
    weights[pathKeyOf(file.path)] = file.tokens
  }

  lines.push(...instructionLines(input.instructions, weights))

  if (input.levers !== null) {
    lines.push(...leverLines(input.levers, input.breakdown))
  }

  if (input.cuts !== null) {
    lines.push(...cutsLines(input.cuts))
  }

  return lines
}
