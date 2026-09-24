/**
 * The session report `/manager report` writes: one Markdown file a person can read later or paste into a pull
 * request — what ran, what was found and by whom, what was decided, what it saved and what the audit cost.
 *
 * Pure: the text and the file name. The register writes the file.
 */

import { say } from '../say'
import { isDetected } from './detect'
import { sinks } from './evidence'
import { totalTokens } from './patterns'
import { duration, kilo, pctOf } from './text'
import type { Pattern, State } from './types'

/**
 * Where a report goes: the project's own `.claude/contextmanager/`, named by the minute it was written, so two
 * reports never share a file and a listing sorts them by date.
 *
 * @param cwd the project
 * @param now the clock, in milliseconds since the epoch
 * @returns the path, forward slashes
 */
export const reportPath = (cwd: string, now: number): string => {
  const iso = new Date(now).toISOString()   // 2026-09-24T11:42:07.000Z
  const stamp = `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`
  return `${cwd.replaceAll('\\', '/').replace(/\/+$/, '')}/.claude/contextmanager/report-${stamp}.md`
}

const patternLine = (p: Pattern): string => {
  const t = say().command
  const decision = p.decision === null ? t.reportUndecided : say().pane.decidedWord[p.decision]
  return `- ${p.kind} — ${p.hits.length}× · ${decision} · ${isDetected(p.id) ? t.reportByCode : t.reportByJudge}`
}

/**
 * The report's Markdown. The saving is stated in time and in context, the audit's cost in tokens: three figures,
 * never one total.
 *
 * @param state the session so far
 * @param now the clock, for the title
 * @returns the file's text
 */
export const reportOf = (state: State, now: number): string => {
  const t = say().command
  const seen = state.patterns.filter(p => p.hits.length > 0 || p.decision !== null)
  const context = sinks(state.rows, 'chars', [], state.folded)
  const total = totalTokens(state)
  const share = total === 0 ? null : Math.round((state.judge.spent / total) * 1000) / 10
  return [
    `# ${t.reportTitle(new Date(now).toISOString().slice(0, 16).replace('T', ' '))}`,
    '',
    t.reportFacts(state.turn, state.rows.length + Object.values(state.folded).reduce((n, f) => n + f.count, 0), state.compactions.length),
    '',
    `## ${t.reportFound}`,
    '',
    ...(seen.length === 0 ? [t.reportNothing] : seen.map(patternLine)),
    '',
    `## ${t.reportSaved}`,
    '',
    `- ${t.reportSavedTime(duration(state.saved.ms))}`,
    `- ${t.reportSavedContext(kilo(state.saved.chars), pctOf(state.saved.chars, state.usage.window))}`,
    '',
    `## ${t.reportAudit}`,
    '',
    `- ${t.reportAuditLine(state.judge.runs, kilo(state.judge.spent), share)}`,
    '',
    `## ${t.reportContext}`,
    '',
    ...(context.total === 0
      ? [t.reportNothing]
      : context.sinks.map(s => `- ${say().pane.sinkNames[s.label] ?? s.label}: ${kilo(s.amount)} (${Math.round((s.amount / context.total) * 100)}%)`)),
    '',
  ].join('\n')
}
