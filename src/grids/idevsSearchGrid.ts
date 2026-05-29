import {
  Authorization,
  Decorators,
  type ListRequest,
  notifyError,
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
 *       3. `e.target.closest('.slick-row')` in onClick — walks to the
 *          actual row element rather than `parentElement`, which would
 *          be the `.slick-cell` when cells contain nested formatter
 *          markup (the round-2 review fix).
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
  // Setter accepts `Readonly<...>` (wider than the canonical setFilterKeys
  // signature) so the round-trip `grid.FilterKeys = grid.FilterKeys`
  // type-checks — the getter returns `Readonly<...>` and a strict-TS
  // consumer should not need to cast just to mirror state. The internal
  // method only READS the input via `Object.keys(...)` / `Object.entries(...)`
  // (both safe on `Readonly<...>` values); the inner cast to mutable
  // is purely to call the canonical signature, no mutation happens.
  set FilterKeys(filters: Readonly<Record<string, unknown>>) {
    this.setFilterKeys(filters as Record<string, unknown>)
  }

  /** @deprecated Use `getCriteriaKeys()` / `setCriteriaKeys()`. */
  get CriteriaKeys(): readonly unknown[] {
    return this.getCriteriaKeys()
  }
  /** @deprecated Use `setCriteriaKeys()`. */
  // Setter accepts `readonly unknown[]` (wider than the canonical
  // setCriteriaKeys signature) so round-trip `grid.CriteriaKeys =
  // grid.CriteriaKeys` type-checks.
  set CriteriaKeys(value: readonly unknown[]) {
    this.setCriteriaKeys(value as unknown[])
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
      params.CustomData = {
        ...(params.CustomData ?? {}),
        Important: true,
      }
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
    //
    // Round-10 #3 + round-14 #2 (Copilot): `e.target` is
    // `EventTarget | null` per spec — it can be a Text node, an
    // SVGElement, a window/document node, etc. Only `Element`
    // instances (and their subtypes) have `.closest()`. The
    // round-10 #3 fix (just bail when `!(target instanceof Element)`)
    // was too strict: clicks on a Text node INSIDE a slick row are
    // real, legitimate row clicks — browsers fire mousedown/click
    // with Text-node targets when the user clicks plain text
    // content. Bailing dropped both the row-highlight AND the
    // synthetic onCellChange notification, so parent dialogs
    // listening for the selected row never saw it.
    //
    // Round-14 #2: normalize Text-node (and other Node) targets to
    // the closest Element ancestor before running `closest(...)`.
    // Only bail when no Element ancestor exists (document, window,
    // fully detached Text node).
    const rawTarget = e.target
    let target: Element | null = null
    if (rawTarget instanceof Element) {
      target = rawTarget
    } else if (rawTarget instanceof Node) {
      // Text nodes have `parentElement`; if it's an Element, use it.
      target = rawTarget.parentElement
    }
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
    if (!Authorization.hasPermission(this._editPermission)) {
      // Silent return preserved (the source did the same) — but log so
      // misconfigured `_editPermission` (e.g. empty string → unintentional
      // gate) is traceable. Using `console.info` rather than `console.debug`
      // because DevTools "Default levels" filter hides Verbose/Debug,
      // which would defeat the traceability intent in production
      // diagnostics. Consumers wanting a user-visible signal can
      // override `editItem` directly.
      console.info(
        `[IdevsSearchGrid] editItem(${String(entityOrId)}) denied: permission '${this._editPermission}' not granted`,
      )
      return
    }

    const dialogTypeOrPromise = this.getDialogType()

    // PromiseLike duck-type check via `typeof` — robust against null/
    // primitive masquerading as DialogType (the cast probe in the source
    // would TypeError before reaching the .then access).
    const maybeThen = (dialogTypeOrPromise as { then?: unknown } | null)?.then
    if (typeof maybeThen === 'function') {
      ;(dialogTypeOrPromise as PromiseLike<unknown>).then(
        // Round-9 #2: the fulfillment handler is wrapped in its own
        // try/catch. If `openDialogFor` throws synchronously (dialog
        // ctor crash, structural mismatch with `loadByIdAndOpenDialog`),
        // the throw would otherwise reject the promise returned by
        // `.then()` — but that returned promise has no rejection
        // handler, so it becomes an unhandled-rejection event. That
        // resurrects exactly the failure mode safeHandleEditItemError
        // was created to prevent.
        dialogClass => {
          try {
            this.openDialogFor(dialogClass, entityOrId)
          } catch (err) {
            this.safeHandleEditItemError(err, entityOrId, 'dialog-open')
          }
        },
        // .then's second argument (NOT .catch chain) attaches the rejection
        // handler to the same microtask hop, ensuring no transient
        // unhandled-rejection event fires for chunk-load / dynamic-import
        // failures on a code-split dialog module.
        err => this.safeHandleEditItemError(err, entityOrId, 'dialog-load'),
      )
      return
    }
    try {
      this.openDialogFor(dialogTypeOrPromise, entityOrId)
    } catch (err) {
      this.safeHandleEditItemError(err, entityOrId, 'dialog-open')
    }
  }

  /**
   * Wrap `handleEditItemError` so a throwing override doesn't become a
   * secondary unhandled rejection (defeating the round-3 fix's intent).
   * Logs the override failure at warn-level and falls back to a default
   * `notifyError`.
   */
  private safeHandleEditItemError(
    err: unknown,
    entityOrId: string | number,
    phase: 'dialog-load' | 'dialog-open',
  ): void {
    try {
      this.handleEditItemError(err, entityOrId, phase)
    } catch (handlerErr) {
      // Override threw — log + fall back to a minimal user notification.
      // The override's rejection is NOT propagated upward (would itself
      // become an unhandled-rejection event in the .then callback path).
      console.warn(
        `[IdevsSearchGrid] handleEditItemError override threw (phase=${phase}):`,
        handlerErr,
      )
      // The fallback notifyError is ALSO wrapped — if Serenity's toast
      // path itself throws (detached container, consumer monkey-patch),
      // the secondary throw would resurrect the very unhandled-rejection
      // symptom the safe-wrap exists to prevent.
      try {
        notifyError('Unable to open editor dialog.')
      } catch (notifyErr) {
        console.warn(
          '[IdevsSearchGrid] notifyError fallback also threw — no user-visible signal possible:',
          notifyErr,
        )
      }
    }
  }

  /**
   * Instantiate a dialog class and route to its loadByIdAndOpenDialog
   * entry point. Narrowed structurally — Serenity's DialogType is too
   * loose at this point and the source already assumed
   * loadByIdAndOpenDialog is present.
   *
   * `loadByIdAndOpenDialog` typically returns `Promise<void>` in real
   * Serenity. If the returned value is thenable, we attach a rejection
   * handler so 404 / network / validation failures surface to the user
   * instead of becoming silent unhandled-rejection events.
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
    const result = dialog.loadByIdAndOpenDialog(entityOrId, false) as unknown
    const resultThen = (result as { then?: unknown } | null)?.then
    if (typeof resultThen === 'function') {
      ;(result as PromiseLike<unknown>).then(
        () => undefined,
        err => this.safeHandleEditItemError(err, entityOrId, 'dialog-open'),
      )
    } else if (result !== undefined && result !== null) {
      // [Suggestion #13] Non-thenable, non-nullish return from
      // loadByIdAndOpenDialog. Real Serenity returns Promise<void>; a
      // primitive return here suggests a misbehaving stub or an
      // upstream contract change. Log so the consumer can investigate
      // without crashing the user-gesture path.
      console.warn(
        `[IdevsSearchGrid] loadByIdAndOpenDialog returned non-thenable for id=${String(
          entityOrId,
        )}:`,
        result,
      )
    }
  }

  /**
   * Surface dialog-load / dialog-open failures via `notifyError` and log
   * with a stable prefix so the failure is traceable to a user gesture.
   * Override in subclasses to integrate with consumer-specific error
   * channels.
   *
   * The `phase` parameter distinguishes:
   *   - `'dialog-load'` — `getDialogType()` returned a Promise that
   *     rejected. Typical: chunk-load failure, dynamic-import error,
   *     code-split module 404. Generally transient; safe to retry.
   *   - `'dialog-open'` — the dialog constructor threw, OR
   *     `loadByIdAndOpenDialog`'s returned Promise rejected. Typical:
   *     entity 404, validation rejection, dialog-ctor bug. Generally
   *     not retryable from the same call site.
   *
   * Overrides that throw are caught by `safeHandleEditItemError` and
   * downgraded to a console.warn + default notifyError — so an
   * override does not need to be defensive about its own failure
   * modes for the primary surface to stay correct.
   *
   * Backward compatibility: the `phase` parameter is added as the
   * third positional arg with no default, but the signature also stays
   * arity-1+2 compatible — JavaScript callers omitting `phase` see it
   * as `undefined`, which is a structurally-valid (if narrowed-away)
   * value the default impl doesn't read. Existing 2-arg overrides keep
   * working.
   */
  protected handleEditItemError(
    err: unknown,
    entityOrId: string | number,
    phase?: 'dialog-load' | 'dialog-open',
  ): void {
    notifyError('Unable to open editor dialog.')
    // Structured warn for traceability of user-gesture-triggered dialog
    // failures (project policy: `no-console: warn`). Consumers can
    // override handleEditItemError to route elsewhere.
    console.warn(
      `[IdevsSearchGrid] editItem(${String(entityOrId)}) failed to open dialog${
        phase ? ` (phase=${phase})` : ''
      }:`,
      err,
    )
  }

  // ---- Quick search toggling. ----

  protected override createQuickSearchInput(): void {
    if (this.hideToolbar()) return
    super.createQuickSearchInput()
  }
}
