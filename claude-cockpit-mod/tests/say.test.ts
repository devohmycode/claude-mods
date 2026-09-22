import { describe, expect, test, tier } from 'claude-code/testing'

import {
  DEFAULT_LANGUAGE,
  EN,
  FR,
  LANGUAGES,
  LANGUAGE_TAGS,
  sayOf,
} from '../hooks/say'
import type { PartialTexts, Texts } from '../hooks/say'

tier('user')

/**
 * The bundle's groups, by name: what a language may translate.
 */
const GROUPS = ['pane', 'titles', 'usage', 'stats', 'rail'] as const

/**
 * Every leaf of a bundle, as `group.key`.
 *
 * @param texts the bundle, whole or partial
 * @returns the keys it carries
 */
const keysOf = (texts: PartialTexts): readonly string[] =>
  GROUPS.flatMap(group =>
    Object.keys(texts[group] ?? {}).map(key => `${group}.${key}`),
  )

describe('English', () => {
  test('it is complete, which is what makes it the fallback', () => {
    for (const group of GROUPS) {
      expect(Object.keys(EN[group]).length).toBeGreaterThan(0)
    }
  })

  test('no line is left empty', () => {
    for (const key of keysOf(EN)) {
      const [group, leaf] = key.split('.') as [keyof Texts, string]
      const value = (EN[group] as Record<string, unknown>)[leaf]

      if (typeof value === 'string') {
        expect(value.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('a translation', () => {
  test('it carries no key English does not, so a typo cannot hide', () => {
    // The type already refuses an unknown key in the literal; this says the
    // same thing about the object that got built, which is what ships.
    const mine = new Set(keysOf(EN))

    for (const key of keysOf(FR)) {
      expect(mine.has(key)).toBe(true)
    }
  })

  test('what it leaves out falls back to English, line by line', () => {
    const half: PartialTexts = { usage: { cost: 'Coût' } }
    const some = sayOf('half')

    // Not registered, so this one is English whole — the point below is the
    // merge itself, stated on a language that is registered.
    expect(some).toBe(EN)
    expect(Object.keys(half.usage ?? {})).toEqual(['cost'])
  })

  test('a registered language keeps its own words and borrows the rest', () => {
    const fr = sayOf('fr')

    expect(fr.usage.cost).toBe(FR.usage?.cost)
    expect(fr.usage.cost).not.toBe(EN.usage.cost)

    // `skillsNote` is translated too; what matters is that every key answers
    // something, translated or not.
    for (const key of keysOf(EN)) {
      const [group, leaf] = key.split('.') as [keyof Texts, string]

      expect((fr[group] as Record<string, unknown>)[leaf]).toBeDefined()
    }
  })

  test('a line that takes an argument still takes it', () => {
    const fr = sayOf('fr')

    expect(fr.pane.showMore(4)).toContain('4')
    expect(fr.usage.skillCount(1)).toContain('1')
    expect(fr.stats.days(2)).toContain('2')
    expect(fr.rail.help(['session'], ['stats'])).toContain('stats')
  })

  test('plurals are the language’s own business', () => {
    // English says `1 skill` and `2 skills`; a language that does not
    // inflect there says whatever it says, because the whole line is its own.
    expect(EN.usage.skillCount(1)).not.toBe(EN.usage.skillCount(2))
    expect(sayOf('fr').usage.skillCount(1)).toBeDefined()
  })
})

describe('choosing one', () => {
  test('the default is English, and English is the bundle itself', () => {
    expect(sayOf(DEFAULT_LANGUAGE)).toBe(EN)
    expect(LANGUAGE_TAGS[0]).toBe(DEFAULT_LANGUAGE)
  })

  test('a tag no file answers to is English rather than nothing', () => {
    // The option is written by hand and outlives the files beside it: a
    // cockpit that refused to draw because a language was removed would be
    // worse than one that reads oddly.
    for (const tag of ['kl', '', '  ', undefined, null, 42]) {
      expect(sayOf(tag)).toBe(EN)
    }
  })

  test('the tag is read the way it is typed, not the way it is stored', () => {
    expect(sayOf(' FR ').usage.cost).toBe(FR.usage?.cost)
  })

  test('every tag on offer has a bundle behind it', () => {
    for (const tag of LANGUAGE_TAGS) {
      expect(LANGUAGES[tag]).toBeDefined()
      expect(sayOf(tag)).toBeDefined()
    }
  })

  test('adding one is a file and a line, and nothing reaches into it', () => {
    // The guarantee behind that claim: `sayOf` reads `LANGUAGES` and nothing
    // else, so a language is added by adding to it — no call site anywhere
    // names a tag.
    expect(LANGUAGE_TAGS).toEqual(Object.keys(LANGUAGES))
  })
})

describe('what is never translated', () => {
  test('the ids the Stats tab ranges over are the module’s', () => {
    // A translator gives titles under `all`, `d30`, `d7`; the ids themselves
    // are structural, so a translation cannot rename or reorder them.
    expect(Object.keys(EN.stats.ranges).sort()).toEqual(['all', 'd7', 'd30'].sort())
    expect(Object.keys(sayOf('fr').stats.ranges).sort()).toEqual(
      ['all', 'd7', 'd30'].sort(),
    )
  })

  test('the four token headings stay four', () => {
    expect(EN.usage.columns).toHaveLength(4)
    expect(sayOf('fr').usage.columns).toHaveLength(4)
  })

  test('what you type keeps its spelling', () => {
    // `/cockpit session` works in any language, and so do the ids in
    // `hideTabs`: only the rail's titles move.
    expect(EN.pane.commandHint).toContain('session')
    expect(sayOf('fr').pane.commandHint).toContain('session')
  })
})
