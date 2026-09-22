/**
 * Which language the cockpit speaks.
 *
 * ## Adding one
 *
 * Three lines, and nothing else in the plugin has to know:
 *
 * 1. `hooks/say/<tag>.ts` — `export const XX: PartialTexts = { … }`, the keys
 *    you have translated and no others. `en.ts` is the shape and the
 *    fallback: a key you leave out is drawn in English, a key you misspell is
 *    a compile error.
 * 2. One entry in `LANGUAGES` below.
 * 3. One string in the manifest's `language` options, so `/config` offers it.
 *    That third line is the one duplication, and it is unavoidable: a
 *    `config.describe` hook may rewrite a row's label and help but neither
 *    its kind nor its options, so the menu's list has to be declared.
 *
 * ## Reading it
 *
 * `sayOf` is pure and is where the rules are. The holder under it exists
 * because every drawing would otherwise have to carry the bundle down
 * through `TabDeps`, `PaneKit` and each view's parameters — a language is
 * settled once, before anything is drawn, and never changes for the life of
 * a module: writing the `/config` row reloads the module, which sets it
 * again from the new option.
 */

import { EN } from './en'
import type { PartialTexts, Texts } from './en'
import { FR } from './fr'

/**
 * Every language the cockpit has, by the tag `/config` offers.
 */
export const LANGUAGES: Readonly<Record<string, PartialTexts>> = {
  en: {},
  fr: FR,
}

/**
 * The tag a session falls back to, and the one complete bundle.
 */
export const DEFAULT_LANGUAGE = 'en'

/**
 * The tags there are, in the order they were added.
 */
export const LANGUAGE_TAGS: readonly string[] = Object.keys(LANGUAGES)

/**
 * The bundle a tag names: the language's own lines over the English ones, so
 * a translation that covers half the cockpit draws the other half in English
 * rather than drawing nothing.
 *
 * A tag no file answers to is English, silently: the option is written by
 * hand and outlives the files beside it, and a cockpit that refused to draw
 * because a language was removed would be worse than one that reads oddly.
 *
 * @param tag the language, as the `/config` row holds it
 * @returns the complete bundle
 */
export function sayOf(tag: unknown): Texts {
  const asked = String(tag ?? '').trim().toLowerCase()
  const some = LANGUAGES[asked]

  if (some === undefined || asked === DEFAULT_LANGUAGE) {
    return EN
  }

  return {
    pane: { ...EN.pane, ...some.pane },
    titles: { ...EN.titles, ...some.titles },
    usage: { ...EN.usage, ...some.usage },
    stats: { ...EN.stats, ...some.stats },
    rail: { ...EN.rail, ...some.rail },
  }
}

/**
 * The bundle this module draws in, settled at `register` and never after.
 */
let current: Texts = EN

/**
 * Settles the language for this module.
 *
 * @param tag the language, as the option holds it
 */
export function setSay(tag: unknown): void {
  current = sayOf(tag)
}

/**
 * The lines to draw with.
 *
 * @returns the bundle
 */
export const say = (): Texts => current
