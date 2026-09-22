/**
 * The `$.cockpit` noun as every caller sees it: the one contract for the
 * noun, its types declared on the `claude-code` module and the noun declared
 * on `EngineInterface`.
 *
 * The cockpit mod adds the noun in the `engine.create` fold and checks its
 * return against `EngineInterface['cockpit']`; its own hooks import these
 * types from this folder, and a plugin that contributes a tab reads them from
 * `claude-code` once `/plugin-types` has copied this file beside the engine's
 * own declarations. Nothing here is imported, so it stands on its own.
 *
 * A tab is the unit: a plugin hands the cockpit an id, a title and a `render`
 * that draws the tab's body from the elements of the surface the pane is
 * drawn on, and the cockpit owns the pane, the rail, the keys and the focus.
 */

declare module 'claude-code' {
  /**
   * A pane of tabs other plugins fill: the cockpit's own tabs and every one a
   * plugin adds, drawn side by side behind one `/cockpit`.
   *
   * Present wherever the cockpit mod is seated. A plugin that depends on it
   * registers its tabs from its own `session.start` hook, which the engine
   * awaits before the first prompt, so the rail is complete by turn one.
   */
  export type Cockpit = {
    /**
     * Adds a tab, or replaces the one already registered under its `id`.
     *
     * Registering does not open the pane: the person opens it with
     * `/cockpit`, or the plugin calls `show`. The tab's `render` runs on
     * every draw of the pane while it is the selected one, never otherwise.
     *
     * @param tab the tab's id, its title, and how it draws
     * @example
     * await $.cockpit.tab({
     *   id: "tests",
     *   title: "Tests",
     *   render: draw => {
     *     const { Text } = draw.ui
     *     return <Text>{failing.length} failing</Text>
     *   },
     * })
     */
    tab: (tab: CockpitTab) => Promise<void>

    /**
     * Drops a tab by id; drops nothing where no tab holds that id.
     *
     * The rail closes over the gap, and the selection moves to the first tab
     * when the dropped one held it.
     *
     * @param id the tab's id
     */
    drop: (id: string) => Promise<void>

    /**
     * Opens the pane, on the named tab when one is named.
     *
     * Docked beside the transcript where the terminal is in its fullscreen
     * layout and wide enough, a dialog above the prompt otherwise. Opening an
     * open pane on another tab selects that tab.
     *
     * @param id the tab to select, or the selected one where absent
     */
    show: (id?: string) => Promise<void>

    /**
     * Closes the pane; closes nothing where it is already closed.
     */
    hide: () => Promise<void>

    /**
     * Flags a tab in the rail, so work that lands on a tab the person is not
     * looking at says so without stealing the view.
     *
     * A number draws as a count beside the title, `"dot"` as one mark, and
     * `null` clears the flag; selecting a tab clears its own.
     *
     * One input, as every verb of `$` takes — the engine refuses a second,
     * *takes one input, its event's e* — so the tab and its flag travel in
     * one object.
     *
     * @param flag the tab's id, and the flag or null to clear it
     * @example
     * await $.cockpit.mark({ id: "tests", badge: 3 })
     */
    mark: (flag: CockpitMark) => Promise<void>

    /**
     * Asks the pane to draw again, for a tab whose own state changed.
     *
     * The cockpit already redraws on its own events; a tab that keeps state
     * of its own calls this when that state moves.
     */
    redraw: () => Promise<void>

    /**
     * Every tab in rail order, with the selected one and its flag: what a tab
     * reads to know whether it is the one on screen.
     */
    tabs: () => Promise<readonly CockpitTabInfo[]>
  }

