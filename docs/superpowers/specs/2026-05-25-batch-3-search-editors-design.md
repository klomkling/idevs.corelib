# Batch 3 — Csi/UI Search-Button Editors: Design

**Date:** 2026-05-25
**Status:** Approved (pending user review of this spec)
**Source:** `~/GitHub/Proj_PowerACC/PowerACC.Web/Modules/Csi/UI/Editors/`
**Target:** `@idevs/corelib` v1.2.0 (next minor)

## 1. Scope

Port the search-button editor family + `NumericTagEditor` + `SlickEditorBase` from PowerACC to `@idevs/corelib`, applying the same hardening rigor batch 2 (`IdevsTagEditor`, `IdevsDateEditor`) established: XSS-safe DOM construction, full WAI-ARIA patterns, single-chokepoint value writes, resource hygiene in `destroy()`, narrow types (no `EditorProps<any>`).

**Source LOC inventory (PowerACC):**

| Source file | LOC |
|---|---|
| `Editors/SearchButtonEditor.tsx` | 939 |
| `Editors/SelfSearchButtonEditor.tsx` | 3,404 |
| `Editors/SlickSearchButtonEditor.ts` | 93 |
| `Editors/SlickSelfSearchButtonEditor.ts` | 98 |
| `Editors/SlickEditorBase.ts` | 265 (dependency of the Slick adapters) |
| `Editors/NumericTagEditor.tsx` | 164 |
| **Total** | **~4,963** |

## 2. Batches (two PRs)

### PR-3a — Foundation (ships first)

| New file | Source | Notes |
|---|---|---|
| `src/editors/slickEditorBase.ts` | `SlickEditorBase.ts` | No `Idevs` prefix — SleekGrid base, not Serenity widget |
| `src/editors/idevsSearchButtonEditor.ts` | `SearchButtonEditor.tsx` | Decorator: `Idevs.CoreLib.IdevsSearchButtonEditor` |
| `src/editors/slickSearchButtonEditor.ts` | `SlickSearchButtonEditor.ts` | SleekGrid column adapter |
| `src/editors/idevsNumericTagEditor.ts` | `NumericTagEditor.tsx` | Extends `IdevsTagEditor`; decorator `Idevs.CoreLib.IdevsNumericTagEditor` |
| `src/editors/shared/maskedPattern.ts` | (extracted from duplication) | Pure helpers; used by both SearchButton and SelfSearch |
| `src/editors/shared/requiredMarker.ts` | (extracted hardening) | XSS-safe `<sup>*</sup>` marker via DOM API |
| `src/editors/shared/validationObserver.ts` | (extracted hardening) | `MutationObserver` wrapper for validation-class sync |
| `src/editors/shared/index.ts` | (new) | Internal barrel; not re-exported publicly |
| Tests under `tests/editors/` + `tests/editors/_helpers/` | (new) | ~85 tests target |
| `src/editors/index.ts` | (updated) | Re-export the new public editors |

### PR-3b — SelfSearch (ships after PR-3a merges)

| New file | Source | Notes |
|---|---|---|
| `src/editors/idevsSelfSearchButtonEditor.ts` | `SelfSearchButtonEditor.tsx` (~600 of 3,404) | Public editor class |
| `src/editors/selfSearch/columnFormatters.ts` | (~200 LOC extracted) | Pure column parsers + built-in formatters |
| `src/editors/selfSearch/searchModal.ts` | (~800 LOC extracted) | Built-in modal controller |
| `src/editors/selfSearch/searchDropdown.ts` | (~800 LOC extracted) | Dropdown variant controller (parallel surface to modal) |
| `src/editors/selfSearch/index.ts` | (new) | Internal barrel |
| `src/editors/slickSelfSearchButtonEditor.ts` | `SlickSelfSearchButtonEditor.ts` | SleekGrid column adapter |
| Tests + barrel updates | (new) | ~75 tests target |

PR-3b depends on PR-3a's `src/editors/shared/` modules.

## 3. Naming conventions

