/**
 * Every name, number and line the mod uses, in one place: what the store
 * keeps a session under, where the journal is written, the thresholds a cache
 * miss is judged by, and the words the ticket is made of.
 *
 * The thresholds are the only opinions in the mod. Each is a parameter rather
 * than a constant inside a function, so a test can push a case either side of
 * it and the report can print the threshold beside the figure it judged.
 */

/**
 * The plugin's name, as the manifest spells it: what the debug log files its
 * lines under, and what a `ui.press` would carry.
 */
export const PLUGIN_NAME = 'clauget'

/**
 * What every line the mod writes begins with, so the transcript and the debug
 * log both say whose figure it is.
 */
export const MARK = 'clauget'

/**
 * The cockpit tab's id, its title, and where it sits on the rail.
 */
export const TAB_ID = 'clauget'
export const TAB_TITLE = 'Clauget'
export const TAB_ORDER = 70

/**
 * The cockpit's own pane id, and the key of the node a bodyless tab's body
 * goes in: the cockpit draws the frame and the rail and leaves that node for
 * the plugin's own `ui.render` hook to fill.
 */
export const COCKPIT_PANE = 'cockpit'
export const SLOT_KEY = 'cockpit:body'

/**
 * What the pane's frame takes from the body: the columns its padding holds,
 * and the rows the cockpit's rail and frame keep.
 */
export const BODY_PAD_COLUMNS = 2
export const COCKPIT_CHROME_ROWS = 2

/**
 * The store key a session's record is kept under, prefix and all.
 */
export const STORE_PREFIX = 'clauget.session.'

/**
 * The shape of the record the store and the journal hold. A record written by
 * another version is not read: it is dropped and the session starts empty,
 * which is the one behaviour a corrupt state must have.
 */
export const KEPT_VERSION = 1

/**
 * How many session records stay in the store: the current one and the last
 * few, oldest dropped first. The store refuses past 4 MiB of JSON in all, so
 * a mod that keeps every session it ever saw would one day fail to write.
 */
export const KEPT_SESSIONS = 8

/**
 * The folder under the home directory the journal is written in, and the
 * extension of one session's file.
 *
 * `$.fs` has no `delete`: a file written here stays. Nothing in the mod
 * promises otherwise, and the README says so.
 */
export const JOURNAL_DIR = '.claude/clauget'
export const JOURNAL_EXT = '.json'

/**
 * How many steps stay in the list, and how many misses. A long session can
 * run to thousands of steps; the totals are kept apart from the list, so what
 * falls off the end is only the detail, never a figure.
 */
export const STEPS_CAP = 2_000
export const MISSES_CAP = 200

/**
 * The prompt cache's short time to live, in milliseconds: the wait past which
 * a prefix has to be written again.
 *
 * The engine names the live one (`cache_ttl` on `classic.PreModelSwitch`, five
 * minutes or one hour). Until a hook reads it — that is the fiche the plan
 * calls T58 — this is the assumption the classifier states rather than hides.
 */
export const CACHE_TTL_MS = 300_000

/**
 * What makes a cache write a miss rather than the ordinary tail of a step.
 *
 * A step normally writes the last tool result into the cache: a few hundred
 * or a few thousand tokens. A miss writes the prefix itself. `MISS_SHARE` is
 * how much of the request's input the write has to be, and `MISS_MIN_TOKENS`
 * is the floor under which the question is not worth asking — a short early
 * request can write all of a tiny prefix and mean nothing by it.
 */
export const MISS_SHARE = 0.5
export const MISS_MIN_TOKENS = 2_000

/**
 * The output ceiling of an acknowledgement step: a request that relit the
 * whole prefix to say "done" in a line.
 *
 * Counted and never corrected. Guessing the model's answer instead of asking
 * for it would not be an economy, it would be fiction.
 */
export const ACK_MAX_OUTPUT = 60

/**
 * Where the ticket is written, as the manifest's row spells it.
 */
export const TICKET_TURN = 'turn'
export const TICKET_DEBUG = 'debug'
export const TICKET_OFF = 'off'

