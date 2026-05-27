# Batch 4 — Csi/UI Dialogs, Panels, Grids: Design

**Date:** 2026-05-26
**Status:** Approved (pending user review of this spec)
**Source:** `~/GitHub/Proj_PowerACC/PowerACC.Web/Modules/Csi/UI/`
**Target:** `@idevs/corelib` v1.3.0 → 1.5.0 (three minors, one per PR)

## 1. Scope

Port the dialog/panel/grid infrastructure from PowerACC's `Csi/UI` module into `@idevs/corelib`, applying the same hardening rigor batches 2-3 established (XSS-safe DOM, full WAI-ARIA, idempotent `destroy()`, narrow types, single-chokepoint patterns).

**Excluded** — domain-specific code that stays in PowerACC:
- `ShippingMarkEntityDialog.ts` (226) and `ShippingMarkPanel.ts` (157) — PowerACC's shipping-mark module.
- Half of `Dialogs.ts` (~240 LOC) — PowerACC parameter types (`RequestApprovalParameter`, `BookingRequestApprovalParameter`, `RequestPrintShippingMarkParameter`, etc.) that pull from `@/ServerTypes/Sales/...`. The PowerACC-domain types stay in PowerACC.

**In scope** (~4,947 LOC, 18 files):

| Category | Files | LOC |
|---|---|---|
| Dialog shells | `CsiInlineDialog`, `CsiEntityDialog`, `CsiPropertyDialog`, `CsiSearchDialog`, `Dialogs.ts` (generic half) | ~1,180 |
| Panel shells | `CsiPanel`, `OffcanvasPanel`, `CsiTabControl`, `CsiPage` | ~602 |
| Helpers | `LayoutHelper`, `Buttons`, `FilterHelper` | ~541 |
| Grid extensions | `CsiGridEditorBase`, `GridEditController`, `CsiSearchGrid`, `CsiSelectableEntityGrid`, `CsiEntityGrid` | ~1,573 |
| Filter panel | `CsiFilterPanel` | ~1,048 |

## 2. PR sequence (three PRs)

### PR-4a — Foundation (~2,300 LOC)

Dialog shells + Panel shells + small helpers. Sequenced first because PR-4b depends on the dialog/panel base classes.

### PR-4b — Grid extensions (~1,570 LOC)

`IdevsGridEditorBase`, `IdevsGridEditController`, `IdevsSearchGrid`, `IdevsSelectableEntityGrid`, `IdevsEntityGrid`. Depends on PR-4a's dialogs/panels.

### PR-4c — Filter panel (~1,063 LOC)

