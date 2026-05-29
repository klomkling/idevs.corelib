import {
  DecimalEditor,
  Decorators,
  type EntityGrid,
  IntegerEditor,
  LookupEditor,
  ServiceLookupEditor,
  StringEditor,
} from '@serenity-is/corelib'
import type { ArgsCell, IEventData } from '@serenity-is/sleekgrid'
import { hasField, type GridColumn, type GridColumnWithField } from './_columnShape'

// Re-export `hasField` + `GridColumnWithField` as part of the public
// editor-controller surface so consumers writing custom renderers via
// `registerCellEditor(...)` can defensively re-narrow `column.field`
// using the same predicate the dispatcher uses internally. Keeping
// `_columnShape.ts` itself `@internal` (not re-exported from the
// barrel) but exposing the two consumer-facing pieces here.
export { hasField, type GridColumnWithField }

// Re-export the local structural shape used to be defined inline here.
// See _columnShape.ts for the duplicate-sleekgrid rationale and the
// shared shape's invariants.

/**
 * In-cell editor controller for an EntityGrid.
 *
 * Subscribes to a SlickGrid instance's click / dblClick / activeCellChanged
 * / activeCellPositionChanged / keyDown events to load editors directly
 * into the active cell on demand. Supports Integer, Decimal, Boolean,
 * Lookup, ServiceLookup, and plain-string editors out of the box, and
 * exposes a public `registerCellEditor()` hook for additional types.
 *
 * Replaces PowerACC's `GridEditController`. Hardening vs source:
 *   - **XSS**: every `targetElement.innerHTML = userValue` write in the
 *     editor change handlers is replaced with `targetElement.textContent`.
 *     The source rendered values straight to innerHTML, which would
 *     execute embedded HTML/script for the String editor case (any text
 *     a user types into the editor); the numeric / lookup cases were
 *     safer in practice but still wrote via innerHTML.
 *   - **Private field access via `slickGrid["_options"]`**: the source
 *     read `editable` / `autoEdit` / `enableCellNavigation` via bracket
 *     access on a private-by-convention property. We use SlickGrid's
 *     public `getOptions()` instead.
 *   - **PowerACC-specific case (`CustomerProductPriceEditor`)**: the
 *     source hardcoded a switch case for a PowerACC-domain editor under
 *     `case "PowerACC.MasterData.CustomerProductPriceEditor":`. Dropped
 *     entirely. Custom editor dispatch is now via the public
 *     `registerCellEditor(editorType, render)` registry — consumers
 *     register their own editor types without subclassing or patching
 *     this file.
 *   - **No `destroy()` in source**: the controller subscribed to 5
 *     SlickGrid event emitters and never unsubscribed. Long-lived host
 *     grids would accumulate dead subscriptions across controller
 *     instances and the dead `this` references would leak. Added
 *     `destroy()` that unsubscribes all subscriptions.
 *   - **Empty `try { ... } catch (e) {}` around `firstElementChild.remove()`**:
 *     `Element.remove()` doesn't throw under any spec-defined condition.
 *     Dropped the try/catch; if the element is null, we already null-
 *     guard before reading.
 *   - **`parseInt(stringValue ? stringValue : "0").valueOf()`**:
 *     `.valueOf()` on a Number is a no-op, and the ternary is just
 *     `stringValue || "0"`. Simplified.
 *   - **`parseInt` without radix**: now passes `10` explicitly. The
 *     source's parseInt would coerce leading "0x..." or "0o..." inputs
 *     unexpectedly under older engines.
 *   - **`args.criteria` mutation via `args["criteria"] = null`**: source
 *     stored criteria from `onActiveCellPositionChanged` into a class
 *     field and then null-ed the original. Kept the consume-once pattern
 *     but documented.
 *   - **`column.sourceItem` null checks**: source assumed `sourceItem`
 *     always present. Added explicit guards.
 *   - **Decimal value formatting**: source called
 *     `numericValue.toLocaleString('en-US', ...)`. Hardcoded locale is
 *     wrong for non-US deployments; preserved for behavior parity but
 *     documented as a follow-up.
 */

/**
 * Type alias for the `grid` field on the controller's options.
 *
 * Typed as `EntityGrid<any, any>` rather than `EntityGrid<unknown, unknown>`
 * because the latter is invariant through Serenity's `RemoteView`
 * callbacks: `EntityGrid<TItem, P>` references `RemoteViewProcessCallback
 * <TItem>` and related signatures that put TItem in both covariant and
 * contravariant positions. Under strict TypeScript a consumer's
 * `EntityGrid<MyRow, MyOpts>` is NOT assignable to
 * `EntityGrid<unknown, unknown>` and the obvious call site
 * `new IdevsGridEditController({ grid: this })` from inside an
 * EntityGrid subclass fails to type-check. `any` is bivariant and
 * matches Serenity's own public-API convention for grid parameters;
 * the controller's internals never read TItem/P off the grid type, so
 * the concession is purely at the type boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see JSDoc above
type IdevsGridEditControllerGrid = EntityGrid<any, any>

/**
 * Public constructor options.
 *
 * Generic on `TGrid` with the loose default. The default matches the
 * historical untyped signature so existing call sites
 * (`new IdevsGridEditController({ grid: this })`) continue to compile
 * without changes; strict-TS consumers passing their own
 * `EntityGrid<MyRow, MyOpts>` get the precise grid type back at use
 * sites that read `controller`-private fields via subclassing.
 *
 * The controller's internals never read `TItem` / `P` off the grid type
 * (they cast through `unknown` at the column / item boundary anyway),
 * so widening or narrowing TGrid is purely a public-surface concern.
 */
