/**
 * Every line ContextManager puts in front of a person, in English: the one complete
 * bundle, and the shape every other language is checked against.
 *
 * A language is a file like this one carrying the keys it has translated and no
 * others — `PartialTexts`, not `Texts` — so a half-finished translation ships and
 * falls back to these lines key by key, and a misspelt key is a compile error
 * rather than a blank on screen.
 *
 * A line that takes an argument is a function, never a template assembled at the
 * call site: a sentence's word order and its plural are the translator's business,
 * and a caller that glued two halves together would have decided them for it.
 *
 * What is not here is not translated, on purpose: the glyphs, the product's name,
 * the `/manager` subcommands and every id the model or the store round-trips — a
 * word that is typed or matched may not move with the language.
 */

import type { ArtifactKind, Category, Choice, PrefixCause } from '../core/types'

/**
 * The pane: its header, its cards, the details behind `i`, and its footer.
 */
export type PaneTexts = {
  /** The header, before the first turn has been billed. */
  awaiting: string
  /** How much of the window is gone, the share already rendered ('32%'). */
  contextUsed: (share: string) => string
  /** The run left before auto-compaction, and the same said shorter. */
  toCompaction: (tokens: string) => string
  toCompactionShort: (tokens: string) => string
  /** That run stated in turns, at the pace the last turns set. */
  turnsLeft: (turns: number) => string
  /** The spread of that estimate: the fast and the slow pace of the recent turns. */
  turnsRange: (low: number, high: number) => string

  /** What the audit has cost, at the end of the name row. */
  judge: string
  judgeRuns: (runs: number) => string
  judgeTokens: (amount: string) => string
  /** What the audit has cost, as a share of the session's own tokens: beside the saving, never summed with it. */
  auditCost: (share: number) => string

  /** What the session got back, and that a run is in flight. */
  saved: string
  checkNow: string
  checking: string
  checkingLong: string

  /** The two budget rows, their figure's tail, and the sentence before the judge has one. */
  time: string
  context: string
  timeLead: string
  /** The time row's figure when no call was timed: every row was rebuilt from the transcript, which records no duration. */
  timeUnmeasured: string
  /** The prefix row: what every request re-reads before the conversation, in the engine's tokens. */
  prefix: string
  prefixLead: string
  /** The session row: the model, the limits, the cost, git, the skill, the version, the time, the machine. */
  session: string
  /** The machine row: the date and time, CPU, RAM and the Claude Code version. */
  machine: string
  /** The repository row: the branch, and the lines added and removed. */
  repo: string
  infoEffort: (effort: string) => string
  /** A quota used, bare: its place in the row says which window it is. */
  infoPercent: (percent: number) => string
  infoSkill: (skill: string) => string
  infoCpu: (percent: number) => string
  infoRam: (percent: number) => string
  /** The compaction row: when it came, and what had filled the window, as shares. */
  compaction: string
  compactedAt: (turn: number) => string
  share: (label: string, percent: number) => string
  /** The ledger's sink labels as the pane names them; a label not listed is drawn as the ledger wrote it. */
  sinkNames: Readonly<Record<string, string>>
  contextLead: string
  nothingYet: string

  /** The quiet pane, in its own frame. */
  empty: string

  /** A card's three verbs and the `i` beside its title. */
  fix: string
  fixNote: string
  ignore: string
  info: string

  /** The stats line under a card's title. */
  hits: (times: number) => string
  costShare: (percent: number) => string
  turnAt: (turn: number) => string
  turnRange: (first: number, last: number) => string
  /** A card whose instruction was ignored says so before its behaviour. */
  ignored: (kind: string) => string

  /** The details behind `i`: the two gutter labels, then what the evidence adds up to. */
  why: string
  fixLabel: string
  callCount: (calls: number) => string
  turnCount: (turns: number) => string
  agentCount: (agents: number) => string
  perTurn: (tokens: string) => string
  charsOfContext: (chars: string) => string

  /** One cited call: its turn, the unit of its size, and a turn handle's own answer. */
  turnCell: (turn: number) => string
  charsUnit: string
  answerSize: (chars: string) => string
  /** A cited loop the journal never named, and the line quoted under it. */
  loop: string
  loopCost: (ktokens: number, edits: number) => string

  /** The Fix… field: what Enter does, and the word on its submit control. */
  steerHint: string
  send: string

  /** The footer: the decisions, what each is called and what it is worth. */
  decided: string
  decidedWord: Record<Choice, string>
  savedCredit: (percent: number) => string
  perRepeat: (percent: number) => string
  ignoredTimes: (times: number) => string

  /** The rules the decisions would leave behind, and the three things to do with one. */
  rules: string
  artifact: Record<ArtifactKind, string>
  write: string
  tryOnce: string
  skip: string
  /** What Write would do, shown after the first press. */
  previewConfirm: string
  previewDuplicate: string
  previewOverwrites: string
  /** Written rules whose behaviour never came back, offered for removal. */
  staleTitle: string
  staleWhy: (sessions: number) => string
  remove: string
  keepIt: string
  /** The card's fourth verb, where the `apply` lever is on: Fix, and rewrite the calls from now on. */
  apply: string

  /** The inline pane's one count line, which stands in for the whole footer. */
  decidedCount: (decided: number) => string
  rulesCount: (rules: number) => string
  fullPane: string

  /** The last row: how the pane is worked from the keyboard. */
  verbsHint: string
  keysFocus: string
  keysMove: string
  keysPress: string
  keysBack: string
}