- **Idevs prefix** only on classes registered as Serenity widgets (have `@Decorators.registerEditor`).
- SleekGrid column editors (`SlickEditorBase`, `SlickSearchButtonEditor`, `SlickSelfSearchButtonEditor`) are NOT prefixed — they're registered with SleekGrid via `editorParams`, not the Serenity editor registry.
- Decorator strings: `Idevs.CoreLib.IdevsSearchButtonEditor`, `Idevs.CoreLib.IdevsSelfSearchButtonEditor`, `Idevs.CoreLib.IdevsNumericTagEditor`.

## 4. Public API design

### 4.1 `IdevsSearchButtonEditor`

```ts
@Decorators.registerEditor('Idevs.CoreLib.IdevsSearchButtonEditor', [IReadOnly, IStringValue])
export class IdevsSearchButtonEditor<
  P extends IdevsSearchButtonEditorOptions = IdevsSearchButtonEditorOptions,
> extends EditorWidget<P> implements IReadOnly, IStringValue {
  // Serenity contract
  get_value(): string | null
  set_value(value: string | null): void
  get_readOnly(): boolean
  set_readOnly(value: boolean): void
  get_required(): boolean
  set_required(value: boolean): void
  destroy(): void

  // Public API
  setFilterKeys(filters: Record<string, unknown>): void
  setCriteriaKeys(criteria: unknown[]): void
  setDisplayText(id: string, value?: unknown): void
  clearDisplayText(): void
  subscribe(callback: SubscriberCallback): void
  preSearch(callback: PreSearchCallback): void
}

export type IdevsSearchButtonEditorOptions = {
  grid?: EntityGrid<unknown>
  idColumnName?: string
  textColumnName?: string
  searchDialogType?: string         // Resolved via Serenity getType()
  canClear?: boolean
  displayTemplate?: string          // e.g., "{id} - {value}"
  maskedPattern?: string            // "0000-0000" (numeric) or "XX-0000" (alphanumeric)
  selfRender?: boolean
  dialogType?: string
  modifyDialogPermission?: string
  dialogSize?: 'sm' | 'md' | 'lg' | 'xl'
  onDataSelected?: (data: unknown) => void
  onPreSearch?: PreSearchCallback
  getSearchValue?: () => string
  getFilters?: () => Record<string, unknown>
  getCriteria?: () => unknown[]
  enableEnterKeySearch?: boolean
  minSearchLength?: number          // 0 = no minimum
}

export type PreSearchCallback = (
  filters: Record<string, unknown>,
  searchValue: string,
) => Promise<unknown[]> | unknown[]

export type SubscriberCallback = (data: unknown) => void
```

**Two intentional API changes vs source** (call out in MIGRATION.md):

1. `set CriteriaKeys` (PascalCase asymmetric setter) → `setCriteriaKeys()` method.
2. `set filterKeys` (asymmetric setter) → `setFilterKeys()` method.

Options is a plain `type` (per `@typescript-eslint/consistent-type-definitions: ['error', 'type']`), NOT extending `EditorProps<any>`.

### 4.2 `IdevsNumericTagEditor`

```ts
@Decorators.registerEditor('Idevs.CoreLib.IdevsNumericTagEditor')
export class IdevsNumericTagEditor<
  P extends IdevsNumericTagEditorOptions = IdevsNumericTagEditorOptions,
> extends IdevsTagEditor<P> {
  formatDisplayValue(): void                                          // override
  protected addDropdownItems(): void                                  // override
  protected formatDisplayText(value?: string | number | null): string // override
  protected extractNumericValue(value: string): number | null
}

export type IdevsNumericTagEditorOptions = IdevsTagEditorOptions & {
  prefix?: string                                // e.g., "$"
  suffix?: string                                // e.g., "%"
  addSpace?: boolean                             // space between prefix/suffix and number
  specialValues?: Record<number, string>         // e.g., { 0: "Free", -1: "N/A" }
}
```

Rename source's `_preventRecursion` to `_isFormatting` for clarity.

### 4.3 `SlickEditorBase`

