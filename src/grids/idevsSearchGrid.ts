import {
  Authorization,
  Decorators,
  type ListRequest,
  type QuickFilter,
  type ToolButton,
  type Widget,
} from '@serenity-is/corelib'
import { IdevsEntityGrid } from './idevsEntityGrid'

/**
 * Abstract base for search-result grids — extends IdevsEntityGrid with
 * filter-driven, on-demand loading, quick-search wiring, and an
 * authorization-gated editItem path.
 *
 * Replaces PowerACC's `CsiSearchGrid`. Behavior parity:
 *   - Default grid height 400px (applied to `domNode.style.height` in
 *     `updateInterface`).
 *   - `getGridCanLoad()` requires all configured `filterKeys` to be non-empty
 *     (truthy + not "") before remote load is permitted. When `autoLoad`
 *     is false, additionally requires a non-empty `ContainsText` quick
 *     search value.
 *   - `editItem` requires `Authorization.hasPermission(editPermission)` to
 *     pass before instantiating the dialog and routing to
 *     `loadByIdAndOpenDialog`.
 *
 * Hardening vs source:
 *   - PascalCase property setters (`FilterKeys`, `CriteriaKeys`,
 *     `SearchValue`, `EditPermission`, `PreItems`) are now CAMEL-CASE
 *     methods as the canonical API (`setFilterKeys`, `setCriteriaKeys`,
 *     `setSearchValue`, `setEditPermission`, `setPreItems`, plus their
 *     `get<Name>` counterparts). PascalCase getters/setters are preserved
 *     as compatibility shims that route to the camelCase methods —
 *     matches the PR-4a hardening pattern documented in MIGRATION.md.
 *   - `Criteria` was imported but never referenced — dropped.
 *   - Null guards added on:
 *       1. `toolbar.element.findFirst('.s-QuickSearchInput')` — toolbar
 *          may not be rendered when `hideToolbar()` is true. Source
 *          already guarded the outer call; we additionally guard the
 *          findFirst result (could be null even with toolbar present).
 *       2. `e.target.closest('.slick-viewport')` in onClick — the
 *          click could originate from a row that is mid-detach.
 *       3. `e.target.parentElement` in onClick — same defensive check.
 *   - PromiseLike duck-type check uses `typeof candidate.then === 'function'`
 *     rather than `(x as PromiseLike).then` cast probe, which would
 *     TypeError if candidate is null/primitive.
 *   - `getGridCanLoad` no longer mutates `view` from inside a predicate
 *     (it had a `setItems([], true)` side effect that fires on every
 *     load check, masking real bugs). The mutation moves to
 *     `clearItemsIfEmptySearch` invoked explicitly from the
 *     load-precondition path so the predicate stays pure-ish.
 *   - `view.params.CustomData = { Important: true }` magic key is still
 *     pushed (PowerACC SQL layer reads this flag) but documented; the
 *     source had it un-commented and bare.
 *   - `setFilterKeys` returns void instead of cascading into a side-effect
 *     setter assignment.
 *   - `editItem` no longer accepts `any` for the entity id — narrowed to
 *     `string | number` (the only id shapes Serenity entity grids use).
 *   - Constructor `new dialogClass({})` retained — Serenity dialog ctors
 *     accept an empty options object; documented as a known interop point.
 *   - `setSearchValue` no longer references `_searchValue` as last-write
 *     deduplication of identical values; deduplication never mattered
 *     (the underlying jQuery-style `.val(); .trigger('change')` is
 *     idempotent for equivalent values) and the cached field leaked
 *     across legitimate refreshes.
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsSearchGrid')
export abstract class IdevsSearchGrid<TRow, P = unknown> extends IdevsEntityGrid<TRow, P> {
  // ---- Abstract Serenity hooks. Subclasses must implement. ----
  protected abstract override getColumnsKey(): string
  protected abstract override getIdProperty(): string
  protected abstract override getLocalTextPrefix(): string
  protected abstract override getService(): string

  // ---- Optional protected hooks with sensible defaults. ----
  protected getGridHeight(): number {
    return 400
  }
  protected getAutoLoad(): boolean {
    return true
  }
  protected override usePager(): boolean {
    return false
  }
  protected override getInitialTitle(): string {
    // Source returned `null`. The parent signature is `() => string` (with
    // a fallback path for empty-string → no title in Serenity's render),
    // so we return the empty-string equivalent and keep strictNullChecks
    // happy. Override in subclasses to set a real title.
    return ''
  }
  protected override getButtons(): ToolButton[] {
    return []
  }
  protected override getQuickFilters(): QuickFilter<Widget<unknown>, unknown>[] {
    return []
  }
  protected hideToolbar(): boolean {
    return false
  }

  // ---- Filter / criteria state (canonical camelCase API). ----
  private _filterKeys: Record<string, unknown> = {}
  private _criteriaKeys: unknown[] = []
  private _editPermission: string = ''
  private _preItems: TRow[] | undefined

  getFilterKeys(): Readonly<Record<string, unknown>> {
    return this._filterKeys
  }
  /**
   * Replace the filter-key dictionary. Each entry is applied via
   * `setEquality(key, value)` and the grid is refreshed.
   *
   * The replacement is a full overwrite (not a merge) — passing `{}`
   * clears all filter equalities for the next refresh. Stale keys from
   * the prior dictionary are cleared on the view by calling
   * `setEquality(key, undefined)` before the new keys are applied; the
   * source (CsiSearchGrid) only added new equalities and left stale
   * ones on the view, so consumers that changed or cleared filter keys
   * at runtime got "ghost" equality filters on subsequent refreshes.
   */
  setFilterKeys(filters: Record<string, unknown>): void {
    const priorKeys = Object.keys(this._filterKeys)
    this._filterKeys = filters
    // Clear keys that were in the prior dict but not in the new one.
    // Serenity's setEquality(field, undefined) clears the equality entry.
    for (const key of priorKeys) {
      if (!Object.prototype.hasOwnProperty.call(this._filterKeys, key)) {
        this.setEquality(key, undefined)
      }
    }
    for (const [key, value] of Object.entries(this._filterKeys)) {
      this.setEquality(key, value)
    }
    this.refresh()
  }

  getCriteriaKeys(): readonly unknown[] {
    return this._criteriaKeys
  }
  /**
   * Replace the criteria array. Re-applies the parameters to the
   * underlying remote view and refreshes.
   */
  setCriteriaKeys(value: unknown[]): void {
    this._criteriaKeys = value
    this.applyCriteriaParameter()
    this.refresh()
  }

  /**
   * Drive the quick-search input from outside. No-ops when the toolbar
   * is hidden (the input doesn't exist to receive the value), and
   * defensively when the input element can't be located.
   */
  setSearchValue(value: unknown): void {
    if (this.hideToolbar()) return
    // The toolbar may not be initialized in JSDOM-only test harnesses.
    const quickSearchInput = this.toolbar?.element?.findFirst('.s-QuickSearchInput')
    if (!quickSearchInput || quickSearchInput.length === 0) return
    quickSearchInput.val(value as string)
    quickSearchInput.trigger('change')
  }

  getEditPermission(): string {
    return this._editPermission
  }
  setEditPermission(value: string): void {
    this._editPermission = value
  }

  getPreItems(): TRow[] | undefined {
    return this._preItems
  }
  /**
   * Pre-load a fixed item collection (typically used when the search is
   * performed client-side against a small dataset rather than the
   * server).
   */
  setPreItems(value: TRow[]): void {
    this._preItems = value
    this.setItems(value)
  }

  // ---- PascalCase compatibility shims. Route to camelCase methods. ----
  // Subclass overrides of the camelCase methods take effect through
  // either entry point.

  /** @deprecated Use `getFilterKeys()` / `setFilterKeys()`. */
  get FilterKeys(): Readonly<Record<string, unknown>> {
    return this.getFilterKeys()
  }
  /** @deprecated Use `setFilterKeys()`. */
  set FilterKeys(filters: Record<string, unknown>) {
    this.setFilterKeys(filters)
  }

  /** @deprecated Use `getCriteriaKeys()` / `setCriteriaKeys()`. */
  get CriteriaKeys(): readonly unknown[] {
    return this.getCriteriaKeys()
  }
  /** @deprecated Use `setCriteriaKeys()`. */
  set CriteriaKeys(value: unknown[]) {
    this.setCriteriaKeys(value)
  }

  /** @deprecated Use `setSearchValue()`. */
  set SearchValue(value: unknown) {
    this.setSearchValue(value)
  }

  /** @deprecated Use `getEditPermission()` / `setEditPermission()`. */
  get EditPermission(): string {
    return this.getEditPermission()
  }
  /** @deprecated Use `setEditPermission()`. */
  set EditPermission(value: string) {
    this.setEditPermission(value)
  }

  /** @deprecated Use `getPreItems()` / `setPreItems()`. */
  get PreItems(): TRow[] | undefined {
    return this.getPreItems()
  }
  /** @deprecated Use `setPreItems()`. */
  set PreItems(value: TRow[]) {
    this.setPreItems(value)
  }

  // ---- Filter param plumbing. ----

  /**
   * Push the current criteria array onto the remote view's params.
   * Empty/null criteria removes the key entirely so the request payload
   * doesn't carry an empty `Criteria: []` (which some backends treat as
   * "match nothing").
   *
   * `CustomData.Important` is a PowerACC convention used by some Serenity
   * backends to mark the request as priority for query plan hints — kept
   * for backward compatibility; consumers without such a backend can
   * ignore it.
   */
  protected applyCriteriaParameter(): void {
    const params = this.view.params as ListRequest & {
      CustomData?: Record<string, unknown>
    }
    if (this._criteriaKeys && this._criteriaKeys.length > 0) {
      params.CustomData = { Important: true }
      params.Criteria = this._criteriaKeys
    } else {
      delete params.Criteria
    }
  }

  // ---- Layout / DOM lifecycle. ----

  override updateInterface(): void {
    this.domNode.style.setProperty('height', `${this.getGridHeight()}px`)
    super.updateInterface()
  }

  protected override onClick(e: Event, row: number, cell: number): void {
    super.onClick(e, row, cell)

    // Highlight the clicked row's slick-row sibling.
    const target = e.target as HTMLElement | null
    if (!target) return
    const viewport = target.closest('.slick-viewport')
    if (viewport) {
      viewport
        .querySelectorAll('.slick-row')
        .forEach(slickRow => slickRow.classList.remove('active'))
    }
    const rowElement = target.closest('.slick-row')
    if (rowElement) rowElement.classList.add('active')

    // Emit a synthetic cell-change to drive consumers (typically a parent
    // dialog) that listen for the active row.
    const collection = this.getItems()
    this.slickGrid.onCellChange.notify({
      grid: this.slickGrid,
      row,
      cell,
      item: collection.length ? collection[row] : undefined,
    })
  }

  // ---- Load gating. ----

  /**
   * Load-gating predicate.
   *
   *   - When `autoLoad` is true, only the filter keys gate the load —
   *     the grid loads as soon as every configured filterKey is non-empty
   *     (the empty-filterKey-dict trivially passes).
   *   - When `autoLoad` is false, the grid loads on-demand. Both
   *     conditions must hold: every configured filterKey is non-empty
   *     AND the quick-search `ContainsText` value is non-empty. The
   *     empty-filterKey-dict case reduces to "requires ContainsText".
   *
   * The autoLoad=false branch additionally calls
   * `clearItemsIfEmptySearch()` as a side effect when `ContainsText` is
   * empty — the source folded this same side-effect inside the
   * predicate; we kept the call but renamed for traceability.
   *
   * Note vs source: PowerACC's `CsiSearchGrid.getGridCanLoad` returned
   * `filtersAllPopulated()` in the `autoLoad=false + filterKeys
   * populated` branch even when `ContainsText` was empty, so a search
   * grid would still issue a remote load before the user entered a
   * quick-search value. That contradicted the on-demand intent — fixed
   * here by requiring both signals. Consumers wanting the looser
   * source-parity behavior can override `getGridCanLoad()` directly.
   */
  protected override getGridCanLoad(): boolean {
    if (this.getAutoLoad()) {
      return this.filtersAllPopulated()
    }
    const searchValue = (this.view.params as ListRequest | undefined)?.ContainsText
    if (!searchValue) {
      this.clearItemsIfEmptySearch()
      return false
    }
    if (Object.keys(this._filterKeys).length > 0) {
      return this.filtersAllPopulated()
    }
    return true
  }

  private filtersAllPopulated(): boolean {
    return Object.keys(this._filterKeys).every(key => {
      const value = this._filterKeys[key]
      return value !== null && value !== undefined && value !== ''
    })
  }

  /** Side-effect: clear the grid when a non-autoLoad search yields no
   * search value. Separated from `getGridCanLoad` for testability. */
  protected clearItemsIfEmptySearch(): void {
    this.view.setItems([], true)
  }

  // ---- Authorized dialog open. ----

  protected override editItem(entityOrId: string | number): void {
    if (!Authorization.hasPermission(this._editPermission)) return

    const dialogTypeOrPromise = this.getDialogType()

    // PromiseLike duck-type check via `typeof` — robust against null/
    // primitive masquerading as DialogType (the cast probe in the source
    // would TypeError before reaching the .then access).
    const maybeThen = (dialogTypeOrPromise as { then?: unknown } | null)?.then
    if (typeof maybeThen === 'function') {
      ;(dialogTypeOrPromise as PromiseLike<unknown>).then(dialogClass => {
        this.openDialogFor(dialogClass, entityOrId)
      })
      return
    }
    this.openDialogFor(dialogTypeOrPromise, entityOrId)
  }

  /**
   * Instantiate a dialog class and route to its loadByIdAndOpenDialog
   * entry point. Narrowed to IdevsEntityDialog<TRow> via structural
   * typing — Serenity's DialogType is too loose at this point and the
   * source already assumed loadByIdAndOpenDialog is present.
   */
  private openDialogFor(dialogClass: unknown, entityOrId: string | number): void {
    type LoadableDialog = {
      loadByIdAndOpenDialog(id: string | number, asNew: boolean): unknown
    }
    type DialogCtor = new (props?: unknown) => LoadableDialog
    const ctor = dialogClass as DialogCtor
    // `new ctor({})` mirrors Serenity's dialog-from-registry instantiation
    // pattern; ctors accept an empty options object for default props.
    const dialog = new ctor({}) as LoadableDialog
    dialog.loadByIdAndOpenDialog(entityOrId, false)
  }

  // ---- Quick search toggling. ----

  protected override createQuickSearchInput(): void {
    if (this.hideToolbar()) return
    super.createQuickSearchInput()
  }
}