/**
 * How long after `engine.create` the module looks for a record of a session
 * already under way: a reload — a `/config` row written, a file saved while
 * the folder is watched — rebuilds `$` without starting the session over, and
 * this is the only moment the module has to notice.
 */
export const RESTORE_MS = 50

/**
 * The cap on a Bash result, as the manifest's row spells it: the bytes of
 * `stdout` the model reads at most. Zero, the default, is a cap that is off —
 * the mod then rewrites nothing, and every result goes through as the engine
 * made it, `ref` and all.
 */
export const CAP_OFF = 0

/**
 * The one tool the cap sits on in this version: the bench that proves a
 * rewrite takes, before any other tool gets a cap of its own.
 */
export const CAP_TOOL = 'Bash'

/**
 * The slash command that opens the report, and the one line the menu shows
 * for it. The report is the only place the mod asks for a counted breakdown.
 */
export const COMMAND_SPEC = {
  name: 'clauget',
  description: 'What this session cost, and what each provider of the prefix is worth',
  argumentHint: '[on | off | strict | later <prompt> | cancel]',
} as const

/**
 * The file the usage counters live in, under the journal's folder: one for
 * every session this machine runs, merged on each write rather than
 * overwritten, so two sessions at once do not erase each other's calls.
 */
export const USAGE_FILE = 'usage.json'
export const USAGE_VERSION = 1

/**
 * How many session ids a counter remembers, so a session is counted once per
 * provider even when two sessions write the file in turn.
 */
export const USAGE_SEEN = 16

/**
 * The store key the tool inventory and the instruction files' reading are
 * kept under: one key, overwritten by the session that writes it, because
 * `tool.describe` and `prompt.context` are asked once and a reload would
 * otherwise start with nothing.
 */
export const INVENTORY_KEY = 'clauget.inventory'

/**
 * Who provides what, as the bill names it when the engine has no plugin to
 * name: the engine itself, the person's instruction files, and a tool the
 * mod never saw described.
 */
export const ENGINE = 'engine'
export const INSTRUCTIONS = 'instructions'
export const UNDESCRIBED = '?'

/**
 * The break-even of deferring a provider's tools: what a read of the cached
 * prefix costs against an uncached token. A parameter the report prints, not
 * a price the mod knows: where the engine serves an amount, the engine is
 * right.
 */
export const READ_RATE = 0.1

/**
 * The shortest paragraph the duplicate finder compares, in characters once
 * its spaces are folded: a heading or a fence repeated in two files is not a
 * duplicate worth saying.
 */
export const DUPLICATE_MIN_CHARS = 40

/**
 * The levers on the prefix, as the manifest's row spells it. Off, the
 * default, the mod decides nothing and every description, listing, context
 * block and reminder goes through as the engine made it.
 */
export const LEVERS_OFF = 'off'
export const LEVERS_ON = 'on'

/**
 * The store key a session's policy is kept under: decided once, at the
 * session's start, and read back by a module rebuilt mid-session instead of
 * decided again — a policy that moved mid-session would spend the cache it
 * was meant to spare.
 */
export const POLICY_KEY = 'clauget.policy'

/**
 * The store key a session's record of the cuts is kept under, so the report
 * of a resumed session still has them.
 */
export const CUTS_KEY = 'clauget.cuts'

/**
 * The store key a session's record of the step levers is kept under.
 */
export const STEPS_KEY = 'clauget.steps'

/**
 * How much history a judgement of disuse needs: sessions counted on this
 * machine for a provider or a tool, sessions run in this project for an
 * agent type. Under it, nothing is deferred or withdrawn for want of use.
 */
export const POLICY_MIN_SESSIONS = 10

/**
 * How recent a use keeps a provider in front whatever its average says: one
 * of the last few sessions counted.
 */
export const RECENT_SESSIONS = 3

/**
 * The share of sessions under which a provider no report has weighed yet is
 * deferred: without its schemas' weight, the break-even cannot be computed,
 * and this is the conservative stand-in, printed as such.
 */
export const DEFER_P_FALLBACK = 0.1

/**
 * The share of sessions from which a tool the engine defers is put in front:
 * searching for it every time would cost a request more than it saves.
 */
