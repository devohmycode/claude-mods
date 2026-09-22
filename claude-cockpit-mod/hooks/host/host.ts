/**
 * What the machine itself is doing, read through the commands the host has:
 * the processor, the memory and the graphics card.
 *
 * Nothing in `$` reports any of this, so every figure here comes from one
 * `$.process.run` whose output this module reads. A host has its own
 * commands, so there is one probe per family and the cockpit keeps the first
 * that answers: a probe that fails once is never run again this session.
 *
 * Pure: an argv and a parser per probe, and the fold of what they read. The
 * register runs them and holds what they found.
 */

/**
 * One reading of the machine, every figure the probes could not give left
 * null rather than zeroed.
 */
export type HostStat = {
  /**
   * How busy the processor is, 0 to 100 over every core.
   */
  cpuPercent: number | null

  /**
   * How much of the physical memory is in use, 0 to 100.
   */
  memPercent: number | null

  /**
   * The memory in use and the memory there is, in kibibytes.
   */
  memUsedKb: number | null
  memTotalKb: number | null

  /**
   * Which graphics probe answered (`nvidia`, `amd`, `amd-sysfs`), or null
   * where none did and no card is drawn.
   */
  gpu: string | null

  /**
   * How busy that card is and how much of its memory is in use, 0 to 100.
   */
  gpuPercent: number | null
  gpuMemPercent: number | null

  /**
   * How long the commands behind this reading took, in milliseconds: the
   * cockpit's own cost, drawn where the figures are.
   */
  readMs: number
}

/**
 * The processor ticks one Linux reading leaves for the next: the figure is a
 * share of the time between two readings, so one reading alone has none.
 */
export type HostSample = {
  idle: number
  total: number
}

/**
 * What a system probe read: the two figures, and the ticks for next time.
 */
export type SystemReading = {
  cpuPercent: number | null
  memUsedKb: number | null
  memTotalKb: number | null
  sample: HostSample | null
}

/**
 * One way of asking a host for its processor and its memory.
 */
export type SystemProbe = {
  /**
   * The family it is for, which is what a test and a report name it by.
   */
  id: 'windows' | 'linux' | 'darwin'

  /**
   * The command, as `$.process.run` takes it: an argv, no shell.
   */
  argv: readonly string[]

  /**
   * Reads what it wrote, or null for output this probe does not recognise —
   * a command that is not the one it meant, or one that answered nothing.
   *
   * @param stdout what the command wrote
   * @param last the ticks the previous reading left, where the probe uses them
   */
  read: (stdout: string, last: HostSample | null) => SystemReading | null
}

/**
 * What a graphics probe read, each figure a share of the card, 0 to 100.
 */
export type GpuReading = {
  percent: number | null
  memPercent: number | null
}

/**
 * One way of asking a host about its graphics card.
 */
export type GpuProbe = {
  id: string
  argv: readonly string[]
  read: (stdout: string) => GpuReading | null
}

/**
 * The numbers a line holds, in the order it wrote them.
 *
 * The empty words a split leaves at either end are dropped rather than read:
 * `Number('')` is 0, and a zero nobody wrote would move every column after
 * it — which is the whole of what these parsers do.
 *
 * @param line the text
 * @returns its numbers, the ones that read as numbers
 */
const numbersOf = (line: string): number[] =>
  line
    .split(/[\s,]+/)
    .filter(word => word !== '')
    .map(word => Number(word))
    .filter(value => Number.isFinite(value))

/**
 * A size as `top` writes one (`15G`, `2451M`) in kibibytes.
 *
 * @param size the digits
 * @param unit the letter after them
 * @returns the size in kibibytes
 */
const kbOf = (size: number, unit: string): number =>
  size * (unit === 'G' ? 1_048_576 : unit === 'M' ? 1_024 : unit === 'T' ? 1_073_741_824 : 1)

/**
 * A percentage held to the range one is in and to one decimal, or null for
 * no reading.
 *
 * A share worked out from ticks lands on 19.999999999999996 as readily as on
 * 20, and the engine reports its own percentages to one decimal; a figure
 * that is compared, drawn and tested is worth rounding once, here.
 *
 * @param percent the figure
 * @returns the figure between 0 and 100, or null
 */
const percentOf = (percent: number | null): number | null =>
  percent === null || !Number.isFinite(percent)
    ? null
    : Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10

/**
 * Windows, through one PowerShell that answers both figures at once: a shell
 * that takes a second and a half to start is a shell to start once.
 *
 * It writes `<busy> <free kB> <total kB>`.
 */
const WINDOWS: SystemProbe = {
  id: 'windows',
  argv: [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$o = Get-CimInstance Win32_OperatingSystem; ' +
      '((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average, ' +
      '$o.FreePhysicalMemory, $o.TotalVisibleMemorySize) -join " "',
  ],
  read: stdout => {
    const [cpu, freeKb, totalKb] = numbersOf(stdout)

    if (freeKb === undefined || totalKb === undefined || totalKb <= 0) {
      return null
    }

    return {
      cpuPercent: percentOf(cpu ?? null),
      memUsedKb: Math.max(0, totalKb - freeKb),
      memTotalKb: totalKb,
      sample: null,
    }
  },
}

/**
 * Linux, through one `cat` of the two files that hold it: the processor's
 * ticks since boot, and what the memory is doing now.
 *
 * The ticks are a total, so the figure is the share of them spent working
 * between two readings — which means the first reading of a session has no
 * processor figure, and the one five seconds later has.
 */
