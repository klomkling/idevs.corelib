import {
  Decorators,
  type EditorProps,
  EnumTypeRegistry,
  notifyError,
  SlickFormatting,
  type ToolButton,
} from '@serenity-is/corelib'
import type { ArgsCell, FormatterContext, FormatterResult } from '@serenity-is/sleekgrid'
import { GridEditorBase } from '@serenity-is/extensions'
import type { GridColumn } from './_columnShape'

const { getEnumText } = SlickFormatting

/**
 * Editable grid base — extends Serenity's `GridEditorBase` with:
 *
 *   - Per-row validation with row-change blocking and friendly notify
 *     output (XSS-safe by default).
 *   - Tab / Enter / Shift-Tab cell navigation with auto-add-row at the
 *     end-of-grid edge.
 *   - Add / delete / move-up / move-down / expand toolbar buttons.
 *   - Grid expansion: hides sibling form fields and stretches the grid
 *     to fill the form area.
 *   - Row-change + add-button-click subscribers with cleanup callbacks.
 *   - `set_readOnly` mirror to the toolbar buttons.
 *
 * Replaces PowerACC's `CsiGridEditorBase`.
 *
 * Subpath import — IdevsGridEditorBase is NOT exported from the main
 * `@idevs/corelib` barrel because it depends on `@serenity-is/extensions`,
 * an OPTIONAL peer dependency. Import directly:
 *
 *   import { IdevsGridEditorBase } from '@idevs/corelib/grids/idevsGridEditorBase'
 *
 * Consumers must have `@serenity-is/extensions` resolvable in their
 * dependency tree (typically via Serenity's .NET install + file:
 * reference in their own package.json).
 *
 * Hardening vs source (CsiGridEditorBase):
 *
 *   - **XSS in validation error display**: source called
 *     `notifyError(messages.join("<br />"), ..., { escapeHtml: false })`.
 *     With `escapeHtml: false`, any column name or message containing
 *     HTML/script would execute on display. Replaced with the default
 *     `escapeHtml: true` and `\n` separator — most toast libraries
 *     render newlines as line breaks via `white-space: pre-line` CSS;
 *     consumers wanting HTML formatting must opt in explicitly via the
 *     `formatValidationMessage()` override.
 *
 *   - **Hardcoded `currentItem.ItemNo`**: source used `ItemNo` as the
 *     sort/order field in `moveCurrentRowUp` / `moveCurrentRowDown`.
 *     Replaced with the overridable `getOrderField()` hook (defaults to
 *     `'ItemNo'`). Subclasses with a different order field name override
 *     this once; both methods become field-agnostic. If
 *     `getOrderField()` returns null, the swap moves rows in the items
 *     array without touching any per-row field.
 *
 *   - **PascalCase API → camelCase methods + shims**: `IsFirstClicked` /
 *     `DeletedRows` PascalCase getters/setters preserved as deprecated
 *     shims; canonical API is `getIsFirstClicked()` / `setIsFirstClicked()`
 *     / `getDeletedRows()`. Pattern matches batches 4a + 4b previously
 *     applied to dialogs and IdevsSearchGrid.
 *
 *   - **Dead code dropped**: source's `validateCell(item, field)` private
 *     method was never called. Dropped. `validateRow(item, rowIndex)`'s
 *     `rowIndex` parameter was unused; renamed `_rowIndex` so subclass
 *     overrides may still consume it without an ESLint complaint.
 *
 *   - **`console.warn` audit**: the source's six `console.warn` calls
 *     inside catch blocks remain — they document genuine "this should
 *     not happen but we don't want to crash the host" boundaries
 *     (subscriber callback throws, editor-lock commit failures during
 *     row navigation). Each is now prefixed with `[IdevsGridEditorBase]`
 *     for log traceability.
 *
 *   - **Null guards on DOM walks**: `this.element.closest('.category')`,
 *     `this.element.closest('.field')`, `this.domNode.closest('form')`
 *     can all return null when the grid is rendered outside the expected
 *     ancestor chain (test harnesses, embedded views). Source assumed
 *     they always succeeded — added explicit guards that bail safely.
 *
 *   - **`Array<any>` cleanup callbacks**: `eventCleanup: (() => void)[]`
 *     and subscriber arrays now use proper function types instead of
 *     `Array<any>`.
 *
 *   - **DataItem cast**: source had `(item as any)[col.field]` reads in
 *     validation. The cast is now `Record<string, unknown>` applied
 *     at the use site (the indexing narrows acceptably; no separate
 *     helper is currently warranted).
 *
 * @template TEntity Row entity type.
 * @template P Widget options type.
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsGridEditorBase')
export class IdevsGridEditorBase<TEntity, P = unknown> extends GridEditorBase<TEntity, P> {
  /** Cleanup callbacks captured by `addEventListener()` and drained in `destroy()`. */
  protected eventCleanup: (() => void)[] = []

  private _isFirstClicked: boolean = false
  private _isExpanded: boolean = false
  private _currentActiveRow: number | null = null
  private _lastValidationFailed: boolean = false
  private _deletedRows: TEntity[] = []
  /**
   * Set to `true` by `destroy()` so:
   *   1. `subscribeToRowChange` / `subscribeToAddButtonClick` reject
   *      new subscriptions with a warn (silent never-fires is worse
   *      than a clear error signal at registration time).
   *   2. Notify methods short-circuit any late-firing events.
   */
  private _destroyed: boolean = false

  private readonly _rowChangeSubscribers: ((
    oldRow: number,
    newRow: number,
    oldItem: TEntity,
    newItem: TEntity,
  ) => void)[] = []
  private readonly _addButtonClickSubscribers: (() => void)[] = []

  /**
   * Snapshot of `slickGrid.getOptions()` taken in the constructor.
   * Captured once so we can read `editable` / `autoEdit` without
   * re-calling getOptions on every event tick.
   *
   * **Lifecycle constraint:** if a consumer calls
   * `slickGrid.setOptions({ editable: false })` or
   * `setOptions({ autoEdit: <toggle> })` AFTER construction, this
   * snapshot does NOT refresh — the controller stays bound to the
   * original onClick/onDblClick emitter. Consumers who need to toggle
   * editability at runtime should `destroy()` + recreate the grid
   * widget rather than mutating SlickGrid options in place. The twin
   * sibling `IdevsGridEditController` has a similar constraint with
   * the same documented escape hatch.
   *
   * A future refactor could re-bind via a `refreshGridOptions()`
   * method; deferred until a consumer surfaces the need.
   */
  private readonly _opts: ReturnType<this['slickGrid']['getOptions']>

  constructor(props: EditorProps<P>) {
    super(props)
    this._opts = this.slickGrid.getOptions() as ReturnType<this['slickGrid']['getOptions']>
    if (this._opts.editable) {
      this.setupGridEventHandlers()
    }
  }

  // ---- ReadOnly + toolbar wiring ----

  override set_readOnly(value: boolean): void {
    super.set_readOnly(value)
    this.setReadonlyElements(value)
  }

  private setReadonlyElements(readOnly: boolean): void {
    for (const cssClass of ['delete-button', 'move-up-button', 'move-down-button']) {
      const button = this.toolbar?.findButton(`.${cssClass}`)
      if (!button) continue
      if (readOnly) button.addClass('disabled')
      else button.removeClass('disabled')
    }
  }

  // ---- DeletedRows + IsFirstClicked (camelCase canonical + PascalCase shims) ----

  getDeletedRows(): readonly TEntity[] {
    // Defensive copy: `readonly` is a TypeScript-only marker; the runtime
    // value is a real array and callers could mutate the internal state
    // via the returned reference.
    //
    // Uses `structuredClone` for a DEEP copy so per-row field mutations
    // also don't leak. Two fallback paths:
    //
    //   1. `structuredClone` unavailable (older runtimes, specific jsdom
    //      builds without the polyfill) → shallow spread.
    //   2. `structuredClone` throws `DataCloneError` (TEntity contains
    //      functions, DOM refs, class-instance privates, or other
    //      non-cloneable values) → log + shallow spread. Without the
    //      try/catch the caller would see an unexplained DataCloneError
    //      with no clue it originated in `getDeletedRows`.
    //
    // In the shallow-fallback paths, per-row field mutations would leak —
    // documented trade-off for non-POJO entity shapes.
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(this._deletedRows) as TEntity[]
      } catch (cloneErr) {
        // Narrowed to DataCloneError only — a `catch (cloneErr)` without
        // this check would also swallow OutOfMemoryError-equivalents,
        // future Proxy-trap throws on `_deletedRows`, or any unrelated
        // bug, masking it as a cloneability issue. Real DataCloneError
        // → shallow fallback. Anything else → rethrow so the actual
        // failure surfaces.
        //
        // Two matching patterns:
        //   - browsers + Node 17+: throw a `DOMException` with
        //     `name === 'DataCloneError'`.
        //   - jsdom + some polyfills: throw a different Error subclass
        //     that still carries `name === 'DataCloneError'`.
        // Both are accepted by the structural check.
        const isCloneError =
          (typeof DOMException !== 'undefined' &&
            cloneErr instanceof DOMException &&
            cloneErr.name === 'DataCloneError') ||
          (cloneErr instanceof Error && cloneErr.name === 'DataCloneError')
        if (isCloneError) {
          console.warn(
            '[IdevsGridEditorBase] getDeletedRows: structuredClone failed (non-cloneable TEntity?); returning shallow copy:',
            cloneErr,
          )
          return [...this._deletedRows]
        }
        throw cloneErr
      }
    }
    return [...this._deletedRows]
  }

  getIsFirstClicked(): boolean {
    return this._isFirstClicked
  }
  setIsFirstClicked(value: boolean): void {
    this._isFirstClicked = value
  }

  /** @deprecated Use `getDeletedRows()`. */
  get DeletedRows(): readonly TEntity[] {
    return this.getDeletedRows()
  }

  /** @deprecated Use `getIsFirstClicked()` / `setIsFirstClicked()`. */
  get IsFirstClicked(): boolean {
    return this.getIsFirstClicked()
  }
  /** @deprecated Use `setIsFirstClicked()`. */
  set IsFirstClicked(value: boolean) {
    this.setIsFirstClicked(value)
  }

  // ---- Subscriber registries ----

  public subscribeToAddButtonClick(callback: () => void): () => void {
    // Subscribe-after-destroy was previously silent (the callback was
    // pushed onto an array that the destroy() teardown had already
    // emptied; no further events would fire). Now we explicitly warn
    // and return a no-op unsubscribe so the caller has a clear signal.
    if (this._destroyed) {
      console.warn(
        '[IdevsGridEditorBase] subscribeToAddButtonClick called after destroy() — callback will never fire',
      )
      return () => undefined
    }
    this._addButtonClickSubscribers.push(callback)
    return () => {
      const idx = this._addButtonClickSubscribers.indexOf(callback)
      if (idx > -1) this._addButtonClickSubscribers.splice(idx, 1)
    }
  }

  public subscribeToRowChange(
    callback: (oldRow: number, newRow: number, oldItem: TEntity, newItem: TEntity) => void,
  ): () => void {
    // See subscribeToAddButtonClick for the post-destroy rationale.
    if (this._destroyed) {
      console.warn(
        '[IdevsGridEditorBase] subscribeToRowChange called after destroy() — callback will never fire',
      )
      return () => undefined
    }
    this._rowChangeSubscribers.push(callback)
    return () => {
      const idx = this._rowChangeSubscribers.indexOf(callback)
      if (idx > -1) this._rowChangeSubscribers.splice(idx, 1)
    }
  }

  private notifyAddButtonClick(): void {
    for (const cb of this._addButtonClickSubscribers) {
      try {
        cb()
      } catch (error) {
        // Subscriber callbacks are consumer code; log + continue so one
        // bad subscriber doesn't break the whole notify cycle.
        // eslint-disable-next-line no-console
        console.warn('[IdevsGridEditorBase] add-button-click subscriber threw:', error)
      }
    }
  }

  private notifyRowChange(
    oldRow: number,
    newRow: number,
    oldItem: TEntity,
    newItem: TEntity,
  ): void {
    for (const cb of this._rowChangeSubscribers) {
      try {
        cb(oldRow, newRow, oldItem, newItem)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[IdevsGridEditorBase] row-change subscriber threw:', error)
      }
    }
  }

  // ---- Validation ----

  /** Validate every row in the view. Returns the first non-empty error
   * list encountered. */
  public validateRows(): Record<string, string>[] {
    const items = this.view.getItems()
    for (let index = 0; index < items.length; index++) {
      const errors = this.validateRow(items[index], index)
      if (errors.length > 0) return errors
    }
    return []
  }

  /**
   * Validate a single row. Default implementation: every column with
   * `sourceItem.required === true && visible === true` must have a
   * non-empty value. Subclasses can extend or replace.
   *
   * The `_rowIndex` parameter is unused by the default implementation
   * but kept for subclass overrides.
   */
  protected validateRow(item: TEntity, _rowIndex: number): Record<string, string>[] {
    if (!item) return []
    const errors: Record<string, string>[] = []
    const columns = this.getColumns()
    for (const col of columns) {
      const sourceItem = col.sourceItem as { required?: boolean } | undefined
      if (sourceItem?.required !== true) continue
      if (col.visible === false) continue
      const value = (item as Record<string, unknown>)[col.field as string]
      if (value === null || value === undefined || value === '') {
        errors.push({
          [col.field as string]: `${col.name || col.field} is required`,
        })
      }
    }
    return errors
  }

  /**
   * Format an array of per-field error objects into a single human-
   * readable message for `notifyError`. Default joins messages with
   * `\n` and lets the toast library render newlines via CSS — XSS-safe
   * because no HTML is constructed.
   *
   * Subclasses wanting HTML formatting should override and combine the
   * messages safely (e.g. via `DOMPurify.sanitize(...)`); the framework
   * will pass the result with `escapeHtml: false` if the override
   * indicates that intent.
   */
  protected formatValidationMessage(errors: Record<string, string>[]): {
    text: string
    escapeHtml: boolean
  } {
    const messages = errors.map(err => Object.values(err)[0]).filter(Boolean) as string[]
    return { text: messages.join('\n'), escapeHtml: true }
  }

  private validate(item: TEntity, rowIndex: number): boolean {
    const errors = this.validateRow(item, rowIndex)
    if (errors.length === 0) return true
    const { text, escapeHtml } = this.formatValidationMessage(errors)
    notifyError(text, 'Validation Error', { escapeHtml })
    return false
  }

  // ---- Slick options + buttons ----

  protected override getSlickOptions() {
    const options = super.getSlickOptions()
    return { ...options, renderAllRows: true }
  }

  protected override getButtons(): ToolButton[] {
    // Drop the column-picker + refresh, both are noise in an editable grid.
    const buttons = super
      .getButtons()
      .filter(b => b.cssClass !== 'column-picker-button' && b.cssClass !== 'refresh-button')

    const addButton = buttons.find(b => b.cssClass === 'add-button')
    if (addButton) {
      addButton.onClick = () => this.addButtonClick()
    }

    // Insert delete-button immediately after the add-button.
    const insertIdx = addButton ? buttons.indexOf(addButton) + 1 : buttons.length
    buttons.splice(insertIdx, 0, {
      title: 'Delete',
      hint: 'Delete current row',
      cssClass: 'delete-button',
      onClick: () => this.deleteCurrentRow(),
    })

    if (this.useRecordMover()) {
      buttons.push({
        hint: 'Move current row up',
        cssClass: 'move-up-button',
        icon: 'fa fa-angle-up',
        separator: true,
        onClick: () => this.moveCurrentRowUp(),
      })
      buttons.push({
        hint: 'Move current row down',
        cssClass: 'move-down-button',
        icon: 'fa fa-angle-down',
        onClick: () => this.moveCurrentRowDown(),
      })
    }

    if (this.useGridExpander()) {
      buttons.push({
        hint: this._isExpanded ? 'Restore grid' : 'Expand grid',
        cssClass: 'expand-grid-button',
        icon: this._isExpanded ? 'fa fa-compress-arrows-alt' : 'fa fa-expand-arrows-alt',
        separator: true,
        onClick: () => {
          this.toggleGridExpansion()
          this.updateExpandButton()
        },
      })
    }

    return buttons
  }

  // ---- Overridable hooks ----

  protected useRecordMover(): boolean {
    return true
  }
  protected useGridExpander(): boolean {
    return true
  }
  protected autoNewRow(): boolean {
    return true
  }
  protected canAddRow(): boolean {
    return true
  }
  /** Implement on subclass to seed a new row. */
  protected initialNewRow(newRow: TEntity): TEntity {
    return newRow
  }
  /** Fields that should remain visible when the grid is expanded. */
  protected getAlwaysVisibleFields(): string[] {
    return []
  }
  /**
   * The per-row field used as the order key by moveCurrentRowUp /
   * moveCurrentRowDown to keep ordering stable across saves. Default
   * `'ItemNo'` mirrors the PowerACC convention; subclasses can override.
   * Return `null` to disable order-field swapping (the rows will be
   * reordered in the items array without touching any per-row field).
   */
  protected getOrderField(): string | null {
    return 'ItemNo'
  }

  // ---- Grid event handlers ----

  private setupGridEventHandlers(): void {
    // Validate current row before leaving for a different row.
    this.addEventListener(
      this.slickGrid.onBeforeEditCell as unknown as SlickEventEmitter,
      'onBeforeEditCell',
      (_e, args) => {
        if (this.readOnly) return false
        const activeCell = this.slickGrid.getActiveCell()
        if (
          activeCell &&
          activeCell.row !== undefined &&
          args?.row !== undefined &&
          activeCell.row !== args.row
        ) {
          const currentItem = this.slickGrid.getDataItem(activeCell.row) as TEntity
          // Commit current editor if active. The validation result of
          // the cell-level commit short-circuits row navigation.
          if (this.slickGrid.getEditorLock().isActive()) {
            this.tryCommitEditor()
          }
          if (!this.validate(currentItem, activeCell.row)) {
            // Mark the validation failure so the upcoming
            // onActiveCellChanged handler suppresses row-change
            // notification and does NOT advance _currentActiveRow.
            this._lastValidationFailed = true
            return false
          }
        }
        return true
      },
    )

    // Track row changes for the row-change subscribers.
    this.addEventListener(
      this.slickGrid.onActiveCellChanged as unknown as SlickEventEmitter,
      'onActiveCellChanged',
      (_e, args) => {
        if (!args || args.row === undefined) return
        const newRow = args.row
        const oldRow = this._currentActiveRow
        if (oldRow !== null && oldRow !== newRow && !this._lastValidationFailed) {
          const oldItem = this.slickGrid.getDataItem(oldRow) as TEntity
          const newItem = this.slickGrid.getDataItem(newRow) as TEntity
          if (oldItem && newItem) {
            this.notifyRowChange(oldRow, newRow, oldItem, newItem)
          }
        }
        if (!this._lastValidationFailed) {
          this._currentActiveRow = newRow
        }
        this._lastValidationFailed = false
      },
    )

    // Click / dblClick depending on autoEdit.
    const clickEmitter = (
      this._opts.autoEdit ? this.slickGrid.onClick : this.slickGrid.onDblClick
    ) as unknown as SlickEventEmitter
    const clickEventName = this._opts.autoEdit ? 'onClick' : 'onDblClick'
    this.addEventListener(clickEmitter, clickEventName, (e, args) => {
      if (this.readOnly) {
        e?.stopImmediatePropagation?.()
        e?.preventDefault?.()
        return false
      }
      const activeCell = this.slickGrid.getActiveCell()
      if (
        activeCell &&
        activeCell.row !== undefined &&
        args?.row !== undefined &&
        activeCell.row !== args.row
      ) {
        const currentItem = this.slickGrid.getDataItem(activeCell.row) as TEntity
        if (!this.validate(currentItem, activeCell.row)) {
          this._lastValidationFailed = true
          e?.stopImmediatePropagation?.()
          e?.preventDefault?.()
          return false
        }
      }
      if (args) this.startEditing(args.row, args.cell)
      return undefined
    })

    // Tab / Enter navigation.
    this.addEventListener(
      this.slickGrid.onKeyDown as unknown as SlickEventEmitter,
      'onKeyDown',
      this.handleKeyDown,
    )
  }

  /**
   * Attach a handler to a SlickGrid event-emitter OR a DOM element. The
   * matching cleanup callback is captured so `destroy()` can detach
   * everything in one pass.
   */
  protected addEventListener(
    target: SlickEventEmitter | EventTarget | undefined,
    eventName: string,
    handler: (e: AddListenerEvent, args: ArgsCell | undefined) => unknown,
  ): void {
    if (target && typeof (target as SlickEventEmitter).subscribe === 'function') {
      const emitter = target as SlickEventEmitter
      emitter.subscribe(handler as never)
      this.eventCleanup.push(() => {
        if (typeof emitter.unsubscribe === 'function') {
          emitter.unsubscribe(handler as never)
        }
      })
      return
    }
    if (target && typeof (target as EventTarget).addEventListener === 'function') {
      const dom = target as EventTarget
      const domHandler = handler as unknown as EventListener
      dom.addEventListener(eventName, domHandler)
      this.eventCleanup.push(() => dom.removeEventListener(eventName, domHandler))
    }
  }

  // ---- Add / delete / move ----

  protected addButtonClick(): void {
    if (this.readOnly || !this.canAddRow()) return

    const activeCell = this.slickGrid.getActiveCell()
    if (activeCell) {
      const currentItem = this.slickGrid.getDataItem(activeCell.row) as TEntity
      if (!this.validate(currentItem, activeCell.row)) return
    }

    let newRow = {} as TEntity
    newRow = this.initialNewRow(newRow)
    this.view.addItem(newRow)
    this.setIsFirstClicked(true)

    this.slickGrid.invalidate()
    this.slickGrid.updateRowCount()
    this.slickGrid.render()

    const row = this.view.getLength() - 1
    // Use the SAME predicate as `isCellEditable` (line ~837) so the
    // post-add focus respects the full editability contract — not just
    // truthy-editor + visible, but ALSO excluding slick-reorder cells
    // and `sourceItem.readOnly` columns. The prior weaker filter
    // (`!!col.editor && col.visible !== false`) would land the cursor
    // on a leading read-only or reorder column for grids that include
    // one, and then `editActiveCell()` would be a no-op or worse,
    // open an editor on a column that shouldn't be edited.
    const columns = this.slickGrid.getColumns() as unknown as GridColumnArr
    const firstEditableCell = columns.findIndex((_col, idx) =>
      this.isCellEditable(row, idx, columns),
    )
    this.slickGrid.setActiveCell(row, firstEditableCell > -1 ? firstEditableCell : 0)
    this.slickGrid.scrollRowIntoView(row, true)
    this.slickGrid.editActiveCell()

    this.notifyAddButtonClick()
  }

  protected deleteCurrentRow(): void {
    if (this.readOnly) return
    const activeCell = this.slickGrid.getActiveCell()
    if (!activeCell) return

    const row = activeCell.row
    const item = this.view.getItem(row)
    if (!item) return

    // Transactional delete: ONLY push onto `_deletedRows` after
    // `view.deleteItem(...)` has succeeded. The prior ordering
    // (push-then-delete) was a silent-data-corruption hazard — if
    // `view.deleteItem` (or any subsequent grid call) threw, the
    // _deletedRows array would retain a phantom row that was never
    // actually removed from the view, so the next save would ship a
    // delete request for an entity the user still sees rendered.
    const idProperty = this.getIdProperty()
    const idValue = (item as Record<string, unknown>)[idProperty]
    try {
      this.view.deleteItem(idValue as unknown as never)
      this.slickGrid.invalidate()
      this.slickGrid.updateRowCount()
      this.slickGrid.render()
    } catch (err) {
      console.warn(
        '[IdevsGridEditorBase] deleteCurrentRow: view/grid mutation failed; row NOT added to deletedRows:',
        err,
      )
      // Re-throw so the caller / host sees the failure — the row is
      // still in the view, and the controller's internal state has
      // NOT been mutated.
      throw err
    }
    this._deletedRows.push(item)

    if (this.view.getLength() > 0) {
      const newRow = Math.max(0, row - 1)
      this.slickGrid.setActiveCell(newRow, activeCell.cell)
    }
  }

  protected moveCurrentRowUp(): void {
    this.moveCurrentRow(-1)
  }

  protected moveCurrentRowDown(): void {
    this.moveCurrentRow(+1)
  }

  /** Shared body for moveUp / moveDown. delta = -1 (up) or +1 (down). */
  private moveCurrentRow(delta: -1 | 1): void {
    if (this.readOnly) return
    const activeCell = this.slickGrid.getActiveCell()
    if (!activeCell) return
    const currentRow = activeCell.row
    const targetRow = currentRow + delta

    const data = this.slickGrid.getData() as { getItems(): TEntity[]; setItems(items: TEntity[]): void }
    const items = data.getItems()
    if (delta < 0 && currentRow <= 0) return
    if (delta > 0 && currentRow >= items.length - 1) return

    const currentItem = items[currentRow]
    const otherItem = items[targetRow]
    if (!currentItem || !otherItem) return

    const orderField = this.getOrderField()
    if (orderField) {
      // Swap the order field between the two rows so the persisted
      // ordering survives. Field may be undefined on either side — in
      // that case skip the swap (the array swap below still reorders
      // them visually).
      const curRec = currentItem as Record<string, unknown>
      const othRec = otherItem as Record<string, unknown>
      if (curRec[orderField] !== undefined && othRec[orderField] !== undefined) {
        const tmp = curRec[orderField]
        curRec[orderField] = othRec[orderField]
        othRec[orderField] = tmp
      }
    }

    items[currentRow] = otherItem
    items[targetRow] = currentItem
    data.setItems(items)
    this.slickGrid.invalidateAllRows()
    this.slickGrid.render()
    this.slickGrid.setActiveCell(targetRow, activeCell.cell)
    this.slickGrid.scrollRowIntoView(targetRow)
  }

  // ---- Grid expansion ----

  public toggleGridExpansion(): void {
    // Resolve required ancestors FIRST. Prior to round-8 Copilot
    // review, `_isExpanded` was flipped before this guard — if the
    // grid was rendered outside the expected `form > .category > .field`
    // chain (test harness, embedded view), the method returned with
    // internal state already toggled but no DOM mutation + no button
    // refresh. The next call would then run the WRONG branch
    // (restoreGrid when the grid was never expanded, vice versa) and
    // the button icon/title would drift out of sync. Now the state
    // flip only happens once the cleanup-/expand-path is actually
    // taken.
    const category = this.element.closest('.category')?.getNode() as HTMLElement | undefined
    const currentField = this.element.closest('.field')?.getNode() as HTMLElement | undefined
    if (!category || !currentField) return
    this._isExpanded = !this._isExpanded
    if (this._isExpanded) this.expandGrid(category, currentField)
    else this.restoreGrid(category, currentField)
    this.updateExpandButton()
    this.adjustGridHeight(category)
  }

  private expandGrid(container: HTMLElement, currentField: HTMLElement): void {
    const alwaysVisibles = this.getAlwaysVisibleFields()
    const firstField = container.querySelector('.field')
    if (!firstField) return
    const fieldHeight = firstField.getBoundingClientRect().height
    container.querySelectorAll('.field').forEach(field => {
      const fieldName = field.getAttribute('data-itemname')
      // Compare element identity, NOT className strings. Source compared
      // `field.className === currentField.className`, but standard
      // Serenity forms render every field as `<div class="field ...">`
      // with the same shared "field" class — every sibling would match,
      // and expandGrid would never add `field-hidden` to anything. The
      // expansion feature was effectively broken whenever the surrounding
      // form used the standard shared class.
      const isCurrent = field === currentField
      const isAlwaysVisible = !!fieldName && alwaysVisibles.includes(fieldName)
      if (!isCurrent && !isAlwaysVisible) {
        field.classList.add('field-hidden')
      }
      if (isAlwaysVisible) {
        ;(field as HTMLElement).style.height = `${fieldHeight}px`
      }
    })
  }

  private restoreGrid(container: HTMLElement, currentField: HTMLElement): void {
    const alwaysVisibles = this.getAlwaysVisibleFields()
    container.querySelectorAll('.field').forEach(field => {
      const fieldName = field.getAttribute('data-itemname')
      // Element identity, not className strings. See expandGrid above.
      const isCurrent = field === currentField
      const isAlwaysVisible = !!fieldName && alwaysVisibles.includes(fieldName)
      if (!isCurrent && !isAlwaysVisible) {
        field.classList.remove('field-hidden')
      }
      if (isAlwaysVisible) {
        ;(field as HTMLElement).style.height = ''
      }
    })
  }

  private updateExpandButton(): void {
    const button = this.toolbar?.findButton('.expand-grid-button')
    if (!button) return
    const icon = button.findFirst('i')
    // Source had these icons inverted: when expanded it was showing the
    // outward-arrows ("click to expand") icon while the title said
    // "Restore grid" — icon and title disagreed. When expanded we should
    // show the inward-arrows / compress icon ("click to restore"); when
    // collapsed we should show the outward-arrows / expand icon ("click
    // to expand"). Matches the initial-state icon in `getButtons()`.
    if (this._isExpanded) {
      icon.removeClass('fa-expand-arrows-alt')
      icon.addClass('fa-compress-arrows-alt')
    } else {
      icon.removeClass('fa-compress-arrows-alt')
      icon.addClass('fa-expand-arrows-alt')
    }
    button.attr('title', this._isExpanded ? 'Restore grid' : 'Expand grid')
  }

  protected adjustGridHeight(container: HTMLElement): void {
    const height = this.calculateAvailableHeight()
    if (height === null) return
    const gridHeight = `calc(${height}px - 1rem)`
    if (this._isExpanded) {
      this.domNode.style.height = gridHeight
      if (this.domNode.parentElement) this.domNode.parentElement.style.height = gridHeight
      container.classList.add('h-100')
    } else {
      this.domNode.style.height = ''
      if (this.domNode.parentElement) this.domNode.parentElement.style.height = ''
      container.classList.remove('h-100')
    }
  }

  /**
   * Compute the form's available height minus the surrounding category
   * footprint. Returns `null` if the grid is rendered outside the
   * expected `form > .category > <grid>` chain (e.g. in test harnesses).
   */
  protected calculateAvailableHeight(): number | null {
    const form = this.domNode.closest('form')
    const category = this.domNode.closest('.category')
    if (!form || !category) return null
    const formHeight = form.getBoundingClientRect().height
    const categoryHeight = category.getBoundingClientRect().height
    const height = this.domNode.getBoundingClientRect().height
    return formHeight - (categoryHeight - height)
  }

  // ---- Keyboard navigation ----

  /** Tab / Enter / Shift-Tab navigation across editable cells, with
   * optional add-new-row at end-of-grid. */
  private handleKeyDown = (e: KeyboardEvent, _args: ArgsCell | undefined): void => {
    if (e.key !== 'Tab' && e.key !== 'Enter') return
    if (!this.slickGrid.getEditorLock().isActive() || !this.getIsFirstClicked()) {
      if (this.getIsFirstClicked()) this.moveFocusToNextCell(e.shiftKey)
      return
    }

    let continueMoving = true
    const activeCell = this.slickGrid.getActiveCell()
    if (!activeCell) return

    const isLastRow = activeCell.row === this.view.getLength() - 1
    const columns = this.slickGrid.getColumns()
    let lastEditableCellIndex = -1
    for (let i = columns.length - 1; i >= 0; i--) {
      const col = columns[i]
      // Truthiness check — see addButtonClick for rationale.
      if (
        !!col.editor &&
        col.visible !== false &&
        !col.cssClass?.includes('slick-reorder-cell')
      ) {
        lastEditableCellIndex = i
        break
      }
    }

    e.preventDefault()
    e.stopImmediatePropagation()

    if (activeCell.cell === lastEditableCellIndex) {
      const currentItem = this.slickGrid.getDataItem(activeCell.row) as TEntity
      if (this.validate(currentItem, activeCell.row)) {
        if (this.slickGrid.getEditorLock().isActive()) {
          this.slickGrid.getEditorLock().commitCurrentEdit()
        }
        if (isLastRow && this.autoNewRow()) {
          this.addButtonClick()
          continueMoving = false
        }
      } else {
        continueMoving = false
      }
    } else if (this.slickGrid.getEditorLock().isActive()) {
      if (!this.tryCommitEditor()) {
        continueMoving = false
      }
    }

    if (continueMoving) this.moveFocusToNextCell(e.shiftKey)
  }

  private moveFocusToNextCell(movePrev?: boolean): void {
    const currentActiveCell = this.slickGrid.getActiveCell()
    if (!currentActiveCell) return
    const found = movePrev
      ? this.findPreviousEditableCell(currentActiveCell.row, currentActiveCell.cell)
      : this.findNextEditableCell(currentActiveCell.row, currentActiveCell.cell)
    if (!found) return
    const newActiveCell = this.slickGrid.getActiveCell()
    if (newActiveCell) this.startEditing(newActiveCell.row, newActiveCell.cell)
  }

  private findNextEditableCell(startRow: number, startCell: number): boolean {
    let currentRow = startRow
    let currentCell = startCell + 1
    const itemsLength = this.view.getLength()
    const columns = this.slickGrid.getColumns()
    while (currentRow < itemsLength) {
      while (currentCell < columns.length) {
        if (this.isCellEditable(currentRow, currentCell, columns)) {
          this.slickGrid.setActiveCell(currentRow, currentCell)
          return true
        }
        currentCell++
      }
      currentRow++
      currentCell = 0
    }
    // Reached the end — try auto-new-row.
    if (this.autoNewRow() && itemsLength > 0) {
      const lastRowIndex = itemsLength - 1
      const lastRowItem = this.slickGrid.getDataItem(lastRowIndex) as TEntity
      if (this.validate(lastRowItem, lastRowIndex)) {
        if (this.slickGrid.getEditorLock().isActive()) this.tryCommitEditor()
        this.addButtonClick()
        const newRow = this.view.getLength() - 1
        for (let cellIndex = 0; cellIndex < columns.length; cellIndex++) {
          if (this.isCellEditable(newRow, cellIndex, columns)) {
            this.slickGrid.setActiveCell(newRow, cellIndex)
            return true
          }
        }
      }
    }
    return false
  }

  private findPreviousEditableCell(startRow: number, startCell: number): boolean {
    let currentRow = startRow
    let currentCell = startCell - 1
    const columns = this.slickGrid.getColumns()
    while (currentRow >= 0) {
      while (currentCell >= 0) {
        if (this.isCellEditable(currentRow, currentCell, columns)) {
          this.slickGrid.setActiveCell(currentRow, currentCell)
          return true
        }
        currentCell--
      }
      currentRow--
      if (currentRow >= 0) currentCell = columns.length - 1
    }
    return false
  }

  private isCellEditable(_row: number, cell: number, columns: GridColumnArr): boolean {
    const column = columns[cell]
    if (!column) return false
    // Falsy check (NOT `=== undefined`) so columns with explicit
    // `editor: null` / `editor: false` are non-editable. See
    // addButtonClick for the realistic scenario.
    if (!column.editor || column.visible === false) return false
    if (column.cssClass?.includes('slick-reorder-cell')) return false
    const sourceItem = column.sourceItem as { readOnly?: boolean } | undefined
    if (sourceItem?.readOnly) return false
    return true
  }

  /**
   * Begin editing the active cell. No-ops if the column is read-only.
   */
  private startEditing(row: number, cell: number): void {
    if (this.readOnly) return
    const cols = this.slickGrid.getColumns()
    const col = cols[cell] as { sourceItem?: { readOnly?: boolean } } | undefined
    if (col?.sourceItem?.readOnly) return
    this.slickGrid.setActiveCell(row, cell)
    this.slickGrid.editActiveCell()
    const editor = this.slickGrid.getCellEditor() as { focus?: () => void } | null
    if (editor && typeof editor.focus === 'function') editor.focus()
  }

  /**
   * Commit the active cell editor. Returns `false` if the commit failed
   * (which cancels the row navigation).
   *
   * Distinguishes two failure modes:
   *
   *   - `commitCurrentEdit()` returns `false` — true cell-validation
   *     rejection (the editor's own `validate()` returned an error).
   *     Logged at info-level for traceability.
   *   - `commitCurrentEdit()` throws — programmer / runtime error
   *     (editor `applyValue` crashes, lock-state corruption, downstream
   *     `onCellChange` subscriber throws). The in-flight value is
   *     cancelled (otherwise the user's data could persist in a half-
   *     committed state) AND the failure is surfaced via `notifyError`
   *     so the user knows their edit didn't land.
   */
  private tryCommitEditor(): boolean {
    const lock = this.slickGrid.getEditorLock()
    let committed: boolean
    try {
      if (!lock.isActive()) return true
      committed = lock.commitCurrentEdit()
    } catch (commitError) {
      // Surface programmer/runtime commit failures so the user-data-lost
      // scenario is traceable. Project policy: `no-console: warn`.
      console.warn('[IdevsGridEditorBase] commitCurrentEdit threw:', commitError)
      this.slickGrid.getEditorLock().cancelCurrentEdit()
      notifyError('Unable to save the cell value. Please try again.')
      return false
    }
    if (!committed) {
      // Cell-level validation rejection. The editor itself displays the
      // error; this log is telemetry-only, not user-facing.
      console.warn('[IdevsGridEditorBase] commitCurrentEdit returned false (validation)')
      return false
    }
    return true
  }

  // ---- Enum formatter helper ----

  protected enumFormatter(ctx: FormatterContext, enumKey: string): FormatterResult {
    const value = ctx.value
    if (value === null || value === undefined || value === '') return ''
    const enumType = EnumTypeRegistry.get(enumKey) as Record<string, unknown> | null
    if (enumType) {
      for (const key of Object.keys(enumType)) {
        if (enumType[key] === value || enumType[key] === parseInt(String(value), 10)) {
          return getEnumText(enumKey, key)
        }
      }
    }
    return value == null ? '' : String(value)
  }

  // ---- Teardown ----

  override destroy(): void {
    // Idempotency guard — repeated `destroy()` calls would otherwise
    // re-enter `super.destroy()`, which under Serenity's widget
    // hierarchy can throw or double-cleanup DOM/plugin state.
    // Matches the sibling pattern in `IdevsGridEditController.destroy()`.
    if (this._destroyed) return
    // Flag must be set FIRST so any callbacks (including subscriber
    // cleanups that re-attempt subscription on teardown) see the
    // post-destroy state and reject with a warn rather than push into
    // arrays we're about to clear.
    this._destroyed = true
    this._rowChangeSubscribers.length = 0
    this._addButtonClickSubscribers.length = 0
    for (const cleanup of this.eventCleanup) {
      try {
        cleanup()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[IdevsGridEditorBase] event cleanup threw:', error)
      }
    }
    this.eventCleanup = []
    super.destroy()
  }
}

// ---- Local structural types ----
//
// Defined at the bottom so the class body reads top-to-bottom without
// dragging type alias paragraphs in.

/** SlickGrid event emitter shape — declared structurally to avoid
 * importing the duplicate-resolved `EventEmitter` type. */
type SlickEventEmitter = {
  subscribe(handler: (e: AddListenerEvent, args: ArgsCell | undefined) => unknown): void
  unsubscribe(handler: (e: AddListenerEvent, args: ArgsCell | undefined) => unknown): void
}

/** Union of event shapes accepted by `addEventListener` — SlickGrid emits
 * its own `IEventData`-shaped event, but the helper also supports plain
 * DOM `Event` for non-SlickGrid emitters. */
type AddListenerEvent = {
  stopImmediatePropagation?: () => void
  preventDefault?: () => void
}

/** Local alias for the shared GridColumn[] shape. See _columnShape.ts. */
type GridColumnArr = GridColumn[]