export const FRONT_P = 0.8

/**
 * Calls to a tool the mod deferred, within one session, from which that
 * deferral lost: each call paid a search first. It is brought back in front
 * for the next session — never during this one.
 */
export const BRING_BACK_CALLS = 2

/**
 * The attachments that repeat word for word: the first of each goes whole,
 * the next ones identical to it go brief. Only the engine's own prose; a
 * hook's or a plugin's text is theirs.
 */
export const BRIEF_TYPES: readonly string[] = ['todo_reminder', 'plan_mode', 'auto_mode']

/**
 * The attachment the engine injects when the deferred list moves: counted as
 * what a deferral costs back.
 */
export const DELTA_TYPE = 'deferred_tools_delta'

/**
 * The ceiling on the mod's own context block, in bytes: it lists decisions,
 * and a list that outgrew this would cost more than the decisions save.
 */
export const BLOCK_MAX_BYTES = 600

/**
 * The cuts on what enters, as the manifest's row spells it: off, the
 * default, every tool result and every prompt goes in as the engine made it.
 */
export const CUTS_OFF = 'off'
export const CUTS_ON = 'on'

/**
 * The filing cabinet: where a result cut short is kept whole, and the size
 * past which it is not kept — and then not cut either, since a cut the model
 * could not undo by reading the file would be a loss, not an economy.
 */
export const FILES_DIR = 'files'
export const FILE_MAX_BYTES = 4 * 1024 * 1024

/**
 * The budgets, in bytes of the text the model reads, per kind of result.
 */
export const BASH_BUDGET = 8_000
export const GREP_BUDGET = 8_000
export const AGENT_BUDGET = 6_000
export const JSON_BUDGET = 8_000

/**
 * The least share of a text a cut must take away to be made. A cut invites a
 * reread of the whole, which costs more than the whole — the Read of the
 * filed text carries line numbers — so a cut that saves little is a bet with
 * a bad payout. Measured on 2.1.280: a Bash output of 9 459 bytes cut to
 * 6 257 was read back whole at 10 047 bytes, and the session came out 745
 * bytes heavier than the same task uncut.
 */
export const CUT_MIN_SHARE = 0.5

/**
 * Grep in content mode: the matches one file may show before the total is
 * counted, so one talkative file does not eat the budget of all the others.
 */
export const GREP_PER_FILE = 20

/**
 * The JSON diet of MCP results: arrays past this many items keep this many,
 * strings past this many characters are cut and say their length.
 */
export const JSON_ITEMS = 20
export const JSON_CHARS = 500

/**
 * A Read with no window of a file past this many lines gets its head and a
 * summary of its declarations first; the summary takes at most this many
 * bytes, the head this many lines.
 */
export const SUMMARY_MIN_LINES = 800
export const SUMMARY_HEAD_LINES = 60
export const SUMMARY_BUDGET = 3_000

/**
 * A re-read after an edit gets the changed span alone when the span is at
 * most this many lines and less than half the file.
 */
export const DIFF_MAX_LINES = 200

/**
 * A pasted block is filed when it has at least this many lines and bytes and
 * reads like a log rather than like prose: under this share of its lines end
 * a sentence.
 */
export const BLOB_MIN_LINES = 80
export const BLOB_MIN_BYTES = 8_000
export const BLOB_PROSE_SHARE = 0.2
export const BLOB_HEAD_LINES = 20
export const BLOB_TAIL_LINES = 10

/**
 * The levers on the steps, as the manifest's rows spell them: the explorer,
 * the smaller model for subagents, the loop guard, the effort and the model
 * switch guard under one row; the circuit breaker under its own, disarmed.
 */
export const STEPS_OFF = 'off'
export const STEPS_ON = 'on'

/**
 * The explorer (T43): a subagent whose prefix is a few thousand tokens where
 * the main thread's is a hundred thousand — read-only tools, no MCP server,
 * no skill, no CLAUDE.md, a small model and a bounded loop.
 */