export type IdevsGridEditControllerOptions<
  TGrid extends IdevsGridEditControllerGrid = IdevsGridEditControllerGrid,
> = {
  grid: TGrid
}

/**
 * Render function signature for a custom cell editor.
 *
 * **Lifecycle: the renderer is invoked ONLY for fresh mounts.** The
 * controller handles toggle-off automatically before dispatch — if a
 * marked editor is already mounted in the cell when the user clicks
 * again, the controller removes it and bails out without calling the
 * renderer. Custom renderers do not need to call any "remove existing
 * editor" helper themselves; they can assume the target is ready for
 * a fresh mount.
 *
 * Inputs:
 *   - `target`: the cell DOM element. Render via the
 *     `appendEditorChild(node)` callback in this params object (NOT
 *     a raw `target.appendChild(...)`) so the controller can later
 *     distinguish your editor node from any formatter markup that
 *     the host grid put inside the same cell. Custom renderers that
 *     `target.appendChild(...)` directly will work the FIRST time
 *     but will be treated as a toggle-off on the next click (the
 *     controller can't tell their child apart from formatter
 *     markup without the marker the helper applies).
 *   - `item`: the data row (the editor mutates this in place on commit).
 *   - `args`: SlickGrid's cell context for the active edit.
 *   - `column`: SlickGrid's column definition (carries `sourceItem` /
 *     `editorParams` from the Serenity descriptor pipeline). Typed as
 *     `GridColumnWithField` because the dispatcher guarantees a
 *     non-empty `column.field` before invoking the renderer — so
 *     `item[column.field] = ...` works without a `column.field as string`
 *     cast.
 *   - `criteria`: any single-shot criteria queued by
 *     `onActiveCellPositionChanged` for this cell. Consume by setting it
 *     on the editor's options before constructing — the controller has
 *     already cleared its own copy.
 *   - `notifyCellChange()`: call after writing to `item[column.field]`
 *     to propagate the change to the host grid.
 *   - `appendEditorChild(child)`: append a DOM node into `target` AND
 *     tag it with the controller's editor marker so it can later be
 *     identified for focus, the `with-editor` CSS class, and
 *     toggle-off cleanup. The marker attribute itself is an
 *     implementation detail — consumers should treat this callback
 *     as the canonical mount path. Equivalent to the protected
 *     `appendEditorChild(target, child)` instance method that
 *     built-in renderers use internally.
 */
export type IdevsCellEditorRender = (params: {
  target: HTMLElement
  item: Record<string, unknown>
  args: ArgsCell
  column: GridColumnWithField
  criteria: unknown[] | null
  notifyCellChange(): void
  appendEditorChild(child: HTMLElement): void
}) => void

type SlickEventEmitter = {
  subscribe(handler: (e: IEventData, args: ArgsCell) => unknown): void
  unsubscribe(handler: (e: IEventData, args: ArgsCell) => unknown): void
  notify(args: ArgsCell): void
}

type SlickOptions = {
  editable?: boolean
  autoEdit?: boolean
  enableCellNavigation?: boolean
}

// `ColumnSourceItem` moved to ./_columnShape.ts as `GridColumnSourceItem`
// — see imports above. No local alias needed; use sites that previously
// referenced `ColumnSourceItem` now go through `column.sourceItem`'s
// inferred type from the shared shape.

type RemovableEditor = { domNode: HTMLElement }

type Select2Container = { combobox?: { container?: HTMLElement } }

type Select2Event = {
  originalEvent: {
    val: unknown
    added?: { source?: Record<string, unknown> }
  }
}

@Decorators.registerClass('Idevs.CoreLib.IdevsGridEditController')
export class IdevsGridEditController<
  TGrid extends IdevsGridEditControllerGrid = IdevsGridEditControllerGrid,
