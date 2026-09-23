/**
 * The instruction files: which ones the conversation carries, and the
 * paragraphs two of them say word for word.
 *
 * `prompt.context` hands the files behind `claudeMd` in the order they
 * render, `@` imports included. A paragraph repeated between the profile and
 * the repository is paid at every request of every session, twice. The mod
 * says so and touches nothing: an instruction file belongs to the person.
 *
 * Paragraphs are compared by a hash of their text with every run of spaces
 * folded into one — the same paragraph re-wrapped is the same paragraph; one
 * word apart, it is another.
 *
 * Pure.
 */

import { DUPLICATE_MIN_CHARS, MARK, TEXTS } from '../names'

/**
 * One file as the mod keeps it: where, which tier, and whose import brought
 * it — never its text, which the store has no business holding.
 */
export type InstructionPlace = {
  path: string
  kind: string
  parent?: string
}

/**
 * A paragraph found in more than one place.
 */
export type Duplicate = {
  hash: string
  /**
   * Its opening words, for the report.
   */
  excerpt: string
  /**
   * Its length in characters, spaces folded.
   */
  chars: number
  /**
   * Every place it was found, in the files' order; the same path twice when
   * one file repeats it.
   */
  places: readonly string[]
}

/**
 * What the mod keeps of the instruction files.
 */
export type Instructions = {
  files: readonly InstructionPlace[]
  duplicates: readonly Duplicate[]
}

export const NO_INSTRUCTIONS: Instructions = { files: [], duplicates: [] }

/**
 * A text with every run of whitespace folded into one space, trimmed.
 *
 * @param text the text
 * @returns the folded text
 */
export const foldedOf = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * FNV-1a over a text's UTF-16 units: short, stable and enough to tell two
 * paragraphs apart. Not a security hash, and nothing here needs one.
 *
 * @param text the text
 * @returns eight hex digits
 */
export function hashOf(text: string): string {
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/**
 * A file's paragraphs, folded, the short ones left out.
 *
 * @param content the file's text as loaded
 * @param minChars the shortest paragraph worth comparing
 * @returns the folded paragraphs, in order
 */
export function paragraphsOf(content: string, minChars: number = DUPLICATE_MIN_CHARS): string[] {
  return content
    .split(/\r?\n[ \t]*\r?\n/)
    .map(foldedOf)
    .filter(paragraph => paragraph.length >= minChars)
}

/**
 * The instruction files, and the paragraphs found in more than one place.
 *
 * @param files the files as `prompt.context` handed them
 * @param minChars the shortest paragraph worth comparing
 * @returns what the mod keeps
 */
export function instructionsOf(
  files: readonly { path: string; kind: string; content: string; parent?: string }[],
  minChars: number = DUPLICATE_MIN_CHARS,
): Instructions {
  const found = new Map<string, { text: string; places: string[] }>()

  for (const file of files) {
    for (const paragraph of paragraphsOf(file.content, minChars)) {
      const hash = hashOf(paragraph)
      const one = found.get(hash) ?? { text: paragraph, places: [] }

      one.places.push(file.path)
      found.set(hash, one)
    }
  }

  const duplicates = [...found.entries()]
    .filter(([, one]) => one.places.length > 1)
    .map(([hash, one]) => ({
      hash,
      excerpt: one.text.length <= 60 ? one.text : `${one.text.slice(0, 59)}…`,
      chars: one.text.length,
      places: one.places,
    }))

  return {
    files: files.map(file =>
      file.parent === undefined
        ? { path: file.path, kind: file.kind }
        : { path: file.path, kind: file.kind, parent: file.parent },
    ),
    duplicates,
  }
}

/**
 * What the store held, read back; anything else reads as nothing seen.
 *
 * @param value the stored value
 * @returns the instructions
 */
export function instructionsFrom(value: unknown): Instructions {
  const v = value as Partial<Instructions> | null

  if (v === null || typeof v !== 'object' || !Array.isArray(v.files) || !Array.isArray(v.duplicates)) {
    return NO_INSTRUCTIONS
  }

  return {
    files: v.files.filter(
      (f): f is InstructionPlace => typeof f?.path === 'string' && typeof f.kind === 'string',
    ),
    duplicates: v.duplicates.filter(
      (d): d is Duplicate => typeof d?.hash === 'string' && Array.isArray(d.places),
    ),
  }
}

/**
 * A path as a key both the breakdown and `prompt.context` spellings reach:
 * forward slashes, and case folded, since the machines this runs on include
 * one whose paths ignore it.
 *
 * @param path the path
 * @returns the key
 */
export const pathKeyOf = (path: string): string => path.replace(/\\/g, '/').toLowerCase()

/**
 * The report's lines on the instruction files: each file with its weight
 * where the breakdown gave one, then each duplicate.
 *
 * @param instructions what the mod kept
 * @param weights estimated tokens by `pathKeyOf` the path, from the
 *   breakdown's `memoryFiles`
 * @returns the lines
 */
export function instructionLines(
  instructions: Instructions,
  weights: Readonly<Record<string, number>>,
): string[] {
  if (instructions.files.length === 0) {
    return [`${MARK} · ${TEXTS.instructions} · ${TEXTS.noInstructions}`]
  }

  const lines = [
    `${MARK} · ${TEXTS.instructions} · ${instructions.files.length} ${TEXTS.files} · ${instructions.duplicates.length} ${TEXTS.duplicates}`,
  ]

  for (const file of instructions.files) {
    const weight = weights[pathKeyOf(file.path)]

    lines.push(
      [
        `  ${file.kind}`,
        file.path,
        weight === undefined ? null : `${weight} ${TEXTS.tokEst}`,
        file.parent === undefined ? null : `${TEXTS.importedBy} ${file.parent}`,
      ]
        .filter((one): one is string => one !== null)
        .join(' · '),
    )
  }

  for (const duplicate of instructions.duplicates) {
    lines.push(`  ${TEXTS.twice} «${duplicate.excerpt}» · ${duplicate.chars} chars · ${duplicate.places.join(' + ')}`)
  }

  return lines
}
