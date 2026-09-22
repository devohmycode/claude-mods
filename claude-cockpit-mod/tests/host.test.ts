import { describe, expect, test, tier } from 'claude-code/testing'

import { GPU_PROBES, hostOf, systemProbes } from '../hooks/host'

tier('user')

/**
 * The probe of a family, by the id it carries.
 *
 * @param id which family
 * @returns its probe
 */
const probe = (id: 'windows' | 'linux' | 'darwin') => {
  const found = systemProbes(true).find(one => one.id === id)

  if (found === undefined) {
    throw new Error(`no ${id} probe`)
  }

  return found
}

/**
 * The graphics probe of a vendor, by the id it carries.
 *
 * @param id which tool
 * @returns its probe
 */
const gpu = (id: string) => {
  const found = GPU_PROBES.find(one => one.id === id)

  if (found === undefined) {
    throw new Error(`no ${id} probe`)
  }

  return found
}

/**
 * What `cat /proc/stat /proc/meminfo` writes on a machine with 16 GiB, cut
 * to the lines the probe reads.
 *
 * @param ticks the processor's ticks: user, nice, system, idle
 * @returns the output
 */
const procOf = (ticks: string): string =>
  `cpu  ${ticks} 0 0 0 0\ncpu0 1 2 3 4 0 0 0 0\nintr 1 2 3\n` +
  'MemTotal:       16777216 kB\nMemFree:         1048576 kB\n' +
  'MemAvailable:    4194304 kB\n'

describe('host', () => {
  test('the likely probe for the host goes first', () => {
    // A probe that is not for this host writes nothing and costs the time it
    // takes to fail, so the session's own paths say which to try first.
    expect(systemProbes(true)[0]?.id).toBe('windows')
    expect(systemProbes(false)[0]?.id).toBe('linux')

    // And all three are there either way: the order is a guess, not a rule.
    expect(systemProbes(false).map(one => one.id).sort()).toEqual([
      'darwin',
      'linux',
      'windows',
    ])
  })

  test('Windows answers both figures in one line', () => {
    const reading = probe('windows').read('23 4194304 16777216\n', null)

    expect(reading?.cpuPercent).toBe(23)
    expect(reading?.memUsedKb).toBe(12_582_912)
    expect(reading?.memTotalKb).toBe(16_777_216)

    // A shell that answered something else is not a reading.
    expect(probe('windows').read('', null)).toBeNull()
    expect(probe('windows').read('Get-CimInstance : not found', null)).toBeNull()
  })

  test('Linux has no processor figure until it has two readings', () => {
    const first = probe('linux').read(procOf('100 0 100 800'), null)

    // The ticks are a total since boot; one reading is not a share of
    // anything, and the tab draws a dash rather than a number it made up.
    expect(first?.cpuPercent).toBeNull()
    expect(first?.memUsedKb).toBe(12_582_912)
    expect(first?.sample).toEqual({ idle: 800, total: 1_000 })

    const second = probe('linux').read(
      procOf('200 0 200 1600'),
      first?.sample ?? null,
    )

    // 1000 ticks passed and 800 of them were idle.
    expect(second?.cpuPercent).toBe(20)

    expect(probe('linux').read('cat: /proc/stat: No such file', null)).toBeNull()
  })

  test('macOS is read off what top writes in prose', () => {
    const top =
      'Processes: 600 total, 2 running\n' +
      'Load Avg: 2.35, 2.10, 1.98\n' +
      'CPU usage: 6.66% user, 13.34% sys, 80.00% idle\n' +
      'PhysMem: 15G used (2451M wired, 1234M compressor), 1024M unused.\n'

    const reading = probe('darwin').read(top, null)

    expect(reading?.cpuPercent).toBe(20)
    expect(reading?.memUsedKb).toBe(15_728_640)
    expect(reading?.memTotalKb).toBe(15_728_640 + 1_048_576)

    expect(probe('darwin').read('top: command not found', null)).toBeNull()
  })

  test('a graphics card is read from whichever tool the host has', () => {
    // One line per card; the first is the one the row draws.
    expect(gpu('nvidia').read('12, 2048, 8192\n30, 4096, 8192\n')).toEqual({
      percent: 12,
      memPercent: 25,
    })

    expect(
      gpu('amd').read(
        'device,GPU use (%),GPU Memory Allocated (VRAM%)\ncard0,44,60\n',
      ),
    ).toEqual({ percent: 44, memPercent: 60 })

    // The kernel's own file says how busy the card is and nothing else.
    expect(gpu('amd-sysfs').read('37\n')).toEqual({
      percent: 37,
      memPercent: null,
    })

    // A tool that is not installed, or one that answered something else.
    expect(gpu('nvidia').read('')).toBeNull()
    expect(gpu('amd').read('ERROR: rocm-smi not found')).toBeNull()
  })

  test('a reading is the share of the memory, and what it cost to take', () => {
    const stat = hostOf(
      {
        cpuPercent: 23,
        memUsedKb: 12_582_912,
        memTotalKb: 16_777_216,
        sample: null,
      },
      { id: 'nvidia', reading: { percent: 12, memPercent: 25 } },
      1_900,
    )

    expect(stat.memPercent).toBe(75)
    expect(stat.gpu).toBe('nvidia')
    expect(stat.gpuPercent).toBe(12)
    expect(stat.readMs).toBe(1_900)

    // A host with no card is drawn without one rather than with empty rows,
    // and a figure no probe gave is null and never zero.
    const bare = hostOf(
      { cpuPercent: null, memUsedKb: null, memTotalKb: null, sample: null },
      null,
      40,
    )

    expect(bare.gpu).toBeNull()
    expect(bare.memPercent).toBeNull()
    expect(bare.cpuPercent).toBeNull()
  })
})