export const EXPLORER = {
  name: 'explorer',
  description:
    'Read-only codebase search with a small context: finds files, symbols and usages with Read, Grep and Glob, and answers with paths, line numbers and a short conclusion. Prefer it for open-ended searches across the repository.',
  prompt: [
    'You search a codebase and report what you found. You have Read, Grep and Glob, nothing else.',
    'Search efficiently: narrow with Grep and Glob before reading, read only the lines you need.',
    'Answer with what was asked: file paths with line numbers, the relevant lines quoted briefly, and a two-line conclusion.',
    'If something cannot be found, say so and say where you looked. Never guess.',
  ].join('\n'),
  tools: ['Read', 'Grep', 'Glob'],
  mcpServers: [],
  skills: [],
  maxTurns: 12,
  model: 'haiku',
  omitClaudeMd: true,
} as const

/**
 * The explorer's type, as the Agent tool names it.
 */
export const EXPLORER_TYPE = 'clauget:explorer'

/**
 * The model the smaller-model rule gives a subagent (T45), and the types it
 * applies to by default: the read-only ones, where a smaller model loses
 * least.
 */
export const SMALL_MODEL = 'haiku'
export const SMALL_MODEL_AGENTS = 'Explore, clauget:explorer'

/**
 * The loop guard (T46): the shortest output worth comparing — two empty or
 * one-word outputs alike say nothing.
 */
export const LOOP_MIN_BYTES = 200

/**
 * The model switch guard (T48): a switch whose cache rewrite is estimated
 * above this many dollars, with the cache still warm, asks first.
 */
export const SWITCH_ASK_USD = 0.1

/**
 * The circuit breaker (T49): the fewest steps a turn may run before it can be
 * stopped, and how many times the median turn's steps the ceiling is.
 */
export const BREAKER_MIN_STEPS = 30
export const BREAKER_MEDIAN_FACTOR = 2

/**
 * The levers on the compaction, as the manifest's row spells it: off; on,
 * which lightens, instructs and proposes; auto, which also compacts itself
 * once a turn ends past the profitable point.
 */
export const COMPACTION_OFF = 'off'
export const COMPACTION_ON = 'on'
export const COMPACTION_AUTO = 'auto'

/**
 * The store key of the queue of results waiting for the compaction (T52):
 * pointers only — tool_use ids — never content.
 */
export const QUEUE_KEY = 'clauget.queue'

/**
 * The store key of what the compaction levers keep across a resume: the
 * windows read, the snapshot taken at the last compaction, the last summary,
 * the counters — ranges and figures, never content.
 */
export const COMPACTION_KEY = 'clauget.compaction'

/**
 * A tool result at least this long is substituted by its filing line when
 * the transcript is handed to the summarizer (T51), and queued for it when
 * it entered whole (T52).
 */
export const LIGHTEN_MIN_BYTES = 2_000

/**
 * The warm cache's last question (T53): what the fork is asked, how long it
 * may take before the compaction goes on without it, and how long its answer
 * may be once it is the summarizer's instructions.
 */
export const FACTS_PROMPT =
  'The conversation is about to be compacted. Without calling any tool, list in at most ten short lines the facts that must not be lost: decisions taken, constraints the person set, file paths and names that matter, what is left to do. Facts only, no preamble.'
export const FACTS_TIMEOUT_MS = 6_000
export const INSTRUCTIONS_MAX_BYTES = 3_000

/**
 * The profitable point of a compaction (T54), its hypotheses printed beside
 * it: the conversation's size after one — the last one measured, or this —
 * the summary's output tokens, and what an output token costs against an
 * uncached input one.
 */
export const COMPACT_AFTER_TOKENS = 20_000
export const SUMMARY_TOKENS = 4_000
export const OUTPUT_RATE = 5
export const WRITE_RATE = 1.25

/**
 * The brief a fresh session could start from instead of a resume (T57): its
 * ceiling in bytes.
 */
export const BRIEF_MAX_BYTES = 8_000

/**
 * The countdown of the warm cache (T58): how often it is redrawn, and how
 * many times at most before it stops on its own.
 */
export const COUNTDOWN_EVERY_MS = 15_000
export const COUNTDOWN_MAX_TICKS = 25

