/**
 * What the pane offers: the models a click switches to, the effort levels,
 * and how a model id the engine reports maps back to one of them. Pure, so
 * the tests reach it without an engine.
 */

/**
 * One model the pane offers.
 */
export type ModelChoice = {
  /** The pane's key for it, and the family its ids carry. */
  key: string
  /** The name the button shows. */
  label: string
  /** What `/model` is run with: an alias, or a full id where none exists. */
  arg: string
  /** False for a model that takes no effort setting. */
  hasEffort: boolean
  /** The color its row, its dot and its notification are drawn in. */
  color: string
  /** A few words on what it is for, drawn dim beside it. */
  tagline: string
}

/**
 * The models, strongest first. An alias follows the latest of its family;
 * Fable has none, so it is named by its id.
 */
export const MODELS: readonly ModelChoice[] = [
  { key: 'fable', label: 'Fable 5.1', arg: 'claude-fable-5-1', hasEffort: true, color: '#c084fc', tagline: 'le plus fort' },
  { key: 'opus', label: 'Opus', arg: 'opus', hasEffort: true, color: '#d97757', tagline: 'profond' },
  { key: 'sonnet', label: 'Sonnet', arg: 'sonnet', hasEffort: true, color: '#60a5fa', tagline: 'équilibré' },
  { key: 'haiku', label: 'Haiku', arg: 'haiku', hasEffort: false, color: '#34d399', tagline: 'rapide' },
]

/**
 * The effort levels, lowest first, as `/effort` and `turn.step` spell them.
 */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * One effort level.
 */
export type Effort = (typeof EFFORTS)[number]

/**
 * The color of each effort level, cool to hot.
 */
export const EFFORT_COLORS: Record<Effort, string> = {
  low: '#6ee7b7',
  medium: '#a3e635',
  high: '#facc15',
  xhigh: '#fb923c',
  max: '#f87171',
}

/**
 * A level drawn as a gauge of five cells, as many filled as its rank.
 *
 * @param level the effort level
 * @returns the filled part and the empty part, drawn in two colors
 */
export function gaugeOf(level: Effort): { filled: string; empty: string } {
  const rank = EFFORTS.indexOf(level) + 1

  return { filled: '▰'.repeat(rank), empty: '▱'.repeat(EFFORTS.length - rank) }
}

/**
 * The notification a switch shows: what it was, what it is now.
 *
 * @param kind which setting switched
 * @param before the value before, as the pane names it, or undefined
 * @param after the value now
 * @returns the line of the toast
 */
export function switchedText(kind: 'model' | 'effort', before: string | undefined, after: string): string {
  const icon = kind === 'model' ? '⇄' : '⚡'
  const name = kind === 'model' ? 'Modèle' : 'Effort'

  if (before === after) {
    return `${icon} ${name} déjà sur ${after}`
  }

  return before === undefined ? `${icon} ${name} → ${after}` : `${icon} ${name} ${before} → ${after}`
}

/**
 * The offered model a model id belongs to, by the family its id names.
 *
 * @param model an id or alias as the engine reports it (`claude-opus-5-5`)
 * @returns the choice, or undefined for a model the pane does not offer
 */
export function choiceOf(model: string | undefined): ModelChoice | undefined {
  const id = (model ?? '').toLowerCase()

  return MODELS.find(one => id.includes(one.key))
}

/**
 * A value read as an effort level.
 *
 * @param value what a step or a setting carries (a level, a number, nothing)
 * @returns the level, or undefined for a number or anything else
 */
export function effortOf(value: unknown): Effort | undefined {
  return EFFORTS.find(level => level === value)
}

/**
 * What `/switch <args>` names: a model, an effort level, or neither.
 *
 * @param args the command's argument, case and spaces ignored
 * @returns the model or the level it names, or undefined
 */
export function pickOf(
  args: string,
): { model: ModelChoice } | { effort: Effort } | undefined {
  const word = args.trim().toLowerCase()

  if (word === '') {
    return undefined
  }

  const model = MODELS.find(one => one.key === word || one.arg === word)

  if (model !== undefined) {
    return { model }
  }

  const effort = effortOf(word)

  return effort === undefined ? undefined : { effort }
}
