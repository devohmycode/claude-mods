/**
 * The session's facts, one short item each: the model and its effort, the rate-limit windows, what the session
 * cost, the git branch and its diff, the last skill loaded, the Claude Code version, the time, and the machine's
 * load. Each can be turned off in `/config`.
 *
 * Pure: the argv of each probe, the parser of what it prints, and the items the pane draws. The register runs the
 * probes on the plugin's own clock, only while the pane is open.
 */

import type { SessionRateLimit } from 'claude-code'

import { say } from '../say'
import type { Info, InfoKey, State } from './types'

/** `git rev-parse --abbrev-ref HEAD`: the branch, or `HEAD` when detached. */
export const GIT_BRANCH_ARGV: readonly string[] = ['git', 'rev-parse', '--abbrev-ref', 'HEAD']

/** `git diff --numstat HEAD`: lines added and removed in the working tree and the index, against the last commit. */
export const GIT_DIFF_ARGV: readonly string[] = ['git', 'diff', '--numstat', 'HEAD']

/** The Claude Code this session runs, as its own binary says it. */
export const VERSION_ARGV: readonly string[] = ['claude', '--version']

/** Windows: the processors' average load, then total and free physical memory in KiB, on one line. */
export const WINDOWS_ARGV: readonly string[] = [
  'powershell', '-NoProfile', '-NonInteractive', '-Command',
  '$o = Get-CimInstance Win32_OperatingSystem; $c = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average; "$c $($o.TotalVisibleMemorySize) $($o.FreePhysicalMemory)"',
]

/** Linux: the CPU counters and the memory table, read as two files. */
export const LINUX_ARGV: readonly string[] = ['cat', '/proc/stat', '/proc/meminfo']

/** macOS: one sample of `top`, its header only. */
export const MAC_ARGV: readonly string[] = ['top', '-l', '1', '-n', '0']

/** Which probe a machine takes, from `OS` and `uname -s`. */
export type Platform = 'windows' | 'linux' | 'mac' | 'other'

/**
 * The platform, from what the environment and `uname` say.
 *
 * @param os the `OS` variable (`Windows_NT` on Windows)
 * @param uname what `uname -s` printed, or null where it did not run
 * @returns the platform
 */
export const platformOf = (os: string | undefined, uname: string | null): Platform => {
  if (os === 'Windows_NT') return 'windows'
  const name = (uname ?? '').trim()
  if (name === 'Linux') return 'linux'
  if (name === 'Darwin') return 'mac'
  return 'other'
}

/** A reading of the machine: CPU and RAM in percent, and the raw CPU counters Linux needs a second sample of. */
export type SystemReading = { cpu: number | null; ram: number | null; ticks?: { idle: number; total: number } }

const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/**
 * Windows: `<cpu> <total KiB> <free KiB>`.
 *
 * @param stdout what the probe printed
 * @returns the reading, null where the line does not parse
 */
export const parseWindows = (stdout: string): SystemReading | null => {
  const [cpu, total, free] = stdout.trim().split(/\s+/).map(Number)
  if (cpu === undefined || total === undefined || free === undefined || [cpu, total, free].some(n => !Number.isFinite(n)) || total <= 0) return null
  return { cpu: clampPct(cpu), ram: clampPct(((total - free) / total) * 100) }
}

/**
 * Linux: the `cpu` line of /proc/stat and MemTotal/MemAvailable of /proc/meminfo. The CPU share is the busy
 * part of the ticks since the previous reading, so the first reading states the memory alone.
 *
 * @param stdout the two files, one after the other
 * @param previous the counters the last reading kept, if any
 * @returns the reading, with the counters for the next one
 */
export const parseLinux = (stdout: string, previous: { idle: number; total: number } | undefined): SystemReading | null => {
  const cpuLine = stdout.split('\n').find(line => line.startsWith('cpu '))
  const field = (name: string): number | null => {
    const match = new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(stdout)
    return match === null ? null : Number(match[1])
  }
  const total = field('MemTotal')
  const available = field('MemAvailable')
  const ram = total === null || available === null || total <= 0 ? null : clampPct(((total - available) / total) * 100)
  if (cpuLine === undefined) return ram === null ? null : { cpu: null, ram }
  const counts = cpuLine.trim().split(/\s+/).slice(1).map(Number).filter(Number.isFinite)
  const idle = (counts[3] ?? 0) + (counts[4] ?? 0)
  const sum = counts.reduce((n, c) => n + c, 0)
  const ticks = { idle, total: sum }
  const spent = previous === undefined ? 0 : sum - previous.total
  const cpu = previous === undefined || spent <= 0 ? null : clampPct(((spent - (idle - previous.idle)) / spent) * 100)
  return { cpu, ram, ticks }
}

/**
 * macOS: `CPU usage: 5.1% user, 8.3% sys, 86.5% idle` and `PhysMem: 15G used (2G wired), 1G unused.`
 *
 * @param stdout the header `top` printed
 * @returns the reading, null where neither line parses
 */