/**
 * The one teaser line above the prompt, one phrasing per state, longest first.
 */
export type BandTexts = {
  /** The last turn died and no prompt has followed it. */
  died: (how: string) => string
  diedError: string
  diedRefusal: string
  diedContinue: string

  /** A run is in flight. */
  checking: string

  /** Cards are waiting: what they are worth, or that they are simply there. */
  foundWorthLook: (cards: number) => string
  foundSavingBoth: (cards: number, share: string, time: string) => string
  foundSaving: (cards: number, saving: string) => string
  foundShort: (cards: number) => string
  /** The share of the window those cards have already eaten; under one percent it says so. */
  costShare: (percent: number) => string

  /** A saving to show off: the figures carry the tone, these words sit around them. */
  saved: string
  ofContext: string
  thisSession: string

  /** A workflow still going, and the stage its journal has not named yet. */
  running: string
  agentCount: (agents: number) => string
  callCount: (calls: number) => string

  /** The quiet watch, before and after the first ledger row. */
  watching: string
  watched: (calls: number) => string
  quiet: string
  /** The audit found nothing several runs in a row, so it now waits for more work between runs. */
  slowed: string

  /** The button at the band's right edge. */
  open: string
  close: string
}

/**
 * `/manager`: what it says of itself, what it answers, and what it toasts.
 *
 * The command's own name and its subcommands are absent: they are typed, and a
 * word that moved with the language would be a command nobody could write down.
 */