```ts
type SlickWrappedEditor = {
  domNode: HTMLElement
  value?: unknown
  destroy?: () => void
  props?: { grid?: { slickGrid: unknown } }
}

export abstract class SlickEditorBase<
  TEditor extends SlickWrappedEditor,
  P extends EditorOptions = EditorOptions,
> implements Editor {
  // SleekGrid Editor lifecycle
  loadValue(item: Record<string, unknown>): void
  serializeValue(): unknown
  applyValue(item: Record<string, unknown>, state: unknown): void
  isValueChanged(): boolean
  validate(): { valid: boolean; msg: string | null }
  focus(): void
  destroy(): void

  // Required override
  protected abstract createEditor(props: EditorProps<P>): TEditor

  // Overridable hooks
  protected appendToContainer(props: EditorProps<P>): void
  protected setupEventHandlers(): void
  protected setupValueChangeHandler(): void
  protected getInputElement(): HTMLInputElement | null
  protected handleKeyDown(event: KeyboardEvent): void
  protected handleValueChange(): void
  protected commitValue(): void

  // Helpers
  protected getEditorValue(): unknown
  protected setEditorValue(value: unknown): void
  protected focusEditor(): void
  protected destroyEditor(): void
  protected addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void
}
```

**Hardening deltas vs source:**

- `TEditor extends SlickWrappedEditor` constraint eliminates `(this.editor as any).domNode` casts.
- `originalValue: unknown`, `grid: SlickGridLike | null` (typed via helper interface).
- Remove `null` assignments in `destroy()`; `isDestroyed` gate is sufficient.
- Silent catch in cleanup (was `console.warn`); cleanup errors during teardown are noise.

### 4.4 `SlickSearchButtonEditor`

```ts
export class SlickSearchButtonEditor<P extends EditorOptions = EditorOptions>
  extends SlickEditorBase<IdevsSearchButtonEditor, P> {
  protected createEditor(props: EditorProps<P>): IdevsSearchButtonEditor
  protected appendToContainer(props: EditorProps<P>): void
  protected getInputElement(): HTMLInputElement | null
  protected handleValueChange(): void
}
```

Listens for `dataSelected` CustomEvent on `editor.domNode`. Hardening: narrow event detail type; route value writes through parent editor's `set_value`.

### 4.5 `IdevsSelfSearchButtonEditor` (PR-3b)

Same Serenity contract as `IdevsSearchButtonEditor`, plus:

```ts
@Decorators.registerEditor('Idevs.CoreLib.IdevsSelfSearchButtonEditor', [IReadOnly, IStringValue])
export class IdevsSelfSearchButtonEditor<
  P extends IdevsSelfSearchButtonEditorOptions = IdevsSelfSearchButtonEditorOptions,
> extends EditorWidget<P> implements IReadOnly, IStringValue {
  // Same Serenity contract + setFilterKeys/setCriteriaKeys/setDisplayText/clearDisplayText/subscribe
  setFilterValue(key: string, value: unknown): void   // kept — already a proper method in source
}

export type IdevsSelfSearchButtonEditorOptions = {
  // ... all options as in source minus EditorProps<any> extension
  // Built-in modal options
  resultColumns?: ResultColumn[] | string
  maxResultsToShow?: number
  allowSearchAll?: boolean
  enableResultPaging?: boolean
  builtInDialogTitle?: string
  showResultsCount?: boolean
  enableColumnSorting?: boolean

  // Service-based search
  service?: string
  serviceSearchMethod?: string                       // default: "List"
  serviceParams?: Record<string, unknown>
  searchTextParam?: string                           // default: "searchText"

  // NEW (not in source)
  presentation?: 'modal' | 'dropdown'                // default: 'modal'
  // ... + standard editor options (grid, idColumnName, displayTemplate, maskedPattern, etc.)
}
```

### 4.6 `SlickSelfSearchButtonEditor`

Same shape as `SlickSearchButtonEditor`; adds the source's "only navigate when `event.detail` truthy" guard.

## 5. Internal architecture

### 5.1 `src/editors/shared/` (PR-3a)

#### `maskedPattern.ts` (pure)

```ts
export function applyMaskedPattern(rawValue: string, pattern: string): string
export function extractRawValue(formattedValue: string, pattern: string): string
export function getSeparatorsFromTemplate(pattern: string): string[]
export function isValidInputCharacter(char: string, pattern: string): boolean
export function calculateNewCursorPosition(
  newValue: string,
  oldCursorPos: number,
  pattern: string,
): number
```

#### `requiredMarker.ts` (DOM)

```ts
const MARKER_ATTR = 'data-idevs-required-marker'

export function findLabelFor(input: HTMLElement): HTMLLabelElement | null
export function setRequiredMarker(label: HTMLLabelElement, isRequired: boolean): void
```