export const parseMac = (stdout: string): SystemReading | null => {
  const idle = /CPU usage:.*?([\d.]+)% idle/.exec(stdout)
  const mem = /PhysMem:\s*([\d.]+)([KMGT])\s+used.*?([\d.]+)([KMGT])\s+unused/.exec(stdout)
  const bytes = (n: string | undefined, unit: string | undefined): number => Number(n ?? 0) * 1024 ** 'KMGT'.indexOf(unit ?? 'K')
  const cpu = idle === null ? null : clampPct(100 - Number(idle[1]))
  const used = mem === null ? null : bytes(mem[1], mem[2])
  const unused = mem === null ? null : bytes(mem[3], mem[4])
  const ram = used === null || unused === null || used + unused <= 0 ? null : clampPct((used / (used + unused)) * 100)
  return cpu === null && ram === null ? null : { cpu, ram }
}

/**
 * The branch `git rev-parse` printed; null outside a repository or on a detached head, which names no branch.
 *
 * @param stdout what it printed
 * @returns the branch
 */
export const branchOf = (stdout: string): string | null => {
  const branch = stdout.trim()
  return branch === '' || branch === 'HEAD' ? null : branch
}

/**
 * Lines added and removed, summed over `git diff --numstat`; a binary file counts `-` and adds nothing.
 *
 * @param stdout what it printed
 * @returns the two sums
 */
export const diffOf = (stdout: string): { add: number; del: number } =>
  stdout.split('\n').reduce((sum, line) => {
    const [add, del] = line.split('\t')
    return { add: sum.add + (Number(add) || 0), del: sum.del + (Number(del) || 0) }
  }, { add: 0, del: 0 })

/**
 * The version `claude --version` printed: its first word, `2.1.280` in `2.1.280 (Claude Code)`.
 *
 * @param stdout what it printed
 * @returns the version, null where nothing looks like one
 */
export const versionOf = (stdout: string): string | null => /\d+\.\d+\.\d+/.exec(stdout)?.[0] ?? null

/**
 * The two windows the pane names, from what `$.session.usage` reports: the five-hour one with when it resets,
 * and the weekly one.
 *
 * @param limits the session's rate limits
 * @returns the two, each null where the account reports no such window
 */
export const limitsOf = (limits: readonly SessionRateLimit[]): Info['limits'] => {
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  const resets = five?.resetsAt === undefined ? null : Date.parse(five.resetsAt)
  return {
    fiveHour: five === undefined ? null : { percent: five.percentUsed, resetsAt: resets === null || Number.isNaN(resets) ? null : resets },
    week: week === undefined ? null : { percent: week.percentUsed },
  }
}

// A model id as the pane prints it: `claude-opus-4-6` reads `opus-4-6`, which is what a person calls it.
const modelName = (model: string): string => model.replace(/^claude-/, '').replace(/\[1m\]$/, ' 1M')

const two = (n: number): string => `${n}`.padStart(2, '0')

// A window's time left as a clock reads it, `1h36`, or minutes alone under an hour: a five-hour window read
// in minutes (`96m`) makes the person do the division.
const hoursLeft = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours === 0 ? `${minutes}m` : `${hours}h${two(minutes % 60)}`
}

const known = (parts: readonly (string | null)[]): string[] => parts.filter((p): p is string => p !== null)

/** The facts in three rows: the session and its quotas, the machine, the repository. */
export type InfoRows = { session: string[]; machine: string[]; repo: string[] }

/**
 * The items the pane draws, row by row and in a fixed order, each only where it is switched on and known.
 * The quotas go bare — the five-hour share, the time left in that window, the weekly share — since their
 * place in the row says which is which.
 *
 * @param state the session so far
 * @param now the clock, for the time and the window's reset
 * @returns one short string per item, in its row
 */
export const infoParts = (state: State, now: number): InfoRows => {
  const t = say().pane
  const info = state.info
  const on = (key: InfoKey): boolean => state.infoShow[key]
  const model = state.prefix.last?.model ?? info.model
  const effort = state.prefix.last?.effort ?? null
  const five = info.limits.fiveHour
  const date = new Date(now)
  return {
    session: known([
      on('model') && model !== null ? modelName(model) : null,
      on('effort') && effort !== null ? t.infoEffort(effort) : null,
      on('fiveHour') && five !== null ? t.infoPercent(five.percent) : null,
      on('fiveHourReset') && five !== null && five.resetsAt !== null && five.resetsAt > now ? hoursLeft(five.resetsAt - now) : null,
      on('week') && info.limits.week !== null ? t.infoPercent(info.limits.week.percent) : null,
      on('cost') && info.costUsd !== null ? `$${info.costUsd.toFixed(2)}` : null,
      on('skill') && info.skill !== null ? t.infoSkill(info.skill) : null,
    ]),
    machine: known([
      on('clock') && now > 0 ? `${two(date.getDate())}/${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}` : null,
      on('system') && info.system !== null && info.system.cpu !== null ? t.infoCpu(info.system.cpu) : null,
      on('system') && info.system !== null && info.system.ram !== null ? t.infoRam(info.system.ram) : null,
      on('version') && info.version !== null ? `v${info.version}` : null,
    ]),
    repo: known([
      on('branch') && info.git !== null && info.git.branch !== null ? `⎇ ${info.git.branch}` : null,
      on('diff') && info.git !== null ? `+${info.git.add} −${info.git.del}` : null,
    ]),
  }
}