export type CommandTexts = {
  description: string
  argumentHint: string

  usage: string
  fixUsage: string
  paneShown: string
  paneHidden: string
  nothingToDecide: string
  reset: string
  demoLoaded: string

  checking: string
  alreadyChecking: string
  nothingNew: string
  found: (cards: number) => string
  checkFailed: (failure: string) => string
  notCheckedYet: (failure: string) => string

  /** A card named by the number the pane draws beside it. */
  card: (seat: number, kind: string, outcome: string) => string
  noCard: (seat: number, cards: number) => string
  outcomeIgnored: string
  outcomeFixed: string
  outcomeNoted: (text: string) => string

  /** What a decision toasts, and the nudge when the field was sent empty. */
  toastIgnored: (kind: string) => string
  toastFixed: (alternative: string) => string
  toastNoted: (instruction: string) => string
  writeFirst: string

  /** The saving a settled instruction credited. */
  savedToast: (figures: string) => string

  /** A rule written to disk, or borrowed for this session alone. */
  wrote: (path: string) => string
  trying: (title: string) => string

  /** The keyboard never reached the Fix… field, so the composer route is spelled out. */
  composerHasKeys: (seat: number) => string

  /** `/manager stats`: the project's sessions, one line per behaviour, then the audit's cost. */
  statsEmpty: (sessions: number) => string
  statsHeader: (sessions: number) => string
  statsLine: (row: { kind: string; sessions: number; seen: number; fixed: number; ignored: number; savedTime: string | null; savedChars: string | null; byCode: boolean; muted: boolean }) => string
  statsMore: (rows: number) => string
  statsAudit: (runs: number, tokens: string) => string
  /** No home directory to keep a history under. */
  historyUnavailable: string
  /** `/manager report`: the Markdown file, and what the command answers. */
  reportTitle: (date: string) => string
  reportFacts: (turns: number, calls: number, compactions: number) => string
  reportFound: string
  reportNothing: string
  reportUndecided: string
  reportByCode: string
  reportByJudge: string
  reportSaved: string
  reportSavedTime: (time: string) => string
  reportSavedContext: (chars: string, percent: number) => string
  reportAudit: string
  reportAuditLine: (runs: number, tokens: string, share: number | null) => string
  reportContext: string
  reportWritten: (path: string) => string
  /** Apply: the note a rewritten call carries to Claude, and what the person is told. */
  appliedNote: (original: string, rewritten: string, after: string) => string
  appliedSuiteAfter: string
  appliedLogAfter: string
  appliedOn: (kind: string) => string
  appliedStopped: (kind: string) => string
  applyOff: string
  notApplicable: (seat: number) => string
  /** A second Write on a rule the file already carries. */
  alreadyThere: (path: string) => string
  /** A stale rule taken out of CLAUDE.md. */
  removed: (path: string) => string
  /** The toast a compaction gets: when, and what had filled the window. */
  compacted: (turn: number, shares: string) => string

  /** `/manager unmute <id>`. */
  unmuteUsage: string
  unmuted: (id: string) => string
  notMuted: (id: string) => string
}

/**
 * The nine categories, as the dim tag on a card's title row spells them. The enum
 * values themselves never move: they are the id's own first half and the model's.
 */
export type CategoryTexts = Record<Category, string>

/**
 * What reaches the model: the language the fork answers in, and the two wrappers
 * a decision is sent to Claude inside.
 */
export type JudgeTexts = {
  /**
   * The paragraph appended to the judge prompt, just before its last line.
   *
   * Empty for English, whose prompt is the whole instruction already. Another
   * language says here which fields it wants in its own words and which stay as
   * written — ids, categories, evidence handles and signatures are matched, never
   * read, so a translated one discards the finding.
   */
  directive: string
  /**
   * The words every `kind` opens with, verbatim on both sides: the prompt asks for
   * them and the parser refuses a finding without them.
   */
  kindPrefix: string
  /** The wrapper a decision rides to Claude in. */
  instruction: (text: string) => string
  /** What `Fix` sends: stop this, and do that instead. */
  kill: (kind: string, alternative: string) => string
}

/**
 * What the deterministic detectors write on a card: the plugin's own words, not the
 * judge's, so every language needs them. `kind` opens with the language's
 * `judge.kindPrefix`, so a card reads the same whoever found it; the `…Fix` lines
 * reach Claude verbatim, like a judge's `alternative`, and the `…Rule` lines may be
 * written into CLAUDE.md.
 */