/**
 * The one lever (T63): the manifest row every other row falls back on, its
 * values, and the store key that remembers what the command last wrote — so
 * `/clauget on` twice writes once.
 */
export const ECONOMY_OFF = 'off'
export const ECONOMY_ON = 'on'
export const ECONOMY_STRICT = 'strict'
export const ECONOMY_KEY = 'clauget.economy'
export const ECONOMY_ROW = 'clauget.economy'

/**
 * The tiers of economy (T61): the share of the fullest window from which each
 * tier starts, how far below it the share must fall to step down, and how
 * many turns must pass between two changes.
 */
export const TIER_UP = [60, 80, 92] as const
export const TIER_DOWN_MARGIN = 10
export const TIER_MIN_TURNS = 3

/**
 * The forecast (T62): how far back the rate is read.
 */
export const FORECAST_WINDOW_MS = 60 * 60 * 1000

/**
 * The headless profile (T60): what a session nobody watches divides the cut
 * budgets by.
 */
export const HEADLESS_BUDGET_DIVISOR = 2

/**
 * Every word the mod writes, in one place. English, and telegraphic: these
 * lines are read by a person, but the rule they follow is the one that keeps
 * the mod's own column small — nothing the mod writes is ever sent to the
 * model, and nothing it writes is longer than the figure it carries.
 */
