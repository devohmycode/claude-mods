import { describe, expect, test } from 'claude-code/testing'

import {
  branchOf, diffOf, infoParts, limitsOf, parseLinux, parseMac, parseWindows, platformOf, versionOf,
} from '../hooks/core/info'
import { reduce } from '../hooks/core/patterns'
import { INFO_KEYS } from '../hooks/core/types'
import type { InfoKey, State } from '../hooks/core/types'
import { managerRun } from './fixtures/register/managerRun'
import { paneRender } from './fixtures/register/paneRender'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'
import { seedState } from './fixtures/patterns/seedState'

const NOW = new Date(2026, 8, 24, 12, 7).getTime()

// Everything known: a step named the model and its effort, and a reading filled in the rest.
const known = (show: Partial<Record<InfoKey, boolean>> = {}): State => {
  const stepped = reduce(seedState(), { type: 'step', model: 'claude-opus-4-6', effort: 'high', cacheCreate: 1_000 })
  const read = reduce(stepped, {
    type: 'info',
    info: {
      limits: { fiveHour: { percent: 42, resetsAt: NOW + (2 * 60 + 13) * 60_000 }, week: { percent: 18 } },
      costUsd: 3.4219, git: { branch: 'main', add: 120, del: 34 }, skill: 'commit', version: '2.1.280',
      system: { cpu: 23, ram: 61 }, at: NOW,
    },
  })
  return { ...read, infoShow: { ...read.infoShow, ...show } }
}

describe('the session row', () => {
  test('every fact in its row and in order, the quotas bare: their place says which window', ($, _on) => {
    expect(infoParts(known(), NOW)).toEqual({
      session: ['opus-4-6', 'effort high', '42%', '2h13', '18%', '$3.42', 'skill commit'],
      machine: ['24/09 12:07', 'CPU 23%', 'RAM 61%', 'v2.1.280'],
      repo: ['⎇ main', '+120 −34'],
    })
  })

  test('a fact switched off in /config is not drawn, and one nothing has read yet is not either', ($, _on) => {
    const off = Object.fromEntries(INFO_KEYS.map(key => [key, false])) as Record<InfoKey, boolean>
    const none = { session: [], machine: [], repo: [] }
    expect(infoParts(known(off), NOW)).toEqual(none)
    expect(infoParts(known({ system: false, clock: false, version: false }), NOW).machine).toEqual([])
    expect(infoParts(seedState(), 0), 'a fresh session knows nothing yet').toEqual(none)
  })

  test('under an hour left the window says minutes; once reset it says nothing; a reset keeps the last reading', ($, _on) => {
    expect(infoParts(known(), NOW + 2 * 3_600_000).session).toContain('13m')
    expect(infoParts(known(), NOW + 3 * 3_600_000).session).not.toContain('2h13')
    expect(reduce(known(), { type: 'reset' }).info.skill).toBe('commit')
  })
})

describe('what the probes print', () => {
  test('the platform comes from OS, then from uname', ($, _on) => {
    expect(platformOf('Windows_NT', null)).toBe('windows')
    expect(platformOf(undefined, 'Linux\n')).toBe('linux')
    expect(platformOf(undefined, 'Darwin')).toBe('mac')
    expect(platformOf(undefined, null)).toBe('other')
  })

  test('Windows: the load, then total and free memory in KiB', ($, _on) => {
    expect(parseWindows('23 16000000 6240000\r\n')).toEqual({ cpu: 23, ram: 61 })
    expect(parseWindows('not a reading')).toBeNull()
  })

  test('Linux: memory at once, the CPU from the ticks between two readings', ($, _on) => {
    const at = (busy: number, idle: number): string => `cpu  ${busy} 0 0 ${idle} 0 0 0 0 0 0\nMemTotal:       16000000 kB\nMemAvailable:    6240000 kB\n`
    const first = parseLinux(at(1_000, 9_000), undefined)
    expect(first).toEqual({ cpu: null, ram: 61, ticks: { idle: 9_000, total: 10_000 } })
    expect(parseLinux(at(1_300, 9_700), first?.ticks)?.cpu, '300 busy of 1000 ticks').toBe(30)
  })

  test('macOS: what top says of the CPU and the memory', ($, _on) => {
    const top = 'Processes: 500 total\nCPU usage: 5.12% user, 8.3% sys, 86.58% idle\nPhysMem: 15G used (2G wired), 1G unused.\n'
    expect(parseMac(top)).toEqual({ cpu: 13, ram: 94 })
  })

  test('git: the branch, none on a detached head, and the sums of the diff', ($, _on) => {
    expect(branchOf('add-context-manager\n')).toBe('add-context-manager')
    expect(branchOf('HEAD\n')).toBeNull()
    expect(diffOf('10\t2\ta.ts\n-\t-\timage.png\n5\t0\tb.ts\n')).toEqual({ add: 15, del: 2 })
  })

  test('the version and the rate-limit windows', ($, _on) => {
    expect(versionOf('2.1.280 (Claude Code)\n')).toBe('2.1.280')
    expect(versionOf('command not found')).toBeNull()
    expect(limitsOf([
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-09-24T14:20:00Z' },
      { kind: 'seven_day', percentUsed: 18 },
    ])).toEqual({ fiveHour: { percent: 42, resetsAt: Date.parse('2026-09-24T14:20:00Z') }, week: { percent: 18 } })
    expect(limitsOf([])).toEqual({ fiveHour: null, week: null })
  })
})

describe('the session row, in a session', () => {
  test('a skill loaded is the skill the row names', async ($, on) => {
    startsManager(on)
    on('skill.prompt', ($, e) => ({ text: e.text }))

    await $.session.start(SESSION)
    await $.skill.prompt({ skill: 'commit', text: 'Write the commit.' })
    await $.command.run(managerRun(''))

    expect(JSON.stringify(await $.ui.render(paneRender()))).toContain('skill commit')
  })
})
