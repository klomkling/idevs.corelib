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

/**
 * Local structural alias for a SlickGrid column. We avoid importing
 * `Column` from `@serenity-is/sleekgrid` directly because the top-level
 * install (1.9.8) and the nested copy bundled with `@serenity-is/corelib`
 * (1.9.6) declare separate private fields on `Column`, so the two
 * `Column<any>` types are reported as incompatible across module
 * boundaries. The fields we actually USE are limited and stable across
 * those versions, so an inline structural shape is safe.
 */
type GridColumn = {
  field?: string
  visible?: boolean
  name?: string
  sourceItem?: ColumnSourceItem
}

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

/** Public constructor options. */
export type IdevsGridEditControllerOptions = {
  grid: IdevsGridEditControllerGrid
}

/**
 * Render function signature for a custom cell editor. Implementations
 * MUST handle the toggle-off case themselves (typically by removing
 * `target`'s existing first child if `target.childElementCount > 0`).
 *
 * Inputs:
 *   - `target`: the cell DOM element. Render into `target.appendChild(...)`.
 *   - `item`: the data row (the editor mutates this in place on commit).
 *   - `args`: SlickGrid's cell context for the active edit.
 *   - `column`: SlickGrid's column definition (carries `sourceItem` /
 *     `editorParams` from the Serenity descriptor pipeline).
 *   - `criteria`: any single-shot criteria queued by
 *     `onActiveCellPositionChanged` for this cell. Consume by setting it
 *     on the editor's options before constructing — the controller has
 *     already cleared its own copy.
 *   - `notifyCellChange()`: call after writing to `item[column.field]`
 *     to propagate the change to the host grid.
 */