Uses `document.createElement('sup')` + `textContent = '*'` + `insertBefore`. Replaces source's HTML-property write pattern on the label (XSS vector — same class of bug the 1.1.0 `DropdownToolButton` fix addressed).

#### `validationObserver.ts` (DOM + MutationObserver)

```ts
export type ValidationClassSync = {
  start(): void
  stop(): void
  syncOnce(): void
}

export function createValidationObserver(opts: {
  source: HTMLElement
  target: HTMLElement | (() => HTMLElement | null | undefined)
  classes: readonly string[]   // e.g., ['error', 'invalid', 'validation-error']
}): ValidationClassSync
```

### 5.2 `idevsSearchButtonEditor.ts` organization

Single class. Logical sections in order:

1. Constants
2. Fields (domNode hidden, displayInput, clearButton, searchButton, isReadonly, isDestroyed, subscribers, preSearchCallback, validationObserver, debounceTimer)
3. Constructor → validateRequiredProps → initializeEditor → renderUI → setupEventListeners → applyInitialState
4. Public Serenity contract
5. Public API
6. Private rendering
7. Private state management
8. Private validation (uses `shared/validationObserver` + `shared/requiredMarker`)
9. Private input event handlers
10. Private button event handlers (debounced)
11. Private search execution (`performSearch`, `executePreSearch`, `processPreSearchResults`, `selectSingleItem`, `openDialog`)
12. Private cleanup (`clearDebounceTimer`, called from `destroy`)

### 5.3 Data flow (single-chokepoint discipline)

```
User types in displayInput
  → handleDisplayInputChange
    → applyMaskedPattern (shared)
    → set_value(extracted raw)                       ← single chokepoint
      → updates domNode.value
      → dispatches 'change' + notifies subscribers IFF value actually changed

User clicks Search → debouncedSearch → performSearch
  → minSearchLength check (notifyInfo if too short)
  → preSearchCallback ? executePreSearch → processPreSearchResults
      → 1 result: selectSingleItem → set_value(id)   ← still chokepoint
      → many results: openDialog with preItems
    : openDialog
  → dialog emits 'dataSelected' CustomEvent
    → set_value(id)                                  ← still chokepoint
    → updateDisplayText(item)
    → onDataSelected + subscribers fired ONCE

User clicks Clear → debouncedClear → performClear
  → set_value(null)                                  ← still chokepoint
  → restoreButtonClickHandlers
```

Every write to `domNode.value` routes through `set_value()`. Mirrors `IdevsTagEditor` hardening; prevents double-dispatch.

### 5.4 `selfSearch/` decomposition (PR-3b)

#### `columnFormatters.ts` (pure)

```ts
export type ResultColumn = {
  field: string
  title: string
  width?: string
  formatter?: (value: unknown, row: Record<string, unknown>) => string
}

export function parseResultColumns(spec: ResultColumn[] | string | undefined): ResultColumn[]
export function parseColumnString(spec: string): ResultColumn[]
export function getBuiltInFormatter(
  name: string,
  pattern?: string,
): ((value: unknown, row: Record<string, unknown>) => string) | null
export function formatCustomerCode(value: unknown, pattern: string): string
export function formatSerenityDate(value: unknown, pattern: string): string
export function formatNumber(value: unknown, pattern: string): string
export function getDefaultColumns(): ResultColumn[]
```

#### Modal/Dropdown communication boundary

Both controllers receive callbacks via constructor; no back-reference to the editor:

```ts
export type SearchPresentationCallbacks = {
  onSelect: (item: Record<string, unknown>) => void
  onCancel: () => void
  fetchResults: (searchText: string) => Promise<unknown[]>
}

export type SearchPresentationOptions = {
  columns: ResultColumn[]
  maxResults?: number
  enablePaging?: boolean
  enableSorting?: boolean
  showCount?: boolean
  searchPlaceholder?: string
}
```

#### `searchModal.ts`

```ts
export class SearchModalController {
  constructor(
    parent: HTMLElement,
    options: SearchPresentationOptions & { title?: string },
    callbacks: SearchPresentationCallbacks,
  )
  open(initialQuery?: string): void
  close(): void
  destroy(): void
}
```

