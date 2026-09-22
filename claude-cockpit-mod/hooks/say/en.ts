/**
 * Every line the cockpit shows, in English: the one complete bundle, and the
 * shape every other language is checked against.
 *
 * A language is a file like this one with the keys it has translated and no
 * others — `PartialTexts`, not `Texts` — so a half-finished translation
 * ships and falls back to these lines key by key, and a misspelt key is a
 * compile error rather than a blank on screen.
 *
 * A line that takes an argument is a function, never a template assembled at
 * the call site: a sentence's word order is the translator's business, and a
 * caller that glued two halves together would have decided it for them.
 */

import { PANE_TITLE } from '../names'

/**
 * The lines the pane, the rail and the command draw.
 */
export type PaneTexts = {
  noTabs: string
  emptyFiles: string
  emptyTools: string
  emptyAgents: string
  agentCount: (all: number, running: number) => string
  emptyHistory: string
  limits: string
  host: (took: string) => string
  hostOn: string
  hostOff: string
  hostNone: string
  resets: (left: string) => string
  showMore: (hidden: number) => string
  showLess: string
  read: string
  written: string
  ok: string
  failed: string
  band: (isOpen: boolean) => string
  opened: string
  closed: string
  dismissed: string
  unknownTab: (id: string, known: readonly string[]) => string
  armed: (path: string, armed: number) => string
  sent: (paths: readonly string[]) => string
  footer: string

  /**
   * What `/cockpit` says of itself in the command list, and the argument it
   * hints at. Its name is not here: a slash command is typed, and a command
   * whose spelling moved with the language would be a command nobody could
   * write down.
   */
  command: string
  commandHint: string
}

/**
 * Each tab's name in the rail.
 */
export type TitleTexts = {
  session: string
  usage: string
  stats: string
  files: string
  tools: string
  agents: string
}

/**
 * The Usage tab's lines, each naming its unit: four token counters are four
 * prices, and a figure with no unit behind it would be the tab inventing one.
 */
export type UsageTexts = {
  session: string
  cost: string
  wall: string
  turns: string
  lines: string
  tokens: string
  main: string
  agents: string
  total: string

  /**
   * The four headings, in the order the API spells its counters.
   */
  columns: readonly [string, string, string, string]

  noTurns: string
  share: (percent: string) => string
  underAgents: (turns: number) => string
  skills: string
  skillsNote: string
  noSkills: string
  skillCount: (skills: number) => string
}

/**
 * The Stats tab's lines.
 */
export type StatsTexts = {
  title: string
  source: string
  reading: string
  none: string

  /**
   * The windows the figures are read over, by the id each one carries. The
   * ids are the module's and never a translator's; only the titles here are.
   */
  ranges: { all: string; d30: string; d7: string }

  prompts: string
  sessions: string
  projects: string
  activeDays: string
  busiest: string
  topProject: string
  currentStreak: string
  longestStreak: string
  legend: string
  legendMore: string
  days: (days: number) => string
  since: (date: string) => string
}

/**
 * The `/config` row that leaves tabs off the rail, and what the pane says
 * where it has left nothing to draw.
 */
export type RailTexts = {
  label: string
  help: (shown: readonly string[], hidden: readonly string[]) => string
  unknown: (bad: readonly string[], known: readonly string[]) => string
  hidden: (title: string, label: string) => string
  none: string
}

/**
 * Every line, in five groups.
 */
export type Texts = {
  pane: PaneTexts
  titles: TitleTexts
  usage: UsageTexts
  stats: StatsTexts
  rail: RailTexts
}

/**
 * A language as its file gives it: the groups it touched, and inside each
 * one the keys it translated. What it leaves out falls back to English.
 *
 * One level deep, which is as deep as the bundle goes.
 */
export type PartialTexts = {
  [Group in keyof Texts]?: Partial<Texts[Group]>
}

/**
 * English: the complete bundle, and the fallback for every other language.
 */
