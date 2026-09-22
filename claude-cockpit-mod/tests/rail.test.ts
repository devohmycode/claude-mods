import { describe, expect, test, tier } from 'claude-code/testing'

import { EN } from '../hooks/say'
import { checkOf, hiddenOf, isHidden, lineOf, shownOf } from '../hooks/rail'

tier('user')

const TABS = [
  { id: 'session' },
  { id: 'usage' },
  { id: 'stats' },
  { id: 'files' },
  { id: 'tools' },
  { id: 'agents' },
  { id: 'message' },
]

const IDS = TABS.map(tab => tab.id)

describe('reading the line', () => {
  test('a comma-separated line names its ids', () => {
    expect(hiddenOf('stats,tools')).toEqual(['stats', 'tools'])
  })

  test('spacing and casing are the typist’s, not the rail’s', () => {
    expect(hiddenOf('  Stats , TOOLS ')).toEqual(['stats', 'tools'])
  })

  test('a line pasted from elsewhere is read too', () => {
    expect(hiddenOf('stats;tools\nagents')).toEqual([
      'stats',
      'tools',
      'agents',
    ])
  })

  test('an id written twice is one id', () => {
    expect(hiddenOf('stats, stats')).toEqual(['stats'])
  })

  test('an empty line hides nothing', () => {
    expect(hiddenOf('')).toEqual([])
    expect(hiddenOf('  ,  , ')).toEqual([])
    expect(hiddenOf(undefined)).toEqual([])
  })

  test('a settings file may hold the list as a list', () => {
    // `PluginOptions` values include `readonly string[]`, so the line may
    // arrive already split by whoever wrote the settings.
    expect(hiddenOf(['stats', 'tools'])).toEqual(['stats', 'tools'])
  })
})

describe('the rail', () => {
  test('a hidden tab is left off, the rest keep their order', () => {
    expect(shownOf(TABS, ['stats', 'tools']).map(tab => tab.id)).toEqual([
      'session',
      'usage',
      'files',
      'agents',
      'message',
    ])
  })

  test("another plugin's tab is hidden like any other", () => {
    // The whole point: the line covers what the cockpit never declared.
    expect(shownOf(TABS, ['message']).map(tab => tab.id)).not.toContain(
      'message',
    )
  })

  test('an id naming no tab hides nothing rather than failing', () => {
    // The line outlives the plugins loaded when it was written: a session
    // started without one of them draws its rail rather than refusing to.
    expect(shownOf(TABS, ['ghost']).map(tab => tab.id)).toEqual(IDS)
  })

  test('nothing hidden draws every tab', () => {
    expect(shownOf(TABS, [])).toEqual(TABS)
  })

  test('everything hidden draws none', () => {
    expect(shownOf(TABS, IDS)).toEqual([])
  })

  test('one tab is asked about the same way the rail filters', () => {
    expect(isHidden('Stats', ['stats'])).toBe(true)
    expect(isHidden('stats', ['tools'])).toBe(false)
  })
})

describe('what `/config` writes', () => {
  test('a line of known ids is written back tidied', () => {
    expect(checkOf(' TOOLS , stats ', IDS, EN.rail.unknown)).toEqual({
      value: 'tools, stats',
    })
  })

  test('what it writes reads back as what was meant', () => {
    const written = checkOf('Stats;tools', IDS, EN.rail.unknown)

    expect(hiddenOf(written.value)).toEqual(['stats', 'tools'])
  })

  test('an id no tab carries is refused, not written', () => {
    const checked = checkOf('stats,gohst', IDS, EN.rail.unknown)

    // It would hide nothing and the rail would look exactly as it did, so
    // the row would show the typo as though it had taken.
    expect(checked.value).toBe(undefined)
    expect(checked.deny).toContain('gohst')
  })

  test('the refusal names what there was to choose from', () => {
    const checked = checkOf('nope', IDS, EN.rail.unknown)

    expect(checked.deny).toContain('session')
    expect(checked.deny).toContain('message')
  })

  test('an empty line is written, since it is how they all come back', () => {
    expect(checkOf('', IDS, EN.rail.unknown)).toEqual({ value: '' })
  })

  test('a line of ids is the line the ids join into', () => {
    expect(lineOf(['stats', 'tools'])).toBe('stats, tools')
  })
})

describe('what the command says', () => {
  test('a hidden tab is named as hidden, not as missing', () => {
    // It exists and the person put it out; sending them looking for a typo
    // they did not make would be the one unhelpful thing to say.
    const said = EN.rail.hidden('Stats', EN.rail.label)

    expect(said).toContain('Stats')
    expect(said).toContain('/config')
    expect(said).not.toContain('No tab called')
  })

  test('an empty rail says where they all went', () => {
    expect(EN.rail.none).toContain('/config')
  })
})

describe('the help under the row', () => {
  test('it names every registered tab, hidden ones included', () => {
    const help = EN.rail.help(['session', 'usage'], ['stats'])

    for (const id of ['session', 'usage', 'stats']) {
      expect(help).toContain(id)
    }
  })

  test('it says which are out, and says nothing of it when none are', () => {
    expect(EN.rail.help(IDS, [])).not.toContain('Out:')
    expect(EN.rail.help(['session'], ['stats'])).toContain('Out: stats')
  })

  test('an empty rail still reads as a sentence', () => {
    expect(EN.rail.help([], [])).toContain('none')
  })
})
