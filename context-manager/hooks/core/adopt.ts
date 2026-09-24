import type { SessionMessage, ToolCallResult, ToolUseSummary } from 'claude-code'

import { rowOf } from './ledger'
import { RECOVERED_FLAG, ROW_CAP } from './types'
import type { Row } from './types'

// Only a request starts a turn: a user message with no typed text is the tool loop or a message the engine queued itself.
const isPrompt = (m: SessionMessage): boolean =>
  m.role === 'user' && m.text.trim() !== '' && (m.toolResults ?? []).length === 0

// The transcript kept what the call returned; a refusal was stored as its error text, never as a `deny`.
const resultOf = (u: ToolUseSummary): ToolCallResult =>
  u.isError === true ? { isError: true, result: u.result, text: u.text ?? '' } : { result: u.result, text: u.text }

// Appended last, so a flag the call itself earned (`err`, `dedup`) still reads first.
const flagged = (row: Omit<Row, 'seq'>): Omit<Row, 'seq'> => ({ ...row, flags: [...row.flags, RECOVERED_FLAG] })

// The transcript records no duration and no agent: a call this plugin measured before a reload takes its duration
// back, and any other reads 0 ms and says so. The transcript is the main loop's, so `agent` reads `main`.
const rowFrom = (u: ToolUseSummary, turn: number, measured: Readonly<Record<string, number>>): Omit<Row, 'seq'> => {
  const ms = measured[u.tool_use_id]
  const row = rowOf({ ...u.input, tool: u.tool, tool_use_id: u.tool_use_id }, resultOf(u), ms ?? 0, turn)
  return ms === undefined ? flagged(row) : row
}

/**
 * Rebuilds the newest ROW_CAP ledger rows from the transcript, for a session this plugin joined late or that
 * reloaded it.
 *
 * @param messages the transcript
 * @param measured the durations this plugin measured in the session before a reload, by tool_use_id
 * @returns the rows, oldest first
 */
export const adoptRows = (messages: readonly SessionMessage[], measured: Readonly<Record<string, number>> = {}): readonly Omit<Row, 'seq'>[] => {
  const rows: Omit<Row, 'seq'>[] = []
  let prompts = 0
  for (const m of messages) {
    if (isPrompt(m)) prompts += 1
    if (m.role !== 'assistant') continue
    // A call with neither a result nor a text is still in flight: it has no size and no outcome to record.
    const settled = m.toolUses.filter(u => u.result !== undefined || u.text !== undefined)
    for (const u of settled) rows.push(rowFrom(u, Math.max(1, prompts), measured))
  }
  return rows.slice(-ROW_CAP)
}
