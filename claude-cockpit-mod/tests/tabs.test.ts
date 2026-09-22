import { describe, expect, test, tier } from 'claude-code/testing'

import { EMPTY } from '../hooks/state'
import { builtinTabs } from '../hooks/tabs'
import type { TabDeps } from '../hooks/tabs'

tier('user')

/**
 * Deps that answer nothing: the tabs are built here, never drawn, and what
 * is under test is the rail they line up in.
 */
const DEPS: TabDeps = {
  state: () => EMPTY,
  arm: () => undefined,
  root: () => '/work',
  host: () => null,
  picked: () => null,
  pick: () => undefined,
  isAll: () => false,
  showAll: () => undefined,
  refreshGit: () => undefined,
  refreshVitals: () => undefined,
  prompts: () => null,
  isReading: () => false,
  range: () => 'all',
  setRange: () => undefined,
  refreshStats: () => undefined,
  nowMs: () => 0,
}

describe('the rail', () => {
  const tabs = builtinTabs(DEPS)

  test('six tabs ship, in reading order', () => {
    // The order the `1`-`9` hotkeys land in: what the session is, what it
    // cost, what this machine has done, then the work itself.
    expect(tabs.map(tab => tab.id)).toEqual([
      'session',
      'usage',
      'stats',
      'files',
      'tools',
      'agents',
    ])
  })

  test('the order each carries is the order they are handed back in', () => {
    // The cockpit sorts the rail on `order`, so a tab whose number does not
    // match its place would be drawn somewhere else than it is listed here.
    const orders = tabs.map(tab => tab.order ?? 50)

    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })

  test('each has a title for the rail to draw it by', () => {
    expect(tabs.map(tab => tab.title)).toEqual([
      'Session',
      'Usage',
      'Stats',
      'Files',
      'Tools',
      'Agents',
    ])
  })

  test('a plugin can still sit between two of them', () => {
    // The built-in numbers leave room: a tab at 6 or 9 lands between Usage
    // and Stats, or between Stats and Files, without any of them moving.
    const built = tabs.map(tab => tab.order ?? 50)

    expect(built).not.toContain(6)
    expect(built).not.toContain(9)
  })
})