export type IdevsCellEditorRender = (params: {
  target: HTMLElement
  item: Record<string, unknown>
  args: ArgsCell
  column: GridColumn
  criteria: unknown[] | null
  notifyCellChange(): void
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

type ColumnSourceItem = {
  readOnly?: boolean
  // `editorType` is typed `unknown` rather than `string` to stay structurally
  // assignable from Serenity's `PropertyItem.editorType`, which is a union
  // of `string | EditorClass | PromiseLike<EditorClass>`. We narrow to the
  // string case (the only case the dispatcher handles) at the use site.
  editorType?: unknown
  editorParams?: Record<string, unknown>
}

type RemovableEditor = { domNode: HTMLElement }

type Select2Container = { combobox?: { container?: HTMLElement } }

type Select2Event = {
  originalEvent: {
    val: unknown
    added?: { source?: Record<string, unknown> }
  }
}

@Decorators.registerClass('Idevs.CoreLib.IdevsGridEditController')
export class IdevsGridEditController {
  private readonly grid: IdevsGridEditControllerGrid
  private allColumns: GridColumn[]
  private readonly visibleColumns: GridColumn[]
  private maxRows: number
  private currentRow: number | null = null
  private currentCell: number | null = null
  private editable: boolean
  private autoEdit: boolean
  private readonly cellNavigation: boolean
  private enterKey: boolean = false
  /** Single-shot criteria queued by onActiveCellPositionChanged for the
   * next-loaded ServiceLookup editor. Consumed in `loadEditor`. */
  private criteria: unknown[] | null = null

  private readonly editorPattern = /^s-.*Editor$/

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

  constructor(opt: IdevsGridEditControllerOptions) {
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

    // See loadEditor() for the duplicate-sleekgrid cast rationale.
    this.allColumns = this.grid.slickGrid.getColumns() as unknown as GridColumn[]
    this.visibleColumns = this.allColumns.filter(column => column.visible !== false)
    this.maxRows = this.grid.getItems().length
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
      } catch {
        /* swallow teardown errors — see Serenity dialog teardown pattern */
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
    if (e.key !== 'Enter' && e.key !== 'Tab') {
      this.enterKey = false
      return
    }
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
        if (row >= this.maxRows) {
          row--
          cell = this.lastEditableCell()
        } else {
          cell = this.firstEditableCell()
        }
      }
    }
    args.row = row
    args.cell = cell
    this.enterKey = true
    ;(this.grid.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter).notify(args)
  }

  private nextCell(cell: number): number {
    const headers = this.grid.slickGrid.getHeader().children
    for (let i = cell + 1; i < headers.length; i++) {
      const header = headers[i] as HTMLElement
      const field = header.getAttribute('data-id')
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

  private isEditableCell(cell: HTMLElement): boolean {
    return Array.from(cell.classList).some(className => this.editorPattern.test(className))
  }

  private readonly handleActiveCellChanged = (_e: IEventData, args: ArgsCell): void => {
    if (this.destroyed) return
    if (
      this.currentCell !== null &&
      this.currentRow !== null &&
      this.currentRow !== args.row
    ) {
      const slickCell = this.grid.slickGrid.getCellNode(this.currentRow, this.currentCell)
      if (slickCell && slickCell.childElementCount > 0) {
        const firstChild = slickCell.firstElementChild as HTMLElement | null
        if (firstChild && this.isEditableCell(firstChild)) {
          firstChild.remove()
        }
        slickCell.classList.remove('with-editor')
        slickCell.classList.remove('text-white')
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

    const item = this.grid.slickGrid.getDataItem(args.row) as Record<string, unknown>
    if (!this.cellNavigation && !this.enterKey) {
      ;(this.grid.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter).notify(args)
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

    if (render) {
      render({
        target: targetElement,
        item,
        args,
        column,
        criteria,
        notifyCellChange: () => this.notifyCellChange(args, item),
      })
    } else {
      // Fallback: plain string editor.
      this.renderStringEditor({
        target: targetElement,
        item,
        args,
        column,
        criteria,
        notifyCellChange: () => this.notifyCellChange(args, item),
      })
    }

    if (editorType !== 'Boolean') {
      targetElement.classList.add('with-editor')
      const firstChild = targetElement.firstElementChild as HTMLElement | null
      if (firstChild) firstChild.focus()
    }

    this.enterKey = false
  }

  /**
   * If the target already has a child, remove it (toggle-off). Returns
   * `true` if a removal happened — the caller should NOT proceed with
   * fresh editor creation in that case (matches the source's toggle
   * behavior).
   */
  private removeExistingEditor(target: HTMLElement): boolean {
    if (target.childElementCount === 0) return false
    const firstChild = target.firstElementChild as HTMLElement | null
    if (firstChild) firstChild.remove()
    return true
  }

  // ---- Built-in editor factories. Arrow-property so `this` binding
  //      survives the registry's stable function reference. ----

  private readonly renderIntegerEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    if (this.removeExistingEditor(target)) return
    const editorParams = this.editorParamsFor(column)
    const integerEditor = new IntegerEditor(editorParams)
    ;(integerEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    integerEditor.change(e => {
      const stringValue = (e.target as HTMLInputElement).value
      const parsed = parseInt(stringValue || '0', 10)
      item[column.field as string] = Number.isFinite(parsed) ? parsed : 0
      // XSS hardening: textContent (source used innerHTML).
      target.textContent = stringValue
      notifyCellChange()
    })
    target.appendChild((integerEditor as unknown as RemovableEditor).domNode)
  }

  private readonly renderDecimalEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    if (this.removeExistingEditor(target)) return
    const editorParams = this.editorParamsFor(column)
    const decimalEditor = new DecimalEditor(editorParams)
    ;(decimalEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    decimalEditor.change(e => {
      const stringValue = (e.target as HTMLInputElement).value
      const cleanValue = stringValue.replace(/,/g, '')
      const numericValue = cleanValue ? parseFloat(cleanValue) : 0
      item[column.field as string] = Number.isFinite(numericValue) ? numericValue : 0
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
    target.appendChild((decimalEditor as unknown as RemovableEditor).domNode)
  }

  private readonly renderBooleanEditor: IdevsCellEditorRender = ({
    target,
    item,
    args,
    column,
    notifyCellChange,
  }) => {
    // Boolean is a click-to-toggle on a span — no editor widget to
    // instantiate or toggle-off behavior to replicate.
    if (this.isReadonlyCell(args.cell)) return
    const toggleTarget =
      target.tagName.toLowerCase() === 'span'
        ? target
        : target.querySelector<HTMLElement>('span')
    if (!toggleTarget) return
    toggleTarget.classList.toggle('checked')
    item[column.field as string] = toggleTarget.classList.contains('checked')
    notifyCellChange()
  }

  private readonly renderLookupEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    if (this.removeExistingEditor(target)) return
    const editorParams = this.editorParamsFor(column)
    const lookupEditor = new LookupEditor(editorParams)
    const container = (lookupEditor as unknown as Select2Container).combobox?.container
    ;(lookupEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    if (container) {
      target.appendChild(container)
      target.classList.add('text-white')
    }
    ;(lookupEditor as unknown as {
      changeSelect2: (handler: (e: Select2Event) => void) => void
    }).changeSelect2(e => {
      const val = e.originalEvent.val
      item[column.field as string] = val
      target.textContent = val === null || val === undefined ? '' : String(val)
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
    if (this.removeExistingEditor(target)) return
    const editorParams = this.editorParamsFor(column)
    if (criteria) {
      ;(editorParams as Record<string, unknown>).criteria = criteria
    }
    const serviceLookupEditor = new ServiceLookupEditor(editorParams)
    const container = (serviceLookupEditor as unknown as Select2Container).combobox?.container
    ;(serviceLookupEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    if (container) {
      target.appendChild(container)
    }
    ;(serviceLookupEditor as unknown as {
      changeSelect2: (handler: (e: Select2Event) => void) => void
    }).changeSelect2(e => {
      const originalEvent = e.originalEvent
      const addedSource = originalEvent.added?.source
      item[column.field as string] = originalEvent.val
      if (addedSource) {
        const idField = (editorParams as Record<string, unknown>).idField
        const textField = (editorParams as Record<string, unknown>).textField
        for (const key of Object.keys(addedSource)) {
          if (key !== idField && key !== textField) {
            item[key] = addedSource[key]
          }
        }
      }
      notifyCellChange()
    })
  }

  private readonly renderStringEditor: IdevsCellEditorRender = ({
    target,
    item,
    column,
    notifyCellChange,
  }) => {
    if (this.removeExistingEditor(target)) return
    const editorParams = this.editorParamsFor(column)
    const stringEditor = new StringEditor(editorParams)
    ;(stringEditor as unknown as { value: unknown }).value = this.getCellValue(item, column)
    stringEditor.change(e => {
      const value = (e.target as HTMLInputElement).value
      item[column.field as string] = value
      // XSS hardening: textContent. The source's `target.innerHTML = value`
      // here was the most dangerous of the bunch — string editor values
      // are user-typed text, so embedded `<script>` or event-handler
      // attributes would execute on display.
      target.textContent = value
      notifyCellChange()
    })
    target.appendChild((stringEditor as unknown as RemovableEditor).domNode)
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