Internal sections: DOM construction → keyboard nav → search/filter → loading/error/empty states → sorting → selection → cleanup.

**Hardening:** Full WAI-ARIA dialog (`role="dialog"` + `aria-modal="true"` + `aria-labelledby` + focus trap + ESC closes + focus restored to invoker). Table is `role="grid"`. Sort buttons get `aria-sort`. Loading/empty/error states use `role="status"` + `aria-live="polite"`. All text via `textContent`; no raw HTML-property writes.

#### `searchDropdown.ts`

```ts
export class SearchDropdownController {
  constructor(
    anchor: HTMLElement,
    options: SearchPresentationOptions,
    callbacks: SearchPresentationCallbacks,
  )
  open(initialQuery?: string): void
  close(): void
  isOpen(): boolean
  destroy(): void
}
```

Same internal organization as modal but with combobox semantics: positioned absolutely below anchor, click-outside dismisses, no focus trap (focus stays on input), `aria-expanded` on anchor + `aria-controls` to dropdown id, arrow keys move into table without leaving combobox role.

#### Shared logic between modal and dropdown (NOT extracted in this batch)

The two controllers share ~40% logic (table construction, keyboard nav, sort, empty/loading states, filter matching). **Premature extraction risks bad abstraction.** Each controller gets a `// TODO: dedupe with searchDropdown.ts post-batch-3` (or modal) comment listing the shared concerns. Follow-up PR can refactor once both work and are tested.

### 5.5 Editor selects presentation

```ts
private presentation: SearchModalController | SearchDropdownController

private createPresentation() {
  const callbacks: SearchPresentationCallbacks = {
    onSelect: item => this.handleSelection(item),
    onCancel: () => this.displayInput.focus(),
    fetchResults: query => this.fetchResults(query),
  }
  this.presentation = this.options.presentation === 'dropdown'
    ? new SearchDropdownController(this.displayInput, presOpts, callbacks)
    : new SearchModalController(document.body, presOpts, callbacks)
}
```

`destroy()` calls `this.presentation.destroy()`. Switching presentations mid-life is NOT supported (documented).

## 6. Hardening checklist (full parity with batch 2)

Applied across all new editors:

| Source pattern | Replacement |
|---|---|
| `interface ... extends EditorProps<any>` | Plain `type` declaration |
| `items: any[]`, `Record<string, any>`, `(data: any) => void` | `unknown[]`, `Record<string, unknown>`, `(data: unknown) => void` |
| Raw HTML-property writes on label (e.g., `label.in` + `nerHTML = '<sup>...'`) | `shared/requiredMarker.setRequiredMarker()` using `createElement` + `textContent` |
| Multiple direct writes to `domNode.value` | Single chokepoint `set_value()` |
| No ARIA on inputs/buttons | `role="combobox"` / `role="dialog"` / `aria-*` per WAI-ARIA 1.2 |
| `aria-invalid` reflects requiredness | `aria-invalid` reflects validity |
| `MutationObserver` without destroy guard | `shared/validationObserver` with `stop()` in `destroy` |
| Unbounded `debounceTimer` on destroy | `destroy` calls `clearDebounceTimer` |
| Subscribers not cleared | `destroy` empties subscribers array |
| Document-level listeners orphaned | Tracked in cleanup array; removed in `destroy` |
| `getFlatpickr()`-style teardown races | Guard via `isDestroyed` flag |

## 7. Testing strategy

### 7.1 Pure helpers (near-100% coverage)

| Module | Test focus |
|---|---|
| `shared/maskedPattern.ts` | Numeric + alphanumeric + mixed templates; cursor edge cases (paste mid-string, separator boundaries); extract/apply round-trip; `isValidInputCharacter` truth table |
| `shared/requiredMarker.ts` | Insert + idempotency; remove; `<sup>` with `textContent='*'` and marker attr; never raw HTML writes |
| `shared/validationObserver.ts` | start observes; stop disconnects; `syncOnce` immediate; idempotent cleanup; target accepts static element + function |
| `selfSearch/columnFormatters.ts` | All `parseResultColumns` paths; `getBuiltInFormatter` registry; each formatter for valid + nullish inputs; `getDefaultColumns` shape |

### 7.2 Editor smoke tests (mirror batch 2 IdevsTagEditor's 29-test template)