export type DetectTexts = {
  rereadKind: (path: string) => string
  rereadWhy: (times: number) => string
  rereadFix: (path: string) => string
  fullSuiteKind: (command: string) => string
  fullSuiteWhy: (times: number) => string
  fullSuiteFix: string
  fullSuiteRuleTitle: string
  fullSuiteRule: string
  sameSearchKind: (search: string) => string
  sameSearchWhy: (times: number) => string
  sameSearchFix: string
  logDumpKind: (command: string) => string
  logDumpWhy: (times: number, chars: string) => string
  logDumpFix: string
  logDumpRuleTitle: string
  logDumpRule: string
  reExploreKind: string
  reExploreWhy: (loops: number, looks: number, chars: string) => string
  reExploreFix: string
  reExploreBriefTitle: string
  reExploreBrief: string
  /** The switch, by what switched. */
  prefixKind: Record<PrefixCause, string>
  /** How often, at which turns, and the cache the steps after rewrote beyond a normal step's — null before a normal step was measured. */
  prefixWhy: (times: number, turns: string, tokens: string | null) => string
  prefixFix: string
}

/**
 * The `/config` rows this plugin owns, as the settings menu lists them.
 */
export type ConfigTexts = {
  languageLabel: string
  /** The tags there are, appended to the row's help so a language added here shows up at once. */
  languageAvailable: (tags: readonly string[]) => string
}

/**
 * Every line, in six groups.
 */
export type Texts = {
  pane: PaneTexts
  band: BandTexts
  command: CommandTexts
  categories: CategoryTexts
  judge: JudgeTexts
  detect: DetectTexts
  config: ConfigTexts
}

/**
 * A language as its file gives it: the groups it touched, and inside each one the
 * keys it translated. What it leaves out falls back to English.
 *
 * One level deep, which is as deep as the bundle goes.
 */
export type PartialTexts = {
  [Group in keyof Texts]?: Partial<Texts[Group]>
}

/** '2 runs', '1 run': the count and the word it takes; `plural` where an `s` is not the plural. */
const counted = (n: number, word: string, plural = `${word}s`): string => `${n} ${n === 1 ? word : plural}`

/**
 * English: the complete bundle, and the fallback for every other language.
 */
