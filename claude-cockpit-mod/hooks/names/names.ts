/**
 * Every name, number and line the cockpit shows, in one place: what the pane
 * is called, what the store keeps it under, and the limits its tallies hold.
 */

/**
 * The plugin's name, as the manifest spells it: what a `ui.press` carries and
 * what a pane's id is namespaced by.
 */
export const PLUGIN_NAME = 'cockpit'

/**
 * The pane's id, the `requestId` its `ui.render` carries.
 */
export const PANE_ID = 'cockpit'

/**
 * The command that opens and closes the pane.
 */
export const COMMAND_NAME = 'cockpit'

/**
 * The pane's title, drawn in its frame by the surface.
 */
export const PANE_TITLE = 'Cockpit'

/**
 * The key the band's button answers to: what a `ui.press` on it carries, and
 * what another plugin would name it by in a matcher.
 */
export const BAND_KEY = 'cockpit'

/**
 * The letter that presses that button while the band above the prompt holds
 * the keys — a click in it, or ctrl+x tab — and never from the composer.
 */
export const BAND_HOTKEY = 'c'

/**
 * The store key the open state is kept under, so a resumed session opens the
 * pane the person left open.
 */
export const STORE_OPEN_KEY = 'cockpit.isOpen'

/**
 * The store key the selected tab is kept under.
 */
export const STORE_TAB_KEY = 'cockpit.tab'

/**
 * What a session's own record is keyed by, its id appended: the store is the
 * plugin's own and outlives every session, so what belongs to one session is
 * filed under it rather than under the plugin.
 */
export const STORE_SESSION_PREFIX = 'cockpit.session.'

/**
 * The shape of that record, stamped on it: one written by another shape is
 * dropped rather than read into fields that have moved since.
 */
export const KEPT_VERSION = 2

/**
 * The most session records the store holds at once, the oldest dropped
 * first; the running session is never one of them.
 */
export const SESSIONS_MAX = 8

/**
 * The terminal width from which `/cockpit` docks the pane beside the
 * transcript, the width the built-in diff sidebar opens from.
 *
 * Narrower, the pane still opens, as a dialog above the prompt.
 */
export const DOCK_MIN_COLUMNS = 110

/**
 * The rows an inline pane opens with, tall enough for the rail and a body.
 */
export const DIALOG_ROWS = 18

/**
 * The cells the pane's frame keeps off a tab's body, one each side.
 */
export const BODY_PAD_COLUMNS = 2

/**
 * The rows the rail, its rule and the footer keep off a tab's body.
 */
export const CHROME_ROWS = 4

/**
 * The key of the node a bodyless tab's body goes in — every tab another
 * plugin contributes, since a `render` cannot cross from that plugin's
 * environment to this one. `CockpitSlot`, in `types/index.d.ts`, is the
 * contract; this is the same string, where the pane draws it.
 */
export const BODY_KEY = 'cockpit:body'

/**
 * The rows the card under a list takes: its four fields, the frame around
 * them, and the blank line that sets it apart from the list.
 */
export const CARD_ROWS = 7

/**
 * The most recent tool calls the Tools tab keeps.
 */
export const RECENT_MAX = 12

/**
 * The most files the Files tab keeps, heaviest first; the rest are dropped
 * as they fall off the end.
 */
export const FILES_MAX = 80

/**
 * The most turns the context sparkline keeps, its oldest dropped first.
 */
export const HISTORY_MAX = 240

/**
 * How often the Agents tab asks `$.agent.list()` while it is on screen.
 */
export const AGENT_POLL_MS = 2_000

/**
 * How long a redraw waits for the calls behind it, so a burst of tool calls
 * is one draw and not thirty.
 */
export const REDRAW_MS = 120

/**
 * The most agents the Agents tab keeps, the oldest dropped first; the tab
 * keeps the ones that finished, which `$.agent.list()` stops listing.
 */
export const AGENTS_MAX = 40

/**
 * How often the Session tab reads the session again while it is on screen:
 * the context, the cost and how much of each plan window is spent, and the
 * clock the windows reset on, which counts down between turns.
 *
 * `breakdown: 'summary'` is estimated locally and sends no request, so this
 * costs the session nothing but the reading.
 */
export const SESSION_POLL_MS = 30_000

/**
 * The closest and the furthest apart two of those readings may be set: under
 * five seconds the tab would be re-reading the session between keystrokes,
 * and past five minutes a countdown on screen would be further out than the
 * window it counts down to.
 */
export const SESSION_MIN_MS = 5_000
export const SESSION_MAX_MS = 300_000

/**
 * The argument `/cockpit` takes to turn the machine's readings on and off
 * for this session, without writing the option the session started under.
 */
export const HOST_ARG = 'host'

/**
 * How often the machine is read while the Session tab is on screen and the
 * readings are on: one command, or two where a graphics card answered.
 *
 * Slower than the other polls on purpose. Every figure here costs a process,
 * and on Windows the one shell that answers the processor and the memory
 * takes a second and a half of it.
 */
export const HOST_POLL_MS = 5_000

/**
 * The closest and the furthest apart two readings of the machine may be set,
 * whatever the option says: under two seconds a Windows shell would still be
 * running when the next reading starts, and past a minute a figure on screen
 * would be older than the tab it is drawn in.
 */
export const HOST_MIN_MS = 2_000
export const HOST_MAX_MS = 60_000

/**
 * How long a reading's command is given before the cockpit gives up on this
 * pass: short of the next one, so a slow host skips a reading rather than
 * queueing them.
 */