| Editor | Approximate count | Focus |
|---|---|---|
| `IdevsSearchButtonEditor` | ~25-30 | Construction & ARIA, value chokepoint, readOnly state, required marker, filter/criteria propagation, displayText template, clear flow, search button opens dialog (stub), preSearch single + multi result, minSearchLength gate, Enter triggers search, masked pattern integration, `dataSelected` CustomEvent payload, destroy cleanup cascade |
| `IdevsNumericTagEditor` | ~12-15 | Extension intact, formatDisplayText for plain/prefix/suffix/addSpace/specialValues, extractNumericValue round-trip, cursor preservation, `_isFormatting` prevents recursion, dropdown items rendered with prefix/suffix |
| `SlickEditorBase` | ~10-12 | Via `TestableSlickEditor` fixture; loadValue/serializeValue/applyValue/isValueChanged contract; focus via RAF; destroy cleanup; addEventListener registers + cleanup; isDestroyed gates every method; commitValue notifies grid; handleKeyDown Enter triggers commit |
| `SlickSearchButtonEditor` | ~6-8 | Real `IdevsSearchButtonEditor` in JSDOM; dataSelected → editor.value + commit + navigate (deferred); onDataSelected callback; loadValue/serializeValue passthrough; destroy tears down both layers |
| `SearchModalController` (PR-3b) | ~15-20 | open() builds DOM + ARIA + focus trap; close() restores focus + ESC closes; keyboard nav; sort aria-sort toggle; debounced filter; loading/error/empty/filteredEmpty render with role/aria-live; max-results warning; onSelect fires once; destroy removes document listeners + DOM |
| `SearchDropdownController` (PR-3b) | ~15-20 | open() aria-expanded on anchor; click-outside closes; position recalculated on resize; no focus trap; arrow keys move into table; destroy removes document listener + position observer |
| `IdevsSelfSearchButtonEditor` (PR-3b) | ~20-25 | Inherits SearchButton smoke list + presentation: modal/dropdown picks correct controller; service-based fetch with mocked serviceCall; clearSearchOnReopen behavior; destroy tears down presentation controller |
| `SlickSelfSearchButtonEditor` (PR-3b) | ~6-8 | Same as SlickSearchButton + "only navigate when event.detail truthy" guard |

### 7.3 Test infrastructure (`tests/editors/_helpers/`)

- **EntityGrid stub** — minimal object with `slickGrid` exposing `getEditorLock().commitCurrentEdit()`, `getActiveCell()`, `navigateNext()`, `editActiveCell()`, `onCellChange.notify()`.
- **Search dialog stub** — stub class registered with Serenity `getType()`; exposes `dialogOpen()` and synthesizes `dataSelected` CustomEvent for tests.
- **serviceCall stub** — `vi.mock` of `@serenity-is/corelib`'s `serviceCall` returning `Promise.resolve({ Entities: [...] })`.

### 7.4 Test runner

Vitest fake timers (`vi.useFakeTimers()`) for debounced-search assertions; advance timers explicitly. Avoids real-time waits.

### 7.5 Totals

- PR-3a: ~85 tests
- PR-3b: ~75 tests

## 8. Dependencies

### 8.1 No new peer dependencies

`SearchButtonEditor` uses `EntityGrid` from `@serenity-is/corelib` (already required peer). `SelfSearchButtonEditor` adds `serviceCall`, `ListResponse`, `formatDate` (same package). No optional peers introduced; no subpath exports needed.

### 8.2 Re-used `idevs.corelib` modules

- `src/formatters/formatterHelper.ts` — `isNumericInput`, `isNumericTemplate` (already exist).
- PR-3b reuses PR-3a's `src/editors/shared/*`.

## 9. Public barrel changes (`src/editors/index.ts`)

After PR-3a:

```ts
export * from './checkboxButtonEditor'
export * from './dateMonthEditor'
export * from './idevsTagEditor'
export * from './idevsSearchButtonEditor'     // NEW
export * from './idevsNumericTagEditor'       // NEW
export * from './slickEditorBase'             // NEW
export * from './slickSearchButtonEditor'     // NEW
// shared/ not exported publicly
// idevsDateEditor still subpath-only (flatpickr peer)
```

After PR-3b:

```ts
// ... PR-3a additions
export * from './idevsSelfSearchButtonEditor' // NEW
export * from './slickSelfSearchButtonEditor' // NEW
// selfSearch/ not exported publicly
```

## 10. MIGRATION.md updates

### PR-3a additions

- `IdevsSearchButtonEditor`: `set filterKeys` and `set CriteriaKeys` setters renamed to `setFilterKeys()` and `setCriteriaKeys()` methods.
- `SlickEditorBase`: `TEditor` generic now constrained by `SlickWrappedEditor`. Subclasses that wrapped editors lacking `domNode`/`destroy`/`value` need to declare those shapes.
- `IdevsNumericTagEditor`: extends `IdevsTagEditor`; consumers importing `NumericTagEditor` from PowerACC migrate the import + class name.

### PR-3b additions

- `IdevsSelfSearchButtonEditor`: same `setFilterKeys`/`setCriteriaKeys` rename as above. New `presentation: 'modal' | 'dropdown'` option (default `'modal'` — matches source default).
- Modal now has a focus trap (was absent in source). Adding `presentation: 'modal'` to existing consumers should be no-op behaviorally.

## 11. Risks and trade-offs

1. **API rename is a breaking change** for direct PowerACC consumers calling `editor.CriteriaKeys = [...]` / `editor.filterKeys = {...}`. Most consumers use `editorParams` (no breakage). Mitigated by MIGRATION.md.

2. **`presentation` option is NEW.** Default to `'modal'` (matches source default per `performSearch` inspection). Verify during implementation; flag if source picks dynamically.

3. **Service-based search uses Serenity `serviceCall`.** Runtime requires consumer's Serenity service endpoint. Documented in JSDoc.

4. **Modal focus trap is a hardening addition** not in source. Behavior change for any consumer relying on Tab escaping the modal. Documented. If a real consumer needs to disable, add a `focusTrap: false` option then — not now.

5. **`shared/` extraction has implicit retrofit pressure on batch 2.** `IdevsTagEditor` (required marker inline) and `IdevsDateEditor` (MutationObserver inline) now have parallel implementations. **Out of scope.** File follow-up issue: "batch 2 editors: adopt `shared/` helpers."

6. **SelfSearch doesn't virtualize results.** Source caps via `maxResultsToShow` but renders all DOM rows. Large datasets slow. Not regressing source; document as known limitation.

7. **PR ordering coupling.** PR-3b imports from PR-3a's `shared/`. PR-3b can't merge before PR-3a. Linearize the work.

8. **Modal/dropdown duplication (~40%) is intentionally retained.** Premature consolidation risks abstractions that fit neither cleanly. Follow-up PR can refactor.

## 12. Implementation-time decisions (locked)

- **Default presentation for SelfSearch**: `'modal'` (matches source per inspection of LOC distribution; verify in `performSearch`).
- **Internal subdir naming**: `shared/` for cross-editor helpers, `selfSearch/` for SelfSearch internals.
- **Test runner**: Vitest fake timers for debounce assertions.

## 13. Out of scope (follow-ups)

- Batch 2 editor refactor to consume `shared/requiredMarker` + `shared/validationObserver`.
- Modal/dropdown shared base refactor (`selfSearch/resultsTable.ts`).
- SelfSearch result virtualization for large datasets.
- Typed-item generic (`IdevsSelfSearchButtonEditor<TItem, P>`).
- Subpath export for SelfSearch if it ever takes an optional peer dep.

## 14. Acceptance criteria

### PR-3a

- All four CI steps pass locally and on origin: `typecheck`, `lint`, `test`, `build`.
- ~85 new tests, all passing.
- No new lint warnings (existing `pdfExportHelper.ts` warning unchanged).
- No `any` types added in new code (source `any` translated to `unknown`).
- All new public editors have decorator strings under `Idevs.CoreLib.*`.
- MIGRATION.md updated with API rename callouts.
- Subpath export NOT needed (no new optional peer deps).

### PR-3b

- All four CI steps pass.
- ~75 new tests, all passing.
- `IdevsSelfSearchButtonEditor` swaps cleanly between `'modal'` and `'dropdown'` presentations.
- `SearchModalController` has a working focus trap; ESC closes; focus returns to invoker.
- All new code compiles without `EditorProps<any>` and without `any` types added.
- MIGRATION.md updated.