export const EN: Texts = {
  pane: {
    noTabs: 'No tab is registered.',
    emptyFiles: 'No file read or written yet.',
    emptyTools: 'No tool called yet.',
    emptyAgents: 'No agent started this session.',
    agentCount: (all, running) =>
      `${all} agent${all === 1 ? '' : 's'} this session${running > 0 ? ` · ${running} running` : ''}`,
    emptyHistory: 'No finished turn yet.',
    limits: 'Plan limits',
    host: took => `Machine · read in ${took}`,
    hostOn:
      'Machine readings on: the processor, the memory and the graphics card, every five seconds while the Session tab is open.',
    hostOff: 'Machine readings off.',
    hostNone:
      'This host answered none of the commands the cockpit reads a machine with.',
    resets: left => `resets in ${left}`,
    showMore: hidden => `Show more (${hidden})`,
    showLess: 'Show less',
    read: 'read',
    written: 'written',
    ok: 'ok',
    failed: 'failed',
    band: isOpen => (isOpen ? 'Close' : PANE_TITLE),
    opened: 'Cockpit open.',
    closed: 'Cockpit closed.',
    dismissed: 'Cockpit dismissed.',
    unknownTab: (id, known) =>
      `No tab called ${id}. Known: ${known.join(', ')}.`,
    armed: (path, armed) =>
      armed === 1
        ? `${path} rides the next prompt.`
        : `${path} rides the next prompt, with ${armed - 1} other${armed === 2 ? '' : 's'}.`,
    sent: paths =>
      paths.length === 1
        ? `${paths[0]} went with the prompt.`
        : `${paths.length} files went with the prompt.`,
    footer: 'tab: next tab · enter: into it · esc: back to the prompt',
    command:
      'The cockpit pane: the session, what it cost, the files, the tools, the agents and the machine’s own record, side by side beside the transcript',
    commandHint: '[session|usage|stats|files|tools|agents|host]',
  },

  titles: {
    session: 'Session',
    usage: 'Usage',
    stats: 'Stats',
    files: 'Files',
    tools: 'Tools',
    agents: 'Agents',
  },

  usage: {
    session: 'This session',
    cost: 'Cost',
    wall: 'Turn time',
    turns: 'Turns',
    lines: 'Lines',
    tokens: 'Tokens',
    main: 'Main loop',
    agents: 'Subagents',
    total: 'Total',
    columns: ['in', 'out', 'cache r', 'cache w'],
    noTurns: 'No finished turn has reported its tokens yet.',
    share: percent => `Subagents wrote ${percent} of the output.`,
    underAgents: turns => `${turns} under subagents`,
    skills: 'Skill listings in the system prompt',
    skillsNote: 'Estimated locally, per turn the prompt is sent.',
    noSkills: 'This session lists no skill.',
    skillCount: skills => `${skills} skill${skills === 1 ? '' : 's'}`,
  },

  stats: {
    title: 'Prompts typed on this machine',
    source: 'From ~/.claude/history.jsonl',
    reading: 'Reading the history…',
    none: 'No history file on this machine yet.',
    ranges: { all: 'All time', d30: 'Last 30 days', d7: 'Last 7 days' },
    prompts: 'Prompts',
    sessions: 'Sessions',
    projects: 'Projects',
    activeDays: 'Active days',
    busiest: 'Busiest day',
    topProject: 'Top project',
    currentStreak: 'Current streak',
    longestStreak: 'Longest streak',
    legend: 'Less',
    legendMore: 'More',
    days: days => `${days} day${days === 1 ? '' : 's'}`,
    since: date => `since ${date}`,
  },

  rail: {
    label: 'Tabs the cockpit leaves out',
    help: (shown, hidden) =>
      `Ids to leave out, comma-separated; empty draws them all. Registered now: ${
        [...shown, ...hidden].join(', ') || 'none'
      }.${hidden.length === 0 ? '' : ` Out: ${hidden.join(', ')}.`}`,
    unknown: (bad, known) =>
      `No tab called ${bad.join(', ')}. Known: ${known.join(', ')}.`,
    hidden: (title, label) =>
      `${title} is hidden. /config → ${label} brings it back.`,
    none: 'Every tab is hidden. /config brings them back.',
  },
}
