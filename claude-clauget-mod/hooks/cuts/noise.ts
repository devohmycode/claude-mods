/**
 * Noise of a known shape (T39): what a command prints that no one reads —
 * colour codes, a progress bar redrawn a hundred times, the same warning
 * again, the same diagnostic twice in a row, the working directory spelled
 * out in every path.
 *
 * A table of rules, each a test and a replacement, each with its counter:
 * a rule whose counter stays at zero session after session is one to retire,
 * so the table does not become noise itself.
 *
 * The one rule over all the others: no rule touches a line that says
 * `error` or `FAIL`. What a failure printed goes through as it was printed.
 *
 * Pure.
 */

/**
 * One rule: its name, and what it does to one line given the lines kept so
 * far — the line changed, `null` to drop it, or the line itself when the
 * rule does not apply.
 */
export type NoiseRule = {
  name: string
  apply: (line: string, kept: readonly string[], root: string | null) => string | null
}

/**
 * Whether a line is one no rule may touch.
 *
 * @param line the line
 * @returns true when it says `error` (any case) or `FAIL`
 */
export const isProtected = (line: string): boolean => /error/i.test(line) || line.includes('FAIL')

// Built from a character code so the source carries no control character.
const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g')
const PROGRESS = /^\s*(?:\S+\s+)?[[(|]?[=#>█▉▊▋▌▍▎▏░▒▓ .-]{10,}[\])|]?\s*\d{1,3}(?:\.\d+)?\s?%/

/**
 * The table, applied in order to every line.
 */
export const NOISE_RULES: readonly NoiseRule[] = [
  {
    // Colour and cursor codes: meant for a terminal, not for a model.
    name: 'ansi',
    apply: line => line.replace(ANSI, ''),
  },
  {
    // A line redrawn in place: only what the terminal finally showed.
    name: 'carriage',
    apply: line => {
      const cut = line.replace(/\r+$/, '').lastIndexOf('\r')

      return cut < 0 ? line : line.slice(cut + 1)
    },
  },
  {
    // A progress bar: a run of bar characters and a percentage.
    name: 'progress',
    apply: line => (PROGRESS.test(line) ? null : line),
  },
  {
    // The same line twice in a row: a diagnostic repeated, a retry printed.
    name: 'repeat',
    apply: (line, kept) => (line.trim() !== '' && kept.at(-1) === line ? null : line),
  },
  {
    // A deprecation warning already given once in this output.
    name: 'deprecation',
    apply: (line, kept) => (/deprecat/i.test(line) && kept.includes(line) ? null : line),
  },
  {
    // The working directory spelled out: `./` says the same.
    name: 'abspath',
    apply: (line, _kept, root) => (root === null || root === '' ? line : line.split(root).join('.')),
  },
]

/**
 * A text with the table applied, and how often each rule fired.
 *
 * @param text the command's output
 * @param root the working directory, spelled as the output spells it; `null`
 *   leaves paths alone
 * @param rules the table
 * @returns the cleaned text — the same string when no rule fired — and the
 *   counters of the rules that did
 */
export function cleanOf(
  text: string,
  root: string | null,
  rules: readonly NoiseRule[] = NOISE_RULES,
): { text: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const kept: string[] = []

  for (const line of text.split('\n')) {
    if (isProtected(line)) {
      kept.push(line)
      continue
    }

    let current: string | null = line

    for (const rule of rules) {
      if (current === null) {
        break
      }

      const next: string | null = rule.apply(current, kept, root)

      if (next !== current) {
        counts[rule.name] = (counts[rule.name] ?? 0) + 1
      }

      current = next
    }

    if (current !== null) {
      kept.push(current)
    }
  }

  return Object.keys(counts).length === 0 ? { text, counts } : { text: kept.join('\n'), counts }
}