export const TEXTS = {
  /**
   * The name of each token counter, as the API reports it.
   */
  read: 'read',
  wrote: 'wrote',
  in: 'in',
  out: 'out',
  steps: 'steps',
  step: 'step',
  turn: 'turn',
  main: 'main',
  agents: 'subagents',
  acks: 'acknowledgement steps',
  engine: 'engine',
  counted: 'counted',
  /**
   * The mod's own column.
   */
  spent: 'mod',
  silent: 'nothing shown to the model',
  shown: 'shown to the model',
  calls: 'model calls',
  dispatches: 'engine calls',
  /**
   * What a cache miss is called, and what each cause is called.
   */
  miss: 'cache miss',
  cold: 'first request, nothing to read yet',
  ttl: 'wait past the cache TTL',
  model: 'model changed',
  invalidate: 'invalidation',
  config: 'configuration written',
  reload: 'plugin reloaded',
  unknown: 'cause not seen',
  /**
   * The cap: the marker the model reads where the middle went, and the line
   * the debug log gets for each rewrite.
   */
  lines: 'lines',
  bytes: 'bytes',
  cut: 'cut',
  capped: 'stdout capped',
  /**
   * The bill, the break-even, and the instruction files.
   */
  bill: 'bill',
  tokEst: 'tok (est.)',
  inWindow: 'in the window',
  deferredApart: 'deferred, outside it',
  deferredShort: 'deferred',
  countedFull: 'counted by the token-count API',
  countedSummary: 'estimated locally',
  tools: 'tools',
  agentTypes: 'agent types',
  skills: 'skills',
  files: 'files',
  rest: 'rest: system prompt, built-in tools, messages',
  overlap: 'the details ran past the total by',
  callsCounted: 'calls',
  sessions: 'sessions (counted)',
  breakEven: 'deferral break-even, computed and not applied',
  readRate: 'read rate',
  stepsPerSession: 'steps a session',
  prefix: 'prefix',
  searchIsSchema: 'search step = the schema',
  front: 'in front',
  wouldDefer: 'deferring would be cheaper',
  wouldKeep: 'in front is cheaper',
  staysDeferred: 'deferred already, and rightly',
  wouldFront: 'deferred now, in front would be cheaper',
  instructions: 'instruction files',
  noInstructions: 'none seen this session',
  duplicates: 'paragraphs repeated',
  importedBy: 'imported by',
  twice: 'repeated',
  /**
   * The levers: the brief form of a repeated reminder, the context block, and
   * the ticket's line of what deferring cost back.
   */
  brief: 'unchanged since first given above; still in force.',
  blockHead: 'Context economy (clauget) decided at session start:',
  blockDeferred: 'deferred tools of',
  blockFronted: 'tools kept in front',
  blockAgents: 'agent types not offered',
  blockCommands: 'commands hidden',
  blockScoped: 'instruction files out of this directory left out',
  blockSearch: 'A deferred tool still works: search for it by name first.',
  deferCost: 'deferral cost',
  deltas: 'deferred-list reminders',
  deferredCalls: 'calls to tools the mod deferred',
  repeats: 'reminders served brief',
  policy: 'levers',
  policyOff: 'off',
  sections: 'system prompt sections',
  /**
   * The cuts: what the model reads where something was left out, and the
   * lines the ticket and the report print.
   */
  filed: 'whole output',
  readIt: 'read it for the rest',
  cutLines: 'lines cut',
  keptErrors: 'error lines kept',
  perFile: 'matches per file kept',
  alreadyShown: 'lines already shown earlier in this conversation left out',
  jsonItems: 'more items of the same shape',
  jsonChars: 'chars',
  conclusion: 'the report\'s opening cut; its conclusion kept',
  summaryHead: 'declarations, with their line numbers',
  summaryRest: 'read with offset and limit for any part',
  unchangedSince: 'is unchanged since you read it earlier in this conversation',
  onlyNew: 'are as you read them earlier in this conversation; only the rest is shown',
  changedSpan: 'changed since you read it earlier in this conversation; every other line is as you read it then',
  shiftedBy: 'lines after it shifted by',
  pasted: 'pasted block filed',
  cutsLine: 'cuts',
  rereads: 'targeted rereads',
  noiseRules: 'noise removed',
  /**
   * The steps: the explorer's proposal, the loop note, the switch question,
   * the breaker's line and the report's.
   */
  explorerHint:
    'An open-ended search like this one can run in the clauget:explorer agent, whose small context makes each of its steps far cheaper than one of yours; only its report comes back.',
  sameOutput: 'same output, byte for byte, as at step',
  sameOutputs: 'same output, byte for byte, as at steps',
  loopAdvice: 'repeating the call will not change it',
  switchAsk: 'Switching model now rewrites the cached context',
  breaker: 'turn stopped by the circuit breaker at step',
  breakerResume: 'resume with: continue where you stopped',
  stepsLine: 'steps',
  /**
   * The compaction: the line a substituted result reads as, what the
   * summarizer is told, the proposal, the resume's two prices, the countdown.
   */
  substituted: 'tool result filed before the compaction',
  factsHead: 'Facts to keep, from the conversation before it was compacted:',
  filesHead: 'Files read before the compaction (the model can Read them again; clauget serves the parts already read first):',
  compactProposal: 'compacting now would pay: the context is past the profitable point',
  precompute: 'clauget: no precomputed summary while the person works',
  resumePrices: 'resuming re-writes the cached context',
  briefAlt: 'a fresh session could start from the brief instead',
  cacheWarm: 'cache warm',
  cacheCold: 'cache expired: the next request re-writes the context',
  assumedTtl: 'assumed 5 min TTL',
  digestHead: 'read before the compaction; the lines served are the ones read then',
  compactionLine: 'compaction',
  /**
   * The pilot: the switch, the tiers, the forecast, the deferred work.
   */
  already: 'already',
  economySet: 'economy set to',
  economyNext: 'the levers follow from the next session; this one keeps the policy it started with',
  tier: 'economy tier',
  tierNames: 'none, tighter cuts, early compaction, warn and decide nothing alone',
  tierWarn: 'the plan window is nearly full; the mod no longer compacts or stops a turn on its own',
  forecast: 'at the rate of the last hour',
  forecastMethod: 'straight line fitted over the last hour; the range is the slope of its first and second halves',
  later: 'deferred',
  laterNone: 'no deferred prompt',
  laterNoReset: 'no window reset is known yet: nothing deferred',
  laterCancelled: 'deferred prompts cancelled',
  laterNote: 'it will start by itself, at that time, even at night',
  measured: 'window',
  cost: 'cost',
  noMeasure: 'no measurement yet',
  /**
   * What the report and the tab say of themselves.
   */
  title: 'What every request of this session read, wrote and produced.',
  noSteps: 'No model request has finished yet.',
  restored: 'state unreadable, starting empty',
  method: 'Token figures are the API\'s own, as the engine reports them; nothing here is estimated.',
} as const