> {
  private readonly grid: TGrid
  private allColumns: GridColumn[]
  // visibleColumns is NOT `readonly` — re-derived via refreshColumnSnapshot()
  // before keyboard navigation so column-picker / setColumns() /
  // setVisible() changes on the host grid don't leave the navigation
  // primitives reading stale state. (Items count is read inline at
  // each navigation site too — see `const maxRows = this.grid.getItems().length`
  // in handleKeyDown.)
  private visibleColumns: GridColumn[]
  private currentRow: number | null = null
  private currentCell: number | null = null
  private editable: boolean
  private autoEdit: boolean
  private readonly cellNavigation: boolean
  private enterKey: boolean = false
  /** Single-shot criteria queued by onActiveCellPositionChanged for the
   * next-loaded ServiceLookup editor. Consumed in `loadEditor`. */
  private criteria: unknown[] | null = null

  // Round-7 #6: `editorPattern` + `isEditableCell` regex check removed.
  // Editor identification is now marker-based via `findEditorChild`
  // (data-idevs-cell-editor attribute), which is the canonical lookup
  // used by every other cleanup path. The regex predates the marker
  // contract and would miss editors that aren't `firstElementChild`
  // (formatter-then-editor pattern).

  /** Custom cell-editor registry. The constructor primes this with the
   * built-in Integer/Decimal/Boolean/Lookup/ServiceLookup factories;
   * consumers add their own via `registerCellEditor`. */
  private readonly cellEditorRegistry = new Map<string, IdevsCellEditorRender>()

  /** Tracked subscriptions so `destroy()` can unsubscribe cleanly. */
  private readonly subscriptions: {
    emitter: SlickEventEmitter
    handler: (e: IEventData, args: ArgsCell) => unknown
  }[] = []

  /** Set to true after `destroy()` so late-firing events are silent. */
  private destroyed: boolean = false

  constructor(opt: IdevsGridEditControllerOptions<TGrid>) {
    this.grid = opt.grid

    const opts = this.grid.slickGrid.getOptions() as SlickOptions
    this.editable = !!opts.editable
    this.autoEdit = !!opts.autoEdit
    this.cellNavigation = !!opts.enableCellNavigation

    // Built-in editor factories.
    this.registerCellEditor('Integer', this.renderIntegerEditor)
    this.registerCellEditor('Decimal', this.renderDecimalEditor)
    this.registerCellEditor('Boolean', this.renderBooleanEditor)
    this.registerCellEditor('Lookup', this.renderLookupEditor)
    this.registerCellEditor('ServiceLookup', this.renderServiceLookupEditor)

    // Take the initial column snapshot BEFORE wiring subscribers so any
    // handler that fires synchronously during `.subscribe()` (test
    // doubles, or a SlickGrid build that delivers a buffered event on
    // subscription) sees a populated `visibleColumns` / `allColumns`
    // pair. Without this ordering, `nextCell` / `isReadonlyCell` would
    // throw on `undefined.findIndex` / `[idx]`. Refreshed lazily after
    // construction via subsequent navigation-path calls.
    this.refreshColumnSnapshot()

    if (this.editable) {
      if (this.autoEdit) {
        this.subscribe(this.grid.slickGrid.onClick as unknown as SlickEventEmitter, (e, args) =>
          this.loadEditorForCell(args),
        )
      } else {
        this.subscribe(this.grid.slickGrid.onDblClick as unknown as SlickEventEmitter, (e, args) =>
          this.loadEditorForCell(args),
        )
      }
    }
    this.subscribe(
      this.grid.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter,
      (e, args) => this.handleActiveCellChanged(e, args),
    )
    this.subscribe(this.grid.slickGrid.onKeyDown as unknown as SlickEventEmitter, (e, args) =>
      this.handleKeyDown(e as unknown as KeyboardEvent, args),
    )
    this.subscribe(
      this.grid.slickGrid.onActiveCellPositionChanged as unknown as SlickEventEmitter,
      (_e, args) => this.handleActiveCellPositionChanged(args),
    )
  }

  /**
   * Re-read columns from SlickGrid. Called from the constructor and
   * from `handleKeyDown` before keyboard navigation, so column-picker /
   * dynamic visibility / host-driven `setColumns()` changes are picked
   * up for nav.
   *
   * The editor dispatch path (`loadEditor`) does NOT call this — it
   * re-reads `getColumns()` inline for `allColumns` only and never
   * consults `visibleColumns` directly. That's intentional: dispatch
   * uses `args.cell` (all-columns index) to look up the cell, while
   * navigation walks visible-columns to skip read-only / hidden cells.
   */
  private refreshColumnSnapshot(): void {
    // See loadEditor() for the duplicate-sleekgrid cast rationale.
    this.allColumns = this.grid.slickGrid.getColumns() as unknown as GridColumn[]
    this.visibleColumns = this.allColumns.filter(column => column.visible !== false)
  }

  /**
   * Register or replace a cell editor for a given `editorType` string
   * (typically the Serenity attribute key used on a row field, e.g.
   * "Integer", "Lookup", or a custom name). Re-registering an existing
   * type overrides it.
   */
  public registerCellEditor(editorType: string, render: IdevsCellEditorRender): void {
    this.cellEditorRegistry.set(editorType, render)
  }

  /** Unsubscribe all SlickGrid event handlers. Idempotent. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const { emitter, handler } of this.subscriptions) {
      try {
        emitter.unsubscribe(handler)
      } catch (error) {
        // Log + continue. A throwing `unsubscribe` typically indicates a
        // handler-reference mismatch in our own `subscribe()` bookkeeping,
        // which is a real bug worth surfacing — but we still want to drain
        // remaining subscriptions during teardown. Matches the sibling
        // pattern in IdevsGridEditorBase.cleanupEventListeners().
        // eslint-disable-next-line no-console -- traceability for teardown bugs
        console.warn('[IdevsGridEditController] subscription teardown threw:', error)
      }
    }
    this.subscriptions.length = 0
    this.cellEditorRegistry.clear()
  }

  private subscribe(
    emitter: SlickEventEmitter,
    handler: (e: IEventData, args: ArgsCell) => unknown,
  ): void {
    emitter.subscribe(handler)
    this.subscriptions.push({ emitter, handler })
  }

  // ---- Cell navigation state machine. ----

  private handleActiveCellPositionChanged(args: ArgsCell): void {
    if (this.destroyed) return
    const a = args as ArgsCell & { editable?: boolean; criteria?: unknown[] | null }
    if (typeof a.editable === 'boolean') this.editable = a.editable
    if (a.criteria !== undefined && a.criteria !== null) {
      this.criteria = a.criteria
      // Consume-once: clear the args copy so the next listener doesn't
      // re-apply. Matches the source's behavior.
      a.criteria = null
    }
  }

  private readonly handleKeyDown = (e: KeyboardEvent, args: ArgsCell): void => {
    if (this.destroyed) return
    // Round-11 #1 (Copilot): onKeyDown is subscribed unconditionally
    // in the constructor — including for grids with `editable: false`.
    // The round-10 #2 fix added `preventDefault()` + `stopImmediatePropagation()`
    // below, but without an editable guard here, that fix actively
    // BREAKS non-editable grids: it traps keyboard focus and mutates
    // active-cell state on grids where the user isn't editing
    // anything. Matches the `loadEditor` guard pattern
    // (`if (this.destroyed || !this.editable) return`).
    if (!this.editable) {
      this.enterKey = false
      return
    }
    if (e.key !== 'Enter' && e.key !== 'Tab') {
      this.enterKey = false
      return
    }
    // Round-10 #2 (Copilot): once we've decided to handle Tab/Enter,
    // we must stop the browser's default focus traversal (and any
    // other SlickGrid plugin's Tab handler) — otherwise after our
    // notify() advances the active cell, the browser's native Tab
    // can move focus OUT of the grid entirely, leaving the
    // controller's `currentRow`/`currentCell` state out of sync with
    // DOM focus. Matches `IdevsGridEditorBase.handleKeyDown` which
    // already calls these.
    e.preventDefault()
    e.stopImmediatePropagation()
    // Body wrapped in try/catch — `refreshColumnSnapshot()` and
    // `nextCell` / `previousCell` invoke `slickGrid.getColumns()` /
    // `getHeader()`, both of which can throw on corrupted SlickGrid
    // state (destroyed grid receiving a late keystroke, host plugin
    // mutating columns mid-keystroke, etc.). SlickGrid's notify() does
    // NOT catch subscriber throws — without this guard the throw would
    // propagate up to the browser event loop with no telemetry.
    try {
      // Refresh column snapshot so navigation reflects any setColumns() /
      // column-picker changes since the last call. Read items length
      // inline (NOT a constructor snapshot) so added/deleted rows show
      // up in the row-overflow clamp below.
      this.refreshColumnSnapshot()
      const maxRows = this.grid.getItems().length
      let row = this.currentRow ?? 0
      let cell = this.currentCell ?? 0
      if (e.shiftKey) {
        cell = this.previousCell(cell)
        if (cell < 0) {
          row--
          if (row < 0) {
            row = 0
            cell = this.firstEditableCell()
          } else {
            cell = this.lastEditableCell()
          }
        }
      } else {
        cell = this.nextCell(cell)
        if (cell >= this.grid.slickGrid.getHeader().childElementCount) {
          row++
          if (row >= maxRows) {
            row--
            cell = this.lastEditableCell()
          } else {
            cell = this.firstEditableCell()
          }
        }
      }
      // Args mutation deferred to the success path: capture row/cell
      // locally, build a copy for notify(), and only commit back to
      // the SlickGrid-owned `args` object AFTER notify() returns
      // cleanly. If notify() throws, the original args (caller-owned)
      // is left untouched — downstream listeners that read args don't
      // see a half-applied navigation state.
      this.enterKey = true
      const notifyArgs = { ...args, row, cell }
      ;(this.grid.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter).notify(
        notifyArgs as ArgsCell,
      )
      args.row = row
      args.cell = cell
    } catch (err) {
      console.warn(
        '[IdevsGridEditController] handleKeyDown threw — keystroke navigation aborted:',
        err,
      )
      this.enterKey = false
    }
  }

  private nextCell(cell: number): number {
    const headers = this.grid.slickGrid.getHeader().children
    for (let i = cell + 1; i < headers.length; i++) {
      const header = headers[i] as HTMLElement
      const field = header.getAttribute('data-id')
      // Skip headers without a `data-id` (selection-checkbox column,
      // row-reorder handle, action columns). Without this guard,
      // `findIndex(... column.field === null ...)` would never match
      // (so the iteration continued), BUT multiple no-field columns in
      // visibleColumns could still collide by both having undefined
      // `field` — `findIndex` would return the first match and
      // `isReadonlyCell(idx)` would read the WRONG column's readOnly
      // state.
      if (!field) continue
      const idx = this.visibleColumns.findIndex(column => column.field === field)
      if (idx >= 0 && !this.isReadonlyCell(idx)) {
        return i
      }
    }
    return headers.length
  }

  private previousCell(cell: number): number {
    const headers = this.grid.slickGrid.getHeader().children
    for (let i = cell - 1; i >= 0; i--) {
      const header = headers[i] as HTMLElement
      const field = header.getAttribute('data-id')
      // See nextCell for the null-field skip rationale.
      if (!field) continue
      const idx = this.visibleColumns.findIndex(column => column.field === field)
      if (idx >= 0 && !this.isReadonlyCell(idx)) {
        return i
      }
    }
    return -1
  }

  private isReadonlyCell(idx: number): boolean {
    const column = this.visibleColumns[idx] as GridColumn | undefined
    return !!column?.sourceItem?.readOnly
  }

  private firstEditableCell(): number {
    return this.nextCell(-1)
  }

  private lastEditableCell(): number {
    return this.previousCell(this.grid.slickGrid.getHeader().childElementCount)
  }

  // `isEditableCell` (regex-on-className) removed in round-7 #6 —
  // superseded by marker-based `findEditorChild`. See class-level
  // editorPattern comment.

  private readonly handleActiveCellChanged = (_e: IEventData, args: ArgsCell): void => {
    if (this.destroyed) return
    // Cleanup the prior cell when the active cell moves to a DIFFERENT
    // cell — either a different row OR a different column in the same
    // row (the Tab / shift-Tab / next-cell-click paths). Prior to
    // round-7 #7 the condition was only `currentRow !== args.row`, so
    // same-row navigation left the previous cell's marked editor
    // mounted while the new cell gained its own editor — the user saw
    // two editors active simultaneously.
    //
    // Same-cell re-activation (currentRow === args.row && currentCell
    // === args.cell) is NOT a cleanup case — the controller-managed
    // toggle-off in `loadEditor` handles that flow.
    const isDifferentCell =
      this.currentRow !== args.row || this.currentCell !== args.cell
    if (
      this.currentCell !== null &&
      this.currentRow !== null &&
      isDifferentCell
    ) {
      const slickCell = this.grid.slickGrid.getCellNode(this.currentRow, this.currentCell)
      if (slickCell) {
        // Marker-based lookup (NOT `firstElementChild + s-*Editor regex`).
        // After the round-7 editor-marker contract, the editor may be a
        // LATER sibling — formatter markup at index 0, editor at
        // index 1+. The regex check on firstElementChild would miss
        // the editor in that case, leaving it orphaned in the old
        // cell when the user navigated to a different row.
        const editorChild = this.findEditorChild(slickCell)
        if (editorChild) editorChild.remove()
        this.cleanupCellEditorClasses(slickCell)
      }
    }

    this.currentRow = args.row
    this.currentCell = args.cell

    if (this.editable && (this.cellNavigation || this.enterKey) && this.autoEdit) {
      const cell = this.grid.slickGrid.getCellNode(args.row, args.cell)
      if (cell) this.loadEditor(cell, args)
    }

    this.enterKey = false
  }

  // ---- Cell change propagation. ----

  private notifyCellChange(args: ArgsCell, item: unknown): void {
    // Cast through `unknown` because the local sleekgrid types
    // (top-level 1.9.8) and the nested copy bundled with corelib (1.9.6)
    // declare separate private fields on `Grid<any>`, making a direct
    // assignment between the two ArgsCell shapes non-comparable.
    ;(this.grid.slickGrid.onCellChange as unknown as SlickEventEmitter).notify({
      grid: this.grid.slickGrid,
      row: args.row,
      cell: args.cell,
      item,
    } as unknown as ArgsCell)
  }

  /**
   * Read a value off the data item via SlickGrid's
   * `getDataItemValueForColumn`. Centralizes the structural-cast of our
   * local `GridColumn` shape into the real sleekgrid `Column<any>` that
   * the SlickGrid method expects — see the GridColumn comment above for
   * why a direct shape annotation isn't viable here.
   */
  private getCellValue(item: unknown, column: GridColumn): unknown {
    return this.grid.slickGrid.getDataItemValueForColumn(
      item,
      column as unknown as Parameters<typeof this.grid.slickGrid.getDataItemValueForColumn>[1],
    )
  }

  // ---- Editor dispatch. ----

  private loadEditorForCell(args: ArgsCell): void {
    const cell = this.grid.slickGrid.getCellNode(args.row, args.cell)
    if (cell) this.loadEditor(cell, args)
  }

  private loadEditor(targetElement: HTMLElement, args: ArgsCell): void {
    if (this.destroyed || !this.editable) {
      this.enterKey = false
      return
    }

    // Cast through `unknown` for the duplicate-sleekgrid type narrowing:
    // the nested PropertyItem.editorType union is wider than our
    // GridColumn ColumnSourceItem.editorType, so a direct assignment
    // fails. The structural shape is otherwise compatible.
    this.allColumns = this.grid.slickGrid.getColumns() as unknown as GridColumn[]
    const column = this.allColumns[args.cell]
    if (!column || !column.sourceItem || column.sourceItem.readOnly) return
    // `column.field` undefined / empty would land every editor's write on
    // `item["undefined"]` — a silent data-loss where the user sees the
    // cell update via textContent but no real entity field receives
    // the value. The `hasField` type predicate centralizes the check
    // AND narrows `column` from `GridColumn` to `GridColumnWithField`
    // so the renderer dispatch below doesn't need a separate `as`
    // assertion.
    if (!hasField(column)) {
      // Misconfiguration signal: an editable column with no `field` is
      // unusable. Log under the project's project-wide `no-console: warn`
      // policy so consumers can find the offending column descriptor.
      console.warn(
        '[IdevsGridEditController] Column has editorType but no field; ignoring edit',
        column,
      )
      return
    }

    const item = this.grid.slickGrid.getDataItem(args.row) as Record<string, unknown>
    if (!this.cellNavigation && !this.enterKey) {
      ;(this.grid.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter).notify(args)
    }

    // Controller-managed toggle-off (round-7 #4): if a marked editor
    // is already mounted in this cell, remove it and bail BEFORE
    // dispatching to the renderer. This means renderers — both
    // built-in AND public custom ones registered via
    // `registerCellEditor(...)` — never have to call
    // `removeExistingEditor` themselves. They're always invoked for a
    // fresh mount. Boolean cells are naturally unaffected: they
    // never use `appendEditorChild`, so their span carries no marker
    // and `removeExistingEditor` returns false.
    if (this.removeExistingEditor(targetElement)) {
      this.enterKey = false
      return
    }

    // Narrow editorType (typed `unknown` to stay assignable from Serenity's
    // wider PropertyItem.editorType union) to the string case the
    // dispatcher actually keys on. Non-string editor types fall through
    // to the default string-editor renderer.
    const rawEditorType = column.sourceItem.editorType
    const editorType = typeof rawEditorType === 'string' ? rawEditorType : ''
    const render = this.cellEditorRegistry.get(editorType)
    const criteria = this.criteria
    this.criteria = null

    // `column` is narrowed to `GridColumnWithField` by the `hasField`
    // type predicate above — TypeScript flows the narrowing into the
    // renderer dispatch automatically, no `as` cast required.
    const renderParams = {
      target: targetElement,
      item,
      args,
      column,
      criteria,
      notifyCellChange: () => this.notifyCellChange(args, item),
      // Bound closure exposing the protected `appendEditorChild` helper
      // to public custom-renderer authors. Without this, consumers
      // calling `registerCellEditor(...)` couldn't implement the
      // documented marker-based contract because the protected
      // instance method + private marker attr aren't reachable from
      // outside the class.
      appendEditorChild: (child: HTMLElement) => this.appendEditorChild(targetElement, child),
    }
    if (render) {
      render(renderParams)
    } else {
      // Fallback: plain string editor.
      this.renderStringEditor(renderParams)
    }

    // Boolean is a click-to-toggle on an in-cell span (no editor child),
    // so we don't want the `with-editor` styling. For every other type,
    // we only add the class if the renderer actually appended an
    // editor child. We identify "editor child" by the
    // `data-idevs-cell-editor` marker that `appendEditorChild` sets —
    // NOT by `firstElementChild != null` (which would mistakenly match
    // formatter markup like `<span><i/></span>` that lives inside the
    // real Slick cell node since round-4 hooked `getCellNode` for
    // dispatch).
    if (editorType !== 'Boolean') {
      const editorChild = this.findEditorChild(targetElement)
      if (editorChild) {
        targetElement.classList.add('with-editor')
        editorChild.focus()
      } else {
        targetElement.classList.remove('with-editor')
      }
    }

    this.enterKey = false
  }

  /**
   * Marker attribute applied to every editor child appended via
   * `appendEditorChild`. Used by `removeExistingEditor` and
   * `findEditorChild` to distinguish controller-owned editor nodes
   * from arbitrary formatter markup inside the Slick cell. Without a
   * marker, `removeExistingEditor` would treat formatter `<span>` /
   * `<i>` as a "previous editor" and toggle-off on every click — the
   * bug that PR-4b round-7 #1 surfaced.
   */
  private static readonly EDITOR_MARKER_ATTR = 'data-idevs-cell-editor'

  /**
   * Append a child to the cell AND tag it with the editor marker so
   * subsequent calls to `removeExistingEditor` / `findEditorChild`
   * can distinguish it from formatter markup. All built-in renderers
   * and any custom renderers calling out via `IdevsCellEditorRender`
   * SHOULD route through this helper to participate in the toggle-off
   * / focus-on-mount contract.
   */
  protected appendEditorChild(target: HTMLElement, child: HTMLElement): void {
    child.setAttribute(IdevsGridEditController.EDITOR_MARKER_ATTR, 'true')
    target.appendChild(child)
  }

  /**
   * Find the controller-owned editor child of `target`, if any.
   * Returns null when no child carries the editor marker. Scans all
   * direct children (NOT just `firstElementChild`) so a cell that
   * already contains formatter markup at index 0 still surfaces the
   * editor mounted alongside it.
   */
  private findEditorChild(target: HTMLElement): HTMLElement | null {
    const children = target.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      if (
        child.getAttribute(IdevsGridEditController.EDITOR_MARKER_ATTR) === 'true'
      ) {
        return child
      }
    }
    return null
  }

  /**
   * If the target has a CONTROLLER-OWNED editor child (marked by
   * `appendEditorChild`), remove it (toggle-off) and strip the
   * `with-editor` class. Returns `true` if a removal happened —
   * the caller should NOT proceed with fresh editor creation.
   *
   * Critically, returns `false` when `target.firstElementChild` is
   * formatter markup (no editor marker). Without this distinction,
   * a cell rendered as `<span><i/></span>` by a Serenity formatter
   * would have its formatter span stripped on every click — and the
   * renderer would think it had "toggled off" and skip mounting the
   * editor entirely.
   */
  private removeExistingEditor(target: HTMLElement): boolean {
    const editorChild = this.findEditorChild(target)
    if (!editorChild) return false
    editorChild.remove()
    this.cleanupCellEditorClasses(target)
    return true
  }

  /**
   * Strip all classes that an editor renderer might have added to the
   * cell when mounting (currently `with-editor` and `text-white` — the
   * latter is added by `renderLookupEditor` so the dark Select2 dropdown
   * doesn't bleed into the cell underneath).
   *
   * Called from BOTH cleanup paths so they stay symmetrical:
   *   1. `handleActiveCellChanged` — clearing the prior cell when the
   *      active cell changes to a different row.
   *   2. `removeExistingEditor` (toggle-off) — same-cell second click.
   *
   * Prior to this helper the two paths drifted: the row-change cleanup
   * removed both classes; the toggle-off only removed `with-editor`. A
   * second click on a Lookup cell left `text-white` behind → invisible
   * text on white background.
   */
  private cleanupCellEditorClasses(cell: HTMLElement): void {
    cell.classList.remove('with-editor')
    cell.classList.remove('text-white')
  }

  // ---- Built-in editor factories. Arrow-property so `this` binding
  //      survives the registry's stable function reference. ----

  // Built-in renderers use the protected `this.appendEditorChild(target, ...)`
  // method directly because they're inside the class. Public custom
  // renderers registered via `registerCellEditor(...)` use the
  // `appendEditorChild(node)` callback delivered via the params object
  // — see the `IdevsCellEditorRender` type's JSDoc.

  private readonly renderIntegerEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    const editorParams = this.editorParamsFor(column)
    const integerEditor = new IntegerEditor(editorParams)
    ;(integerEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    integerEditor.change(e => {
      const stringValue = (e.target as HTMLInputElement).value
      const parsed = parseInt(stringValue || '0', 10)
      item[column.field] = Number.isFinite(parsed) ? parsed : 0
      // XSS hardening: textContent (source used innerHTML).
      target.textContent = stringValue
      notifyCellChange()
    })
    this.appendEditorChild(target, (integerEditor as unknown as RemovableEditor).domNode)
  }

  private readonly renderDecimalEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    const editorParams = this.editorParamsFor(column)
    const decimalEditor = new DecimalEditor(editorParams)
    ;(decimalEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    decimalEditor.change(e => {
      const stringValue = (e.target as HTMLInputElement).value
      const cleanValue = stringValue.replace(/,/g, '')
      const numericValue = cleanValue ? parseFloat(cleanValue) : 0
      item[column.field] = Number.isFinite(numericValue) ? numericValue : 0
      // Locale 'en-US' is a deliberate behavior-parity choice with the
      // PowerACC source; revisit once a configurable locale ships
      // through `IdevsGridEditControllerOptions`.
      const formattedValue = (Number.isFinite(numericValue) ? numericValue : 0).toLocaleString(
        'en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )
      // XSS hardening: textContent (source used innerHTML, fine for
      // numeric output but consistent with the rest of the editors).
      target.textContent = formattedValue
      notifyCellChange()
    })
    this.appendEditorChild(target, (decimalEditor as unknown as RemovableEditor).domNode)
  }

  private readonly renderBooleanEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    // Boolean is a click-to-toggle on a span — no editor widget to
    // instantiate or toggle-off behavior to replicate.
    //
    // No `column.field` guard here: `IdevsCellEditorRender` types
    // `column` as `GridColumnWithField` (field guaranteed non-empty
    // string) because the dispatcher checks `column.field` before
    // invoking any renderer. The earlier inline check that lived here
    // was redundant after round-3 hoisted the guard.
    //
    // No `isReadonlyCell(args.cell)` either — loadEditor filters
    // readOnly columns via `column.sourceItem.readOnly` BEFORE dispatch.
    const toggleTarget =
      target.tagName.toLowerCase() === 'span'
        ? target
        : target.querySelector<HTMLElement>('span')
    if (!toggleTarget) return
    toggleTarget.classList.toggle('checked')
    item[column.field] = toggleTarget.classList.contains('checked')
    notifyCellChange()
  }

  private readonly renderLookupEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    const editorParams = this.editorParamsFor(column)
    const lookupEditor = new LookupEditor(editorParams)
    const container = (lookupEditor as unknown as Select2Container).combobox?.container
    ;(lookupEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    if (container) {
      this.appendEditorChild(target, container)
      target.classList.add('text-white')
    }
    ;(lookupEditor as unknown as {
      changeSelect2: (handler: (e: Select2Event) => void) => void
    }).changeSelect2(e => {
      const val = e.originalEvent.val
      item[column.field] = val
      // Round-11 #3 (Copilot): when the Select2 commit replaces the
      // editor container with text via `target.textContent = ...`,
      // the `text-white` class that the lookup added at mount time
      // (so the dark Select2 dropdown didn't bleed into the cell)
      // is left on the cell. That makes the committed value render
      // as white text on a normal background — invisible until
      // another cleanup path (row change, toggle-off) fires. Strip
      // both editor classes here via the shared cleanup helper so
      // the committed text is visible immediately.
      target.textContent = val === null || val === undefined ? '' : String(val)
      this.cleanupCellEditorClasses(target)
      notifyCellChange()
    })
  }

  private readonly renderServiceLookupEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    criteria,
    notifyCellChange,
  }) => {
    const editorParams = this.editorParamsFor(column)
    if (criteria) {
      ;(editorParams as Record<string, unknown>).criteria = criteria
    }
    const serviceLookupEditor = new ServiceLookupEditor(editorParams)
    const container = (serviceLookupEditor as unknown as Select2Container).combobox?.container
    ;(serviceLookupEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    if (container) {
      this.appendEditorChild(target, container)
    }
    ;(serviceLookupEditor as unknown as {
      changeSelect2: (handler: (e: Select2Event) => void) => void
    }).changeSelect2(e => {
      const originalEvent = e.originalEvent
      const addedSource = originalEvent.added?.source
      item[column.field] = originalEvent.val
      if (addedSource) {
        const idField = (editorParams as Record<string, unknown>).idField
        const textField = (editorParams as Record<string, unknown>).textField
        for (const key of Object.keys(addedSource)) {
          if (key !== idField && key !== textField) {
            item[key] = addedSource[key]
          }
        }
      }
      // Round-13 #2 (Copilot): match the Lookup renderer's commit
      // pattern (round-11 #3) — replace the editor container with
      // committed text and strip editor classes so the cell isn't
      // left in an "editing" visual state until a later cleanup
      // path runs. The Lookup change handler does this; the
      // ServiceLookup handler didn't.
      //
      // For display we prefer the human-readable text (textField
      // value from the selected source) if it's available;
      // otherwise fall back to the committed val (the id).
      // Consumers wanting a different display format can override
      // via a custom registered renderer.
      const textField = (editorParams as Record<string, unknown>).textField as
        | string
        | undefined
      const displayValue =
        addedSource && textField && textField in addedSource
          ? addedSource[textField]
          : originalEvent.val
      target.textContent =
        displayValue === null || displayValue === undefined ? '' : String(displayValue)
      this.cleanupCellEditorClasses(target)
      notifyCellChange()
    })
  }

  private readonly renderStringEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    const editorParams = this.editorParamsFor(column)
    const stringEditor = new StringEditor(editorParams)
    ;(stringEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    stringEditor.change(e => {
      const value = (e.target as HTMLInputElement).value
      item[column.field] = value
      // XSS hardening: textContent. The source's `target.innerHTML = value`
      // here was the most dangerous of the bunch — string editor values
      // are user-typed text, so embedded `<script>` or event-handler
      // attributes would execute on display.
      target.textContent = value
      notifyCellChange()
    })
    this.appendEditorChild(target, (stringEditor as unknown as RemovableEditor).domNode)
  }

  /**
   * Narrow column.sourceItem.editorParams to the editor-options shape
   * Serenity expects, returning a fresh shallow copy so per-editor
   * mutations (the ServiceLookup criteria injection) don't leak back
   * onto the column descriptor.
   */
  private editorParamsFor(column: GridColumn): Record<string, unknown> {
    return { ...(column.sourceItem?.editorParams ?? {}) }
  }
}