  /**
   * What `$.cockpit.tab` takes: a tab of the pane.
   */
  export type CockpitTab = {
    /**
     * The tab's id, unique in the pane: the name `/cockpit <id>` selects it
     * by, and the key `drop`, `show` and `mark` name it by.
     */
    id: string

    /**
     * The tab's title in the rail, a word or two.
     */
    title: string

    /**
     * Where the tab sits in the rail, low first; tabs of equal order keep
     * their registration order, and the cockpit's own sit at 0, 10, 20, 30.
     */
    order?: number

    /**
     * Draws the tab's body into the pane's box.
     *
     * Returns a tree built from `draw.ui`, the element table of the surface
     * the pane is drawn on, or null for a tab with nothing to show, which
     * draws the pane's own empty line instead. It runs inside the pane's
     * render dispatch: read state, draw, and leave the work to a timer.
     *
     * **Only a tab of the cockpit's own module may have one.** Each plugin's
     * hooks run in an environment of its own, and a call on another plugin's
     * noun crosses that boundary: its arguments must be structured-cloneable,
     * and a function is not — the engine refuses the whole call, *the object
     * can not be cloned*. So a plugin registers `{ id, title, order }` and
     * draws its body itself; `CockpitSlot` says how.
     *
     * @param draw the elements, the box, and how the pane sits
     */
    render?: (draw: CockpitDraw) => RenderElement | null

    /**
     * Run when the tab becomes the selected one, before its first draw.
     *
     * Where a tab's data costs something to gather, gather it here and call
     * `$.cockpit.redraw` when it lands, rather than on every draw.
     */
    onShow?: () => void | Promise<void>
  }

  /**
   * What a tab's `render` is handed: the surface's elements and the box the
   * pane draws into, narrowed on `surface`.
   *
   * A tab that draws a `Raster` or an `Image` narrows to the terminal first
   * (`if (draw.surface !== "terminal") return null`), since no other surface
   * has them.
   */
  export type CockpitDraw = {
    [P in RenderSurface]: CockpitDrawOf<P>
  }[RenderSurface]

  /**
   * One surface's `CockpitDraw`.
   */
  export type CockpitDrawOf<P extends RenderSurface> = {
    /**
     * The surface the pane is drawn on.
     */
    surface: P

    /**
     * That surface's element table, as `$.ui.resolve` answers it.
     */
    ui: Elements[P]

    /**
     * The cells the tab's body has across, the pane's own `bodyColumns` less
     * the frame the cockpit keeps.
     */
    columns: number

    /**
     * The rows the tab's body has, the pane's own less the rail and frame.
     */
    rows: number

    /**
     * Whether the pane holds the keys.
     */
    isFocused: boolean

    /**
     * How the pane sits: docked beside the transcript, or inline above the
     * prompt as a dialog.
     */
    placement: 'dock' | 'inline'
  }

  /**
   * The key of the node a bodyless tab's body goes in.
   *
   * A plugin that contributes a tab registers three plain fields and draws
   * the body from its own `ui.render` hook on the cockpit's pane
   * (`{ component: "Pane" }`, `e.requestId === "cockpit"`). Whether that hook
   * sits inside the cockpit's or outside it is nothing either of them
   * chooses, so the plugin asks `next(e)` first and reads the answer off the
   * tree that comes back:
   *
   * - it holds a node keyed `cockpit:body` — the cockpit has drawn, this hook
   *   is outside it, and the body replaces that node;
   * - it does not — the cockpit has yet to draw, this hook is inside it, and
   *   the body is returned keyed `cockpit:body`, which the cockpit finds and
   *   puts in its pane.
   *
   * `$.cockpit.tabs()` says which tab is selected, and answers plain data, so
   * it crosses where a `render` does not.
   *
   * @example
   * on("ui.render", { component: "Pane" }, async ($, e, next) => {
   *   const below = await next(e)
   *   if (e.requestId !== "cockpit") return below
   *   const rail = await $.cockpit.tabs()
   *   if (rail.find(t => t.id === "tests")?.isSelected !== true) return below
   *   const body = draw(await $.ui.resolve(e))   // keyed "cockpit:body"
   *   return foundIn(below, "cockpit:body") === null ? body : filled(below, body)
   * })
   */
  export type CockpitSlot = 'cockpit:body'

  /**
   * What `$.cockpit.mark` takes: which tab, and what to draw beside it.
   */
  export type CockpitMark = {
    /**
     * The tab's id.
     */
    id: string

    /**
     * The flag, or null to clear it.
     */
    badge: CockpitBadge | null
  }

  /**
   * A tab's flag in the rail: a count, or one mark.
   */
  export type CockpitBadge = number | 'dot'

  /**
   * One tab as `$.cockpit.tabs()` lists it.
   */
  export type CockpitTabInfo = {
    id: string
    title: string
    order: number
    isSelected: boolean
    badge: CockpitBadge | null
  }

  interface EngineInterface {
    /**
     * The tabbed pane other plugins fill; present where the cockpit mod is
     * seated.
     */
    cockpit: Cockpit
  }
}