export const HOST_TIMEOUT_MS = 4_000

/**
 * How often the Files tab asks git what it makes of the files it lists,
 * while it is the tab on screen.
 */
export const GIT_POLL_MS = 4_000

/**
 * How long git is given before the cockpit gives up on this pass; a repo
 * slow enough to miss it is one the tab draws without status letters.
 */
export const GIT_TIMEOUT_MS = 5_000

/**
 * The statuses an agent is still working under; every other status the
 * engine reports is one it ended on.
 */
export const LIVE_STATUSES: readonly string[] = [
  'running',
  'pending',
  'queued',
  'starting',
]

/**
 * What the tab calls an agent the engine stopped listing while it was still
 * running: `$.agent.list()` answers the session's agents so far, so a row
 * that leaves it left for a reason the cockpit was not told. It is not a
 * status the engine reports, and it is not one the cockpit invents about
 * work it can still see.
 */
export const GONE_STATUS = 'gone'

/**
 * The tools whose input names a file the Files tab counts, by how they touch
 * it: what Claude read, and what Claude wrote.
 */
export const FILE_TOOLS: Readonly<Record<string, 'read' | 'write'>> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
}

/**
 * The shell commands that read the files they are handed, so a session that
 * does its reading through `Bash` still fills the Files tab.
 */
export const BASH_READERS: readonly string[] = [
  'awk',
  'cat',
  'diff',
  'egrep',
  'fgrep',
  'grep',
  'head',
  'jq',
  'less',
  'more',
  'nl',
  'od',
  'rg',
  'sed',
  'sha1sum',
  'md5sum',
  'sort',
  'stat',
  'tail',
  'uniq',
  'wc',
  'xxd',
]

/**
 * The shell commands that write the files they are handed.
 */
export const BASH_WRITERS: readonly string[] = [
  'cp',
  'install',
  'ln',
  'mv',
  'rm',
  'tee',
  'touch',
  'truncate',
]

/**
 * The commands whose first operand is a script or a pattern rather than a
 * file: `sed -n '1,20p' a.ts` names one file, not two.
 */
export const BASH_SCRIPT_FIRST: readonly string[] = [
  'awk',
  'egrep',
  'fgrep',
  'grep',
  'jq',
  'rg',
  'sed',
]

/**
 * The commands whose last operand is the one they write, the ones before it
 * the ones they read.
 */
export const BASH_LAST_WRITES: readonly string[] = ['cp', 'install', 'ln', 'mv']

/**
 * The words a command may hide behind, skipped to reach the real one.
 */
export const BASH_PREFIXES: readonly string[] = [
  'command',
  'env',
  'exec',
  'nice',
  'nohup',
  'sudo',
  'time',
  'xargs',
]

/**
 * The most paths one shell command may credit, so a `rm` over a hundred
 * files does not become the whole tab.
 */
export const BASH_MAX_PATHS = 8

/**
 * The reading past which a plan window is drawn as spent rather than as a
 * figure among others.
 */
export const LIMIT_HOT_PERCENT = 80

/**
 * The most models the Usage tab keeps rows for, the lightest dropped: a
 * session runs on one or two, and a bench run on a handful.
 */
export const MODELS_MAX = 6

/**
 * The `/config` row that says which tabs the rail leaves out, by the key the
 * engine gives a plugin's `userConfig` field: `<plugin>.<field>`.
 */
export const CONFIG_TABS_KEY = `${PLUGIN_NAME}.hideTabs`

/**
 * The `/config` row that says which language the cockpit draws in.
 */
export const CONFIG_LANG_KEY = `${PLUGIN_NAME}.language`

/**
 * The windows the Stats tab reads its figures over, in the order its
 * buttons sit. The ids are the module's and never a translator's; the
 * titles beside them are, and live in the language bundle under the same
 * ids.
 */
export const STATS_RANGES = ['all', 'd30', 'd7'] as const

/**
 * What separates two ids on that line. A comma is what anyone types; a
 * newline and a semicolon are what a line pasted from somewhere else brings.
 */
export const TABS_SEPARATOR = /[,;\n]/

/**
 * What the skill listing's cut is held under: the choice lives beside the
 * tabs' own, and the list is not the tab, so it is keyed apart from `usage`
 * in case the tab ever grows a second list of its own.
 */
export const SKILLS_LIST = 'usage.skills'

/**
 * The most providers the Usage tab lists skill listings for while the list
 * is cut. The rest are behind the `Show more` row under it, and the total
 * line counts every one of them either way.
 */
export const PLUGINS_MAX = 8

/**
 * The last lines of the history file the Stats tab reads. The file grows for
 * as long as the person uses Claude Code and only its tail is ever drawn, so
 * a machine with a hundred thousand prompts behind it costs what one with a
 * thousand does.
 */
export const STATS_MAX_LINES = 20_000

/**
 * The columns the contribution calendar draws at most: a year of weeks.
 */
export const CALENDAR_WEEKS = 53

/**
 * The shades a calendar cell is drawn in, quietest first: a day with no
 * prompt, then the four bands a busy day is read against.
 */
export const CALENDAR_SHADES: readonly number[] = [
  0x2f3136, 0x5a3a2e, 0x8f4a32, 0xc45a33, 0xf07038,
]

/**
 * Where the history file sits under the person's home directory, the one
 * file the Stats tab reads.
 */
export const HISTORY_PATH = '.claude/history.jsonl'