const LINUX: SystemProbe = {
  id: 'linux',
  argv: ['cat', '/proc/stat', '/proc/meminfo'],
  read: (stdout, last) => {
    const lines = stdout.split('\n')
    const cpuLine = lines.find(line => line.startsWith('cpu '))

    if (cpuLine === undefined) {
      return null
    }

    const ticks = numbersOf(cpuLine.slice(4))
    const total = ticks.reduce((sum, tick) => sum + tick, 0)
    const idle = (ticks[3] ?? 0) + (ticks[4] ?? 0)

    const kbOfLine = (name: string): number | null => {
      const line = lines.find(one => one.startsWith(`${name}:`))
      const value = line === undefined ? undefined : numbersOf(line)[0]

      return value === undefined ? null : value
    }

    const totalKb = kbOfLine('MemTotal')
    const availableKb = kbOfLine('MemAvailable')

    const spentTotal = total - (last?.total ?? 0)
    const spentIdle = idle - (last?.idle ?? 0)

    return {
      cpuPercent:
        last === null || spentTotal <= 0
          ? null
          : percentOf(100 * (1 - spentIdle / spentTotal)),
      memUsedKb:
        totalKb === null || availableKb === null
          ? null
          : Math.max(0, totalKb - availableKb),
      memTotalKb: totalKb,
      sample: { idle, total },
    }
  },
}

/**
 * macOS, through one `top` sample, which writes both figures in prose.
 *
 * `powermetrics` is what would say more, and it asks for root; a cockpit tab
 * is not worth a password, so this reads what `top` gives any user.
 */
const DARWIN: SystemProbe = {
  id: 'darwin',
  argv: ['top', '-l', '1', '-n', '0'],
  read: stdout => {
    const idle = /CPU usage:[^\n]*?([\d.]+)%\s+idle/.exec(stdout)
    const mem = /PhysMem:\s+([\d.]+)([KMGT])\s+used[^\n]*?([\d.]+)([KMGT])\s+unused/.exec(
      stdout,
    )

    if (idle === null && mem === null) {
      return null
    }

    const usedKb =
      mem === null ? null : kbOf(Number(mem[1]), String(mem[2] ?? ''))
    const unusedKb =
      mem === null ? null : kbOf(Number(mem[3]), String(mem[4] ?? ''))

    return {
      cpuPercent: idle === null ? null : percentOf(100 - Number(idle[1])),
      memUsedKb: usedKb,
      memTotalKb:
        usedKb === null || unusedKb === null ? null : usedKb + unusedKb,
      sample: null,
    }
  },
}

/**
 * Every system probe, Windows first where the session sits on a Windows
 * path: a probe that is not for this host writes nothing and costs the time
 * it takes to fail, so the likely one goes first and the rest are never run.
 *
 * @param isWindows whether the session's own paths are a Windows host's
 * @returns the probes, in the order to try them
 */
export const systemProbes = (isWindows: boolean): readonly SystemProbe[] =>
  isWindows ? [WINDOWS, LINUX, DARWIN] : [LINUX, DARWIN, WINDOWS]

/**
 * Every graphics probe, in the order to try them: the vendor's own tool
 * first, then what the kernel exposes without one.
 *
 * A machine with no card, or one whose tool is not installed, answers none
 * of them and is drawn without a card rather than with an empty row.
 */
export const GPU_PROBES: readonly GpuProbe[] = [
  {
    id: 'nvidia',
    argv: [
      'nvidia-smi',
      '--query-gpu=utilization.gpu,memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ],
    read: stdout => {
      // One line per card; the first is the one the row draws.
      const [busy, usedMb, totalMb] = numbersOf(stdout.split('\n')[0] ?? '')

      if (busy === undefined) {
        return null
      }

      return {
        percent: percentOf(busy),
        memPercent:
          usedMb === undefined || totalMb === undefined || totalMb <= 0
            ? null
            : percentOf((100 * usedMb) / totalMb),
      }
    },
  },
  {
    id: 'amd',
    argv: ['rocm-smi', '--showuse', '--showmemuse', '--csv'],
    read: stdout => {
      // `device,GPU use (%),GPU Memory Allocated (VRAM%)` and a row per card.
      const row = stdout
        .split('\n')
        .find(line => /^card\d*,/.test(line.trim()))

      if (row === undefined) {
        return null
      }

      const [busy, vram] = numbersOf(row.slice(row.indexOf(',')))

      return busy === undefined
        ? null
        : { percent: percentOf(busy), memPercent: percentOf(vram ?? null) }
    },
  },
  {
    id: 'amd-sysfs',
    argv: ['cat', '/sys/class/drm/card0/device/gpu_busy_percent'],
    read: stdout => {
      const [busy] = numbersOf(stdout)

      return busy === undefined
        ? null
        : { percent: percentOf(busy), memPercent: null }
    },
  },
]

/**
 * One reading of the machine, folded from what the probes read.
 *
 * @param system what the system probe read, or null where none answered
 * @param gpu which graphics probe answered and what it read, or null
 * @param readMs how long the commands took
 * @returns the reading the tab draws
 */
export function hostOf(
  system: SystemReading | null,
  gpu: { id: string; reading: GpuReading } | null,
  readMs: number,
): HostStat {
  const usedKb = system?.memUsedKb ?? null
  const totalKb = system?.memTotalKb ?? null

  return {
    cpuPercent: system?.cpuPercent ?? null,
    memPercent:
      usedKb === null || totalKb === null || totalKb <= 0
        ? null
        : percentOf((100 * usedKb) / totalKb),
    memUsedKb: usedKb,
    memTotalKb: totalKb,
    gpu: gpu?.id ?? null,
    gpuPercent: gpu?.reading.percent ?? null,
    gpuMemPercent: gpu?.reading.memPercent ?? null,
    readMs,
  }
}