export const EN: Texts = {
  pane: {
    awaiting: 'awaiting the first turn',
    contextUsed: share => `${share} of context`,
    toCompaction: tokens => `${tokens} tokens to compaction`,
    toCompactionShort: tokens => `${tokens} to compaction`,
    turnsLeft: turns => `about ${counted(turns, 'turn')}`,
    turnsRange: (low, high) => `(${low}–${high})`,

    judge: 'Judge ',
    judgeRuns: runs => counted(runs, 'run'),
    judgeTokens: amount => `${amount} tokens`,
    auditCost: share => `audit ${share}% of session tokens`,

    saved: 'Saved ',
    checkNow: 'Check now',
    checking: 'Checking…',
    checkingLong: 'checking this session… usually 10–20 s',

    time: 'Time',
    context: 'Context',
    timeLead: 'in tools',
    timeUnmeasured: 'not measured',
    session: 'Session',
    machine: 'Information',
    repo: 'Repo',
    infoEffort: effort => `effort ${effort}`,
    infoPercent: percent => `${percent}%`,
    infoSkill: skill => `skill ${skill}`,
    infoCpu: percent => `CPU ${percent}%`,
    infoRam: percent => `RAM ${percent}%`,
    prefix: 'Prefix',
    prefixLead: 'tokens every request',
    compaction: 'Compaction',
    compactedAt: turn => `at turn ${turn}`,
    share: (label, percent) => `${label} ${percent}%`,
    sinkNames: {},
    contextLead: 'from tools',
    nothingYet: 'nothing stands out yet',

    empty: 'Watching quietly. Nothing repeating yet.',

    fix: 'Fix',
    fixNote: 'Fix…',
    ignore: 'Ignore',
    info: 'i',

    hits: times => `${times}×`,
    costShare: percent => `~${percent}% of context`,
    turnAt: turn => `turn ${turn}`,
    turnRange: (first, last) => `turns ${first}–${last}`,
    ignored: kind => `ignored · ${kind}`,

    why: 'why',
    fixLabel: 'fix',
    callCount: calls => counted(calls, 'call'),
    turnCount: turns => counted(turns, 'turn'),
    agentCount: agents => counted(agents, 'agent'),
    perTurn: tokens => `~${tokens} tokens per turn`,
    charsOfContext: chars => `${chars} chars of context`,

    turnCell: turn => `turn ${turn}`,
    charsUnit: ' ch',
    answerSize: chars => `${chars} answer`,
    loop: 'agent',
    loopCost: (ktokens, edits) => `${ktokens}k tokens · ${edits} edits`,

    steerHint: 'Enter sends · Fix… again closes · or /manager fix <n> <text>',
    send: 'send',

    decided: 'Decided',
    decidedWord: { keep: 'ignored', steer: 'fixed with a note', kill: 'fixed' },
    savedCredit: percent => `saved ~${percent}%`,
    perRepeat: percent => `~${percent}% per repeat`,
    ignoredTimes: times => `ignored ${times}×`,

    rules: 'Rules for next session',
    artifact: {
      'claude-md': 'CLAUDE.md',
      skill: 'skill',
      'agent-brief': 'agent brief',
      'settings-allow': 'permission rule',
    },
    write: 'Write',
    tryOnce: 'Try',
    skip: 'Skip',
    previewConfirm: 'Write again to write it',
    previewDuplicate: 'already in the file — nothing to write',
    previewOverwrites: 'replaces the file that is there',
    staleTitle: 'Rules that never fired',
    staleWhy: sessions => `its behaviour never came back in ${counted(sessions, 'session')}, and was a one-off before`,
    remove: 'Remove',
    keepIt: 'Keep',
    apply: 'Apply',

    decidedCount: decided => `Decided ${decided}`,
    rulesCount: rules => `Rules ${rules}`,
    fullPane: '/manager for the full pane',

    verbsHint: '/manager fix|ignore <n>',
    keysFocus: 'ctrl+x tab focuses this pane',
    keysMove: 'Tab moves',
    keysPress: 'Enter presses',
    keysBack: 'Esc hands the keys back',
  },

  band: {
    died: how => `Last turn ended in ${how}`,
    diedError: 'an API error',
    diedRefusal: 'a refusal',
    diedContinue: 'type anything to continue',

    checking: 'checking this session…',

    foundWorthLook: cards => `Found ${counted(cards, 'thing')} worth a look`,
    foundSavingBoth: (cards, share, time) => `Found ${counted(cards, 'way')} to save ${share} and ${time}`,
    foundSaving: (cards, saving) => `Found ${counted(cards, 'way')} to save ${saving}`,
    foundShort: cards => `Found ${counted(cards, 'waster')}`,
    costShare: percent => `${percent >= 1 ? `~${Math.round(percent)}%` : 'under 1%'} of your context`,

    saved: 'saved ',
    ofContext: ' of context',
    thisSession: ' this session',

    running: 'running',
    agentCount: agents => counted(agents, 'agent'),
    callCount: calls => counted(calls, 'call'),

    watching: 'watching',
    watched: calls => `${calls} calls watched`,
    quiet: 'nothing wasteful yet',
    slowed: 'audit slowed: the last checks found nothing',

    open: 'Open',
    close: 'Close',
  },

  command: {
    description: 'ContextManager: toggle the pane · check | fix [n] [text] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset',
    argumentHint: '[check | fix [n] [text] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',

    usage: 'Usage: /manager [check | fix [n] [text] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',
    fixUsage: 'Usage: /manager fix [n] [instruction] (a leading number is the card the pane draws; without one: the card whose Fix… field is open, else card 1)',
    paneShown: 'ContextManager pane shown',
    paneHidden: 'ContextManager pane hidden',
    nothingToDecide: 'ContextManager: nothing to decide on',
    reset: 'ContextManager: session state reset',
    demoLoaded: 'ContextManager: demo wasters loaded',

    checking: 'ContextManager: checking this session for waste…',
    alreadyChecking: 'ContextManager: already checking',
    nothingNew: 'ContextManager: nothing new',
    found: cards => `ContextManager: ${counted(cards, 'new waster')}`,
    checkFailed: failure => `ContextManager: check failed — ${failure}`,
    notCheckedYet: failure => `ContextManager: could not check yet — ${failure}`,

    card: (seat, kind, outcome) => `ContextManager: card ${seat} — "${kind}" · ${outcome}`,
    noCard: (seat, cards) => `ContextManager: no card ${seat} (1–${cards})`,
    outcomeIgnored: 'ignored',
    outcomeFixed: 'fixed',
    outcomeNoted: text => `fixed with your note: ${text}`,

    toastIgnored: kind => `ContextManager: ignored "${kind}"`,
    toastFixed: alternative => `ContextManager: fixed — ${alternative}`,
    toastNoted: instruction => `ContextManager: fixed with your note — ${instruction}`,
    writeFirst: 'ContextManager: write the instruction first',

    savedToast: figures => `${figures} context saved`,

    wrote: path => `Wrote ${path}`,
    trying: title => `Trying "${title}" for this session`,

    composerHasKeys: seat => `ContextManager: the composer has your keys — type /manager fix ${seat} <your note>`,

    statsEmpty: sessions => `ContextManager: nothing recorded yet in this project (${counted(sessions, 'session')})`,
    statsHeader: sessions => `ContextManager — this project, ${counted(sessions, 'session')}:`,
    statsLine: r => {
      const saved = [r.savedTime, r.savedChars === null ? null : `${r.savedChars} chars`].filter((x): x is string => x !== null)
      const tags = [r.byCode ? 'found by code' : null, r.muted ? 'muted' : null].filter((x): x is string => x !== null)
      return `- ${r.kind} — ${r.seen}× in ${counted(r.sessions, 'session')} · fixed ${r.fixed} · ignored ${r.ignored}${saved.length === 0 ? '' : ` · saved ${saved.join(' · ')}`}${tags.length === 0 ? '' : ` [${tags.join(', ')}]`}`
    },
    appliedNote: (original, rewritten, after) => `[ContextManager] ran \`${rewritten}\` instead of \`${original}\`, as the user asked — ${after}`,
    appliedSuiteAfter: 'run the original command again to get the whole suite.',
    appliedLogAfter: 'read the file itself for the rest of it.',
    appliedOn: kind => `ContextManager: applied — the next calls are rewritten: ${kind}`,
    appliedStopped: kind => `ContextManager: Apply stopped — Claude ran the original twice right after a rewrite: ${kind}`,
    applyOff: 'ContextManager: Apply is off — turn on the apply row in /config',
    notApplicable: seat => `ContextManager: card ${seat} has no rewrite; use /manager fix ${seat}`,
    reportTitle: date => `ContextManager — session report, ${date} UTC`,
    reportFacts: (turns, calls, compactions) => `${counted(turns, 'turn')} · ${counted(calls, 'tool call')} · ${counted(compactions, 'compaction')}`,
    reportFound: 'What repeated',
    reportNothing: 'Nothing.',
    reportUndecided: 'not decided',
    reportByCode: 'found by code',
    reportByJudge: 'found by the audit',
    reportSaved: 'What the decisions saved',
    reportSavedTime: time => `time: ${time}`,
    reportSavedContext: (chars, percent) => `context: ${chars} characters (~${percent}% of the window)`,
    reportAudit: 'What the audit cost',
    reportAuditLine: (runs, tokens, share) => `${counted(runs, 'run')} · ${tokens} tokens${share === null ? '' : ` (${share}% of the session's new tokens)`}`,
    reportContext: 'Where the context went',
    reportWritten: path => `ContextManager: report written to ${path}`,
    alreadyThere: path => `ContextManager: ${path} already says this — nothing written`,
    removed: path => `ContextManager: rule removed from ${path}`,
    compacted: (turn, shares) => `ContextManager: compacted at turn ${turn} — ${shares}`,
    statsMore: rows => `… and ${counted(rows, 'more behaviour')}`,
    statsAudit: (runs, tokens) => `Audit: ${counted(runs, 'run')} · ${tokens} tokens`,
    historyUnavailable: "ContextManager: no home directory to keep this project's history in",

    unmuteUsage: 'Usage: /manager unmute <pattern id> (the ids /manager debug lists as muted)',
    unmuted: id => `ContextManager: ${id} will be reported again in this project`,
    notMuted: id => `ContextManager: ${id} is not muted in this project`,
  },

  categories: {
    execution: 'execution',
    reading: 'reading',
    production: 'production',
    behavior: 'behavior',
    communication: 'communication',
    'multi-agent': 'multi-agent',
    environment: 'environment',
    process: 'process',
    other: 'other',
  },

  judge: {
    // English is the prompt's own language: it needs no paragraph telling it so.
    directive: '',
    kindPrefix: 'Claude keeps ',
    instruction: text => `Instruction from the user (via ContextManager): ${text}`,
    kill: (kind, alternative) => `Stop this behaviour for the rest of the session: ${kind}. From now on: ${alternative}`,
  },

  detect: {
    rereadKind: path => `Claude keeps re-reading ${path} with nothing changed in between`,
    rereadWhy: times => `Read ${counted(times, 'time')}, with no edit, install or formatter that could have changed the file between the reads.`,
    rereadFix: path => `Work from what you already read of ${path}; read it again only after it changes, and then only the lines you need.`,
    fullSuiteKind: command => `Claude keeps running the whole \`${command}\` suite after one-file edits`,
    fullSuiteWhy: times => `${counted(times, 'full run')}, each right after an edit to a single file; the first run and a run just before a commit are not counted.`,
    fullSuiteFix: 'Run only the tests covering the file you changed, then the whole suite once when the phase is done.',
    fullSuiteRuleTitle: 'Targeted tests',
    fullSuiteRule: 'Run only the tests covering the files you changed; run the full suite once at the end of a phase.',
    sameSearchKind: search => `Claude keeps running the same search: ${search}`,
    sameSearchWhy: times => `${counted(times, 'identical search', 'identical searches')} with no edit between them, so each one found what the last one did.`,
    sameSearchFix: 'Reuse the result of a search you already ran; run it again only after files have changed.',
    logDumpKind: command => `Claude keeps dumping a whole log with \`${command}\``,
    logDumpWhy: (times, chars) => `${counted(times, 'run')} of ${chars} characters or more each, read in full rather than filtered.`,
    logDumpFix: "Filter a log before reading it: pipe it through grep -nE 'ERROR|FAIL|Traceback' and tail -n 50.",
    logDumpRuleTitle: 'Filtered logs',
    logDumpRule: "Filter logs before reading them (grep -nE 'ERROR|FAIL|Traceback', tail -n 50); never read a whole log.",
    reExploreKind: 'Claude keeps having subagents re-read files the main session had already read',
    reExploreWhy: (loops, looks, chars) => `${counted(loops, 'subagent')} re-read ${counted(looks, 'file or search', 'files or searches')} the main session had already read before spawning them, ${chars} characters over again.`,
    reExploreFix: "Put what you already read into the subagent's brief — the paths and what matters in them — so it reads only what is new.",
    reExploreBriefTitle: 'Reuse the parent reads',
    reExploreBrief: 'The parent has already read the files this brief names and summarises what matters in them; read one of them again only to edit it or to check a detail the summary leaves out.',
    prefixKind: {
      model: 'Claude keeps switching models mid-session, and each switch rewrites the prompt cache',
      effort: 'Claude keeps switching the effort level mid-session, and each switch rewrites the prompt cache',
    },
    prefixWhy: (times, turns, tokens) =>
      `${counted(times, 'switch', 'switches')} (${turns.includes(',') ? 'turns' : 'turn'} ${turns})${tokens === null ? '' : `; the steps right after them wrote ~${tokens} tokens more to the cache than a usual step`}.`,
    prefixFix: 'Keep one model and one effort level for the rest of this session; change them between sessions or right after a /compact.',
  },

  config: {
    languageLabel: 'Language',
    languageAvailable: tags => `Available: ${tags.join(', ')}.`,
  },
}