`IdevsFilterPanel` (decomposed from the source's 1,048-LOC single file). Depends on PR-4b's grid extensions.

## 3. Naming conventions

- **`Idevs` prefix on all classes** registered as Serenity widgets (carries `@Decorators.registerClass()`). Decorator strings: `Idevs.CoreLib.Idevs*` where the source used `Csi.*`.
- Helpers (pure functions in `src/helpers/`) keep camelCase filenames with no class prefix.
- `Csi` → `Idevs` rename mapped per file in the table at section 5 below.

## 4. Hardening (carries forward from batches 2-3)

Same rigor applied across all new code:

- Plain `type` for options (no `EditorProps<any>` or interface extension).
- `unknown` not `any` throughout; structural-type constraints where source had `(x as any)` casts.
- XSS-safe DOM construction — no `innerHTML` writes; all text via `textContent`.
- Full WAI-ARIA where applicable: `role="dialog"` + `aria-modal` + `aria-labelledby` on dialogs; `role="tablist"`/`role="tab"`/`role="tabpanel"` + arrow-key nav on `IdevsTabControl`; `role="grid"` on grid extensions.
- Focus restoration on dialog close (matches `SearchModalController` precedent — return focus to the invoker).
- Listener cleanup tracked in a per-instance array; drained idempotently in `destroy()`.
- Per-render listener separation where re-renders happen (modal/dropdown precedent).
- Single-chokepoint discipline where value writes occur (relevant in `IdevsPanel`'s field-binding paths).
- Deferred-focus timers cancelled on close/destroy (precedent from `searchModal`/`searchDropdown`).
- Async race guards on any future `fetchResults`-style flows.

## 5. File mapping (Csi → Idevs)

| PowerACC source | idevs.corelib target | PR |
|---|---|---|
| `CsiInlineDialog.ts` | `src/dialogs/idevsInlineDialog.ts` | 4a |
| `CsiEntityDialog.ts` | `src/dialogs/idevsEntityDialog.ts` | 4a |
| `CsiPropertyDialog.ts` | `src/dialogs/idevsPropertyDialog.ts` | 4a |
| `CsiSearchDialog.tsx` | `src/dialogs/idevsSearchDialog.ts` | 4a |
| `Dialogs.ts` (generic exports) | `src/helpers/dialogHelper.ts` (EXTENDED) | 4a |
| `CsiPanel.tsx` | `src/panels/idevsPanel.ts` | 4a |
| `OffcanvasPanel.ts` | `src/panels/idevsOffcanvasPanel.ts` | 4a |
| `CsiTabControl.ts` | `src/panels/idevsTabControl.ts` | 4a |
| `CsiPage.tsx` | `src/panels/idevsPage.ts` | 4a |
| `LayoutHelper.ts` | `src/helpers/layoutHelper.ts` | 4a |
| `Buttons.ts` | `src/helpers/buttons.ts` | 4a |
| `FilterHelper.ts` | `src/helpers/filterHelper.ts` | 4a |
| `CsiGridEditorBase.ts` | `src/grids/idevsGridEditorBase.ts` | 4b |
| `GridEditController.ts` | `src/grids/idevsGridEditController.ts` | 4b |
| `CsiSearchGrid.tsx` | `src/grids/idevsSearchGrid.ts` | 4b |
| `CsiSelectableEntityGrid.ts` | `src/grids/idevsSelectableEntityGrid.ts` (evaluate merge) | 4b |
| `CsiEntityGrid.ts` | `src/grids/idevsEntityGrid.ts` (evaluate drop) | 4b |
| `CsiFilterPanel.tsx` | `src/filterPanel/idevsFilterPanel.ts` (+ internal subdir) | 4c |

## 6. PR-4a detailed architecture

### 6.1 `src/dialogs/`

#### `idevsEntityDialog.ts`

```ts
@Decorators.registerClass()
export class IdevsEntityDialog<TItem, P = unknown> extends EntityDialog<TItem, P> {
  protected confirmMessage: string
  protected canClose(): boolean
  protected setCanClose(value: boolean): void

  protected enterCloneMode(): void
  protected exitCloneMode(): void
  protected isCloneMode(): boolean

  protected customEvent: CustomEvent
}
```

Dirty-check confirm-before-close + clone-mode ("Save As") workflows extracted as protected hooks.

**Hardening**: drop `any` for `initialEntity` (use `TItem` generic). Verify `aria-modal` is applied on dialog open and override if Serenity's base class doesn't already.

#### `idevsInlineDialog.ts`

```ts
export type IdevsCustomButton = {
  id: string
  text: string
  columnCssClass?: string
  cssClass?: string
  style?: Partial<CSSStyleDeclaration>   // string variant dropped (CSS-injection vector)
  click?: (e: Event) => void
  afterField?: string
}

export type IdevsEmptyField = {
  columnCssClass?: string
  cssClass?: string
  style?: Partial<CSSStyleDeclaration>
  afterField?: string
}

export type IdevsInlineDialogCallbacks = {
  onSave?: (entity: unknown) => void
  onCancel?: () => void
  onChange?: (entity: unknown) => void
}

@Decorators.registerClass()
export class IdevsInlineDialog<TItem, P = unknown> extends EntityDialog<TItem, P> {
  addCustomButton(button: IdevsCustomButton): void
  addEmptyField(field: IdevsEmptyField): void
}
```

**Hardening**: `Partial<CSSStyleDeclaration> | string` → object only (the string variant in the source allowed arbitrary CSS injection). Editor references updated to `IdevsDateEditor` (already in main via batch 2).

#### `idevsPropertyDialog.ts`

~80 LOC port. Extends Serenity's `PropertyDialog`. Adds shared lifecycle hooks for dialog sizing + open/close instrumentation.

#### `idevsSearchDialog.ts`

```ts
@Decorators.registerClass()
export class IdevsSearchDialog<TRow = Record<string, unknown>, P = unknown>
  extends EntityDialog<TRow, P> {
  FilterKeys?: Record<string, unknown>
  CriteriaKeys?: unknown[]
  SearchValue?: string
  preItems?: TRow[]

  dialogOpen(): void
  protected emitSelection(row: TRow): void   // dispatches dataSelected CustomEvent
}
```

This is the production implementation of the dialog `IdevsSearchButtonEditor` resolves via `searchDialogType`. PR-3a's tests use a stub; PR-4a ships the real class. Consumers extend `IdevsSearchDialog<TRow>` for typed rows.

### 6.2 `src/panels/`

#### `idevsPanel.ts`

```ts
export type IdevsPanelFieldOptions = {
  type: 'string' | 'number' | 'decimal' | 'enum' | 'lookup' | 'serviceLookup' | 'date' | 'search' | 'selfSearch'
  name: string
  title?: string
  required?: boolean
  readOnly?: boolean
  // ... per-type config
}

export type IdevsPanelOptions = {
  title?: string
  fields: IdevsPanelFieldOptions[]
  columns?: number
  // ... layout config
}

@Decorators.registerClass()
export class IdevsPanel<P extends IdevsPanelOptions = IdevsPanelOptions> extends Widget<P> {
  // Field-rendering container that delegates to Serenity's built-in editors
  // (StringEditor, DecimalEditor, EnumEditor, LookupEditor, ServiceLookupEditor)
  // plus the Idevs editor family (IdevsDateEditor, IdevsSearchButtonEditor,
  // IdevsSelfSearchButtonEditor, IdevsTagEditor, IdevsNumericTagEditor).
}
```

**Hardening**: explicit field-type discriminated union (no string-typed `type` field). Unknown editor type throws a clear error at construction (not silent no-op). ARIA: `<label for>`/`<input id>` pairing for every field.

#### `idevsOffcanvasPanel.ts`

Bootstrap offcanvas wrapper. **Hardening**: full ARIA dialog pattern matching `SearchModalController`'s focus discipline — `role="dialog"`, `aria-modal`, `aria-labelledby`, focus capture on open, focus restoration to invoker on close, Escape closes.

#### `idevsTabControl.ts`

Bootstrap tab wrapper. **Hardening**: full WAI-ARIA tab pattern — `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls`, `role="tabpanel"` + `aria-labelledby`, arrow-key navigation (Left/Right) between tabs with `tabindex` management. Optional `aria-orientation` for vertical tablists.

#### `idevsPage.ts`

Structural container. Minimal hardening surface (no value writes, no dialog lifecycle).

### 6.3 `src/helpers/` additions

- `layoutHelper.ts` — pure DOM/layout utilities ported from `LayoutHelper.ts`. Each function unit-testable in isolation. Likely contents: column splits, breakpoint detection, sticky-element positioning, viewport calculations.
- `buttons.ts` — toolbar button factory functions. Strip PowerACC-specific button presets (anything referencing approval/booking/shipping marks).
- `filterHelper.ts` — filter-criteria utilities.
- `dialogHelper.ts` (EXTENDED) — merge in generic exports from PowerACC's `Dialogs.ts`: `fixMobileCloseDialog`, `setDialogSize`, `groupFields`, `setActiveModal`, `setInactiveModal`, `disableRadioButtons`, `enableRadioButtons`, `enableRadioButtonEditor`, `addSearchButton<F>`, `SearchDialogOptions<F>`.

### 6.4 Public barrel updates (PR-4a)

```ts
// src/index.ts after PR-4a
export * from './editors'
export * from './formatters'
export * from './helpers'
export * from './types'
export * from './ui'
export * from './utils'
export * from './dialogs'   // NEW
export * from './panels'    // NEW
```

## 7. PR-4b architecture (provisional — detailed at port time)

```
src/grids/
├── idevsGridEditorBase.ts                  (~1,000 LOC after hardening)
├── idevsGridEditController.ts              (~410 LOC)
├── idevsSearchGrid.ts                      (~180 LOC)
├── idevsSelectableEntityGrid.ts            (~30 LOC; evaluate merge with idevsSearchGrid)
├── idevsEntityGrid.ts                      (~15 LOC; evaluate drop entirely)
└── index.ts
```

- `IdevsGridEditorBase` will get the same decomposition treatment as `IdevsSelfSearchButtonEditor` if it exceeds 600 LOC after hardening — internal helpers extracted to `src/grids/internal/`.
- `IdevsGridEditController` extracted as a controller class (constructor-injected callbacks, no back-reference to grid) — same pattern as `SearchModalController`.
- `IdevsSelectableEntityGrid` (21 LOC) and `IdevsEntityGrid` (10 LOC) evaluated at port time for net value vs consumers extending Serenity's `EntityGrid` directly.

**Hardening focus**: narrow SleekGrid's `any`-heavy editing APIs via structural constraints (`SlickWrappedEditor` precedent). Listener lifecycle matching the modal/dropdown discipline.

## 8. PR-4c architecture (provisional)

```
src/filterPanel/
├── idevsFilterPanel.ts                     (~600-700 LOC main class after decomposition)
├── internal/
│   ├── filterFieldRenderers.ts             (per-type field rendering)
│   ├── filterStateManager.ts               (criteria serialization)
│   └── filterEvents.ts                     (apply/clear/save events)
└── index.ts
```

The source `CsiFilterPanel.tsx` is 1,048 LOC — decomposed the same way `IdevsSelfSearchButtonEditor` was (main class + internal subdir + controllers).

PR-4c depends on PR-4b's `IdevsSearchGrid` for lookup-field popovers and on PR-4a's `IdevsPanel`/`IdevsTabControl` for layout.

## 9. Testing strategy

**PR-4a target: ~80-100 tests**

- Dialog smoke per class — construction, ARIA wiring, dirty-check confirm flow (IdevsEntityDialog), custom button registration (IdevsInlineDialog), search-result emission (IdevsSearchDialog).
- Panel smoke — field-rendering routes correctly to each editor, options propagation, idempotent destroy.
- TabControl — ARIA tab pattern, arrow-key navigation.
- Helper unit tests — `layoutHelper` ~30 tests for pure helpers, `buttons`, `filterHelper`.
- New: `tests/_helpers/dialogTestUtils.ts` for shared dialog mount/unmount helpers.

**PR-4b target: ~60-80 tests**

- `IdevsGridEditorBase` via a `TestableGridEditor` fixture pattern (analog to `TestableSlickEditor` from batch 3).
- `IdevsGridEditController` state-machine tests with mocked SlickGrid.
- `IdevsSearchGrid` row selection + filter pipe through to dialog callbacks.

**PR-4c target: ~50-70 tests**

- Field-renderer purity tests per field type.
- Criteria-state manager round-trip (serialize → deserialize identity).
- IdevsFilterPanel smoke: apply/clear/save flows, ARIA, destroy cleanup.

**Total across batch 4: ~200 new tests.**

## 10. Test infrastructure

- Reuse existing `tests/editors/_helpers/searchDialogStub.ts` for backwards-compat tests.
- Add `tests/_helpers/dialogTestUtils.ts` — common dialog mount/unmount helpers, modal-stack assertions.
- Add `tests/_helpers/serviceCallStub.ts` if any new dialog/grid talks to Serenity services (currently only the editor tests use this).

## 11. MIGRATION.md updates (per PR)

### PR-4a section

- New `src/dialogs/` and `src/panels/` directories with public barrels.
- `Csi*` → `Idevs*` renames for `InlineDialog`, `EntityDialog`, `PropertyDialog`, `SearchDialog`, `Panel`, `OffcanvasPanel`, `TabControl`, `Page`.
- New helpers: `layoutHelper`, `buttons`, `filterHelper`.
- Extended `dialogHelper.ts` gains the generic exports from `Dialogs.ts`.
- **Dialogs.ts's PowerACC-domain types are NOT ported** — consumers keep `ApprovalRequestRow`/`BookingApprovalRequestRow`/`RequestPrintShippingMarkParameter`/etc. locally in PowerACC. Editor-reference ripple from batches 2-3 means PowerACC's existing `Csi*` editor imports should already be migrated.
- `IdevsInlineDialog.IdevsCustomButton.style` and `IdevsEmptyField.style` no longer accept a `string` variant (CSS-injection vector); use the `Partial<CSSStyleDeclaration>` form.

### PR-4b section

- New `src/grids/` directory with public barrel.
- `Csi*` → `Idevs*` renames for `GridEditorBase`, `GridEditController`, `SearchGrid`. `SelectableEntityGrid` and `EntityGrid` may be merged/dropped at port time (will be documented when finalized).
- `IdevsGridEditorBase`'s `TEditor` generic now constrained by `SlickWrappedEditor`-style structural type.

### PR-4c section

- New `src/filterPanel/` directory with public barrel; internal subdir not exported.
- `Csi*` → `Idevs*` rename for `FilterPanel`.

## 12. Risks and trade-offs

1. **Serenity dialog lifecycle quirks** — `EntityDialog` has subtle subclass contracts (`loadEntity` ordering, `onDialogOpen` timing). Mitigation: each dialog gets a smoke test driving the full open → load → save → close cycle.

2. **`Dialogs.ts` callsites in PowerACC** — PowerACC's existing `import {setDialogSize} from '@/Csi'` will need to switch to `import {setDialogSize} from '@idevs/corelib/helpers'` once PR-4a ships. Documented in MIGRATION.md; the function bodies are identical.

3. **CsiFilterPanel internal coupling unknown** — at 1,048 LOC the actual decomposition boundaries can only be confirmed by reading the file. PR-4c design is provisional and will be revised at port time.

4. **`IdevsGridEditorBase` SleekGrid-internal patterns unknown** — same caveat as #3. PR-4b design provisional.

5. **Public-barrel surface growing** — after batch 4, the main barrel exports become substantial. Follow-up: formalize subpath exports per directory (`@idevs/corelib/dialogs`, `@idevs/corelib/panels`, `@idevs/corelib/grids`, `@idevs/corelib/filterPanel`). Out of scope for batch 4; tracked.

6. **Editor reference updates** — PowerACC's dialog/panel sources reference `CsiDateEditor`, `SearchButtonEditor`, `SelfSearchButtonEditor`, `TagEditor`. The port substitutes our `Idevs*` versions (already in main via batches 2-3).

7. **`style: string` removal in IdevsInlineDialog** — minor breaking change. Consumers passing a raw CSS string can migrate by parsing to an object. Documented.

## 13. Out of scope (follow-ups)

- ShippingMark* port (PowerACC keeps these as domain code).
- PowerACC-domain parameter types from `Dialogs.ts` (kept in PowerACC).
- Subpath exports per directory (`@idevs/corelib/dialogs` etc.).
- Result virtualization in any new grid surfaces (if needed) — separate effort.
- Real focus trap on dialogs (PR-3b deferred this; could be implemented in batch 4 if a clean reusable helper emerges, otherwise still deferred).

## 14. Acceptance criteria (per PR)

- All four CI steps pass: typecheck, lint, test, build.
- No `EditorProps<any>` or new `any` types in new code.
- All dialogs have a passing ARIA smoke test (role / aria-modal / aria-labelledby).
- Idempotent `destroy()` verified for every new dialog/panel via a regression test.
- MIGRATION.md section for the PR.
- Public barrel exports the new top-level modules; internal subdirs (`src/filterPanel/internal/`, `src/grids/internal/` if it exists) are NOT exported publicly.
