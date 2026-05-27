# Migration Guide

## 1.3.x → 1.4.0 — batch 4a dialog/panel foundation

### New dialog classes

All in `src/dialogs/`, exported from the public barrel.

- `IdevsPropertyDialog` (decorator: `Idevs.CoreLib.IdevsPropertyDialog`) — replaces PowerACC's `CsiPropertyDialog`. Extends Serenity `PropertyDialog`; integrates with modal-stack helpers; dispatches `onDialogClose` CustomEvent.
- `IdevsEntityDialog` (decorator: `Idevs.CoreLib.IdevsEntityDialog`) — replaces PowerACC's `CsiEntityDialog`. Adds dirty-check confirm-on-close, clone mode (`__idevsCloneMode` marker, renamed from `__csiCloneMode`), and a custom close button.
- `IdevsInlineDialog` (decorator: `Idevs.CoreLib.IdevsInlineDialog`) — replaces PowerACC's `CsiInlineDialog`. Embeds an EntityDialog inline (non-modal) with custom buttons + empty field slots.
- `IdevsSearchDialog` (decorator: `Idevs.CoreLib.IdevsSearchDialog`) — replaces PowerACC's `CsiSearchDialog`. Abstract base for search-result dialogs with grid integration + clear/new toolbar buttons.

### New panel classes

All in `src/panels/`, exported from the public barrel.

- `IdevsPage` (decorator: `Idevs.CoreLib.IdevsPage`) — replaces PowerACC's `CsiPage`. Page-level container; no preact dependency (source used `render(<CsiTitle/>)`; ported with plain DOM).
- `IdevsPanel` (decorator: `Idevs.CoreLib.IdevsPanel`) — replaces PowerACC's `CsiPanel`. Field-rendering container with label + input pairs.
- `IdevsOffcanvasPanel` (decorator: `Idevs.CoreLib.IdevsOffcanvasPanel`) — replaces PowerACC's `OffCanvasPanel`. Bootstrap offcanvas slide-out hosting an EntityDialog.
- `IdevsTabControl` (decorator: `Idevs.CoreLib.IdevsTabControl`) — replaces PowerACC's `CsiTabControl`. Bootstrap tabs with full WAI-ARIA wiring.

### New helpers

- `src/helpers/layoutHelper.ts` — 21 DOM/layout utilities ported from PowerACC's `LayoutHelper.ts`. **Behavioral change**: the source attached 7 of these as `HTMLElement.prototype` methods; they are now plain functions:

  ```ts
  // PowerACC:
  element.createLayout(3, 'col')

  // idevs.corelib:
  import { createLayout } from '@idevs/corelib'
  createLayout(element, 3, 'col')
  ```

  Note: helpers are re-exported from the main `@idevs/corelib` barrel — there is no separate `@idevs/corelib/helpers` subpath in `package.json#exports`. Use the root import.

  Affected functions: `createLayout`, `addElementGroup`, `createGroup`, `addElements`, `addElementsWithEmptyElement`, `setTabIndex`, `groupColumnHeader`.

  Note: `layoutHelper.ts`'s async polling `getElementHeight` is re-exported as `waitForElementHeight` to disambiguate from `utils/dom.ts`'s synchronous variant.

- `src/helpers/filterHelper.ts` — `clearFilter(filters)` ported from PowerACC's `FilterHelper.ts`.

- `src/helpers/dialogHelpers.ts` (plural — new file, leaves existing `dialogHelper.ts` untouched) — generic dialog/modal helpers from PowerACC's `Dialogs.ts`. Exports: `setDialogSize`, `fixMobileCloseDialog`, `groupFields`, `setActiveModal`, `setInactiveModal`, `disableRadioButtons`, `enableRadioButtons`, `enableRadioButtonEditor`, `disableRadioButtonEditor`, `enableEditor`, `disableEditor`, `disableToolbarButton`, `enableToolbarButton`, `toggleInputValidateMessage`, `addSearchButton`, `SearchDialogOptions`, `IdevsDialogEventName`, `createCustomEvent`.

### NOT ported (stay in PowerACC)

- `ShippingMarkEntityDialog`, `ShippingMarkPanel` — PowerACC's shipping-mark module.
- The PowerACC-domain types from `Dialogs.ts`: `NameValueCollection`, `RequestApprovalDetailParameter`, `IvnRequestApprovalDetailParameter`, `BookingRequestApprovalDetailParameter`, `RequestApprovalParameter`, `RequestOnedateReportParameter`, `InventoryRequestApprovalParameter`, `BookingRequestApprovalParameter`, `RequestPrintShippingMarkParameter`. These reference `@/ServerTypes/Sales/ApprovalRequestRow` and similar — domain code stays in PowerACC.

### Breaking API renames

- PowerACC's PascalCase assignment-style setters (`dialog.FilterKeys = ...`, `dialog.CriteriaKeys = ...`, `dialog.DialogSize = ...`) are replaced with camelCase methods on dialogs: `setFilterKeys()`, `setCriteriaKeys()`, `setDialogSize()`, `setDialogType()`, `setDialogPermission()`, `setPreItems()`.
- `IdevsInlineDialog.IdevsCustomButton.style` and `IdevsInlineDialog.IdevsEmptyField.style` no longer accept a raw CSS-string variant (CSS-injection vector) — use `Partial<CSSStyleDeclaration>` only.
- `CsiPanel.PanelTitle` / `CsiPanel.Fields` getters/setters → `IdevsPanel.title` + `IdevsPanel.setTitle()` + `IdevsPanel.getFields()` + `IdevsPanel.setFields()`.
- Clone-mode marker `__csiCloneMode` → `__idevsCloneMode`. Consumers that inspect this marker directly need to migrate (rare — typically only `isCloneMode()` users).
- `IdevsPanel`'s editor factory no longer special-cases `CsiDateEditor` for the `format: 'd/m/Y'` default. Consumers using `IdevsDateEditor` (which lives at the `@idevs/corelib/editors/idevsDateEditor` subpath because of its optional `flatpickr` peer dep) must set `format: 'd/m/Y'` explicitly in their `editorOptions`.

### Hardening deltas vs PowerACC source

- **Security**: XSS-safe label markup in `IdevsPanel` and `toggleInputValidateMessage` (DOM API + `textContent` + `createElement('sup')` — replaces the source's raw HTML-property writes on form labels). `IdevsOffcanvasPanel`'s titlebar copy uses `replaceChildren(cloneNode())` instead of raw markup copy.
- **Resource hygiene**: `IdevsEntityDialog`'s `beforeunload` window listener is now stored and removed in `destroy()` (source registered without cleanup — leak across dialog lifetimes).
- **Async correctness**: `IdevsEntityDialog`'s close-button handler replaces source's `setInterval(100ms)` polling for `_canClose` with a Promise that resolves when the flag flips. Debug `console.log("Waiting for flag")` removed.
- **No-console policy**: `console.log/error` debug spam removed from `IdevsOffcanvasPanel`. `LayoutHelper`'s Thai-language `console.error` logs replaced with silent fail.
- **ARIA additions**: `IdevsOffcanvasPanel` now has `role="dialog"` + `aria-modal="true"` (source had aria-labelledby but no role/aria-modal). `IdevsTabControl` already had complete ARIA in source — preserved.
- **Type quality**: `any` → `unknown` or proper generics throughout; structural types replace untyped Serenity casts in `IdevsInlineDialog`'s dialog-internals access and `IdevsPanel`'s editor-instance reads.
- **`saveDialogForm` refactor**: replaced the `new Promise(async ...)` executor with direct `async/await` + a leaf Promise for the save callback (ESLint `no-async-promise-executor` compliance).

### Public barrel changes

```ts
// src/index.ts after 1.4.0
export * from './editors'
export * from './dialogs'    // NEW
export * from './formatters'
export * from './panels'     // NEW
export * from './ui'
export * from './helpers'    // EXTENDED — adds dialogHelpers, filterHelper, layoutHelper
export * from './utils'
export * from './types'
```

## 1.2.x → 1.3.0 — batch 3b self-search button editor

### New editors

- `IdevsSelfSearchButtonEditor` (decorator: `Idevs.CoreLib.IdevsSelfSearchButtonEditor`) — self-hosted search-button editor that fetches results via Serenity's `serviceCall` and renders them in an in-editor modal or dropdown. No separately-registered Serenity search dialog required. Replaces PowerACC's `SelfSearchButtonEditor`.
- `SlickSelfSearchButtonEditor` — SleekGrid column adapter wrapping `IdevsSelfSearchButtonEditor`. Replaces PowerACC's `SlickSelfSearchButtonEditor`.

### New options

- `presentation: 'modal' | 'dropdown'` (default: `'modal'`) — selects the in-editor result UI. The PowerACC source had two parallel code paths for these; in this port they're separate controllers (`SearchModalController` + `SearchDropdownController`) selected at construction time. Switching mid-life is NOT supported.

### Breaking API renames (same as 1.2.0 for SearchButtonEditor)

- `editor.filterKeys = {...}` → `editor.setFilterKeys({...})`
- `editor.CriteriaKeys = [...]` → `editor.setCriteriaKeys([...])`
- `editor.setFilterValue(key, value)` is kept from the source unchanged.

### Hardening deltas vs PowerACC source

- Decomposed from a single 3,404-LOC file into focused modules:
  - `src/editors/selfSearch/columnFormatters.ts` — pure parsing + built-in formatters.
  - `src/editors/selfSearch/searchModal.ts` — modal controller with WAI-ARIA dialog semantics + focus restoration on close (focus returns to invoker). Note: not a full focus trap — Tab can still exit the dialog. Planned follow-up.
  - `src/editors/selfSearch/searchDropdown.ts` — combobox-style dropdown variant; click-outside dismisses; window resize re-positions.
- XSS-safe required marker via `shared/requiredMarker`.
- Single-chokepoint value writes via `set_value()`.
- WAI-ARIA combobox on the display input; `aria-haspopup` adapts to `dialog` or `listbox` based on `presentation`.
- Both presentation controllers expose `destroy()` that removes ALL listeners + DOM and are idempotent.

### Internal modules

- `src/editors/selfSearch/{columnFormatters,searchModal,searchDropdown,index}.ts` are internal modules. They are NOT re-exported from the public `editors` barrel and may change without a major version bump.

### Known limitations

- Result rows are not virtualized. Source caps via `maxResultsToShow`; large result sets render all rows to DOM (mirrors source behavior).
- The modal and dropdown controllers intentionally retain ~40% duplicated table/keyboard/sort logic. A follow-up extraction (`selfSearch/resultsTable.ts`) is tracked separately to avoid premature consolidation.

## 1.1.x → 1.2.0 — batch 3a search-button editor foundation

### New editors

- `IdevsSearchButtonEditor` (decorator: `Idevs.CoreLib.IdevsSearchButtonEditor`) — hidden input + display input + search/clear buttons + Serenity dialog integration. Replaces PowerACC's `SearchButtonEditor`.
- `IdevsNumericTagEditor` (decorator: `Idevs.CoreLib.IdevsNumericTagEditor`) — extends `IdevsTagEditor` with prefix/suffix/specialValues formatting. Replaces PowerACC's `NumericTagEditor`.
- `SlickEditorBase` (no decorator — SleekGrid column-editor base, not a Serenity widget) — abstract base for SleekGrid column editors wrapping a Serenity widget. Replaces PowerACC's `SlickEditorBase`.
- `SlickSearchButtonEditor` — SleekGrid column adapter wrapping `IdevsSearchButtonEditor`. Replaces PowerACC's `SlickSearchButtonEditor`.

### Breaking API renames

- `IdevsSearchButtonEditor` ports the PowerACC API but renames two PascalCase setters to camelCase methods:
  - `editor.filterKeys = {...}` (asymmetric setter) → `editor.setFilterKeys({...})`
  - `editor.CriteriaKeys = [...]` (PascalCase asymmetric setter) → `editor.setCriteriaKeys([...])`
- Consumers using `editorParams` to configure these are unaffected.
- `SlickEditorBase`'s `TEditor` generic is now constrained by `SlickWrappedEditor` (must expose `domNode: HTMLElement`; `value?`, `destroy?`, `props?` are optional). Subclasses wrapping editors that lack those shapes need to declare them.
- `SlickEditorBase.validate()` now returns `{ valid: boolean; msg?: string }` (matching SleekGrid's `ValidationResult`) instead of `{ valid: boolean; msg: string | null }`. The optional-property form is compatible with the source semantics but TypeScript callers comparing `msg === null` need to compare `msg === undefined`.

### Hardening deltas vs PowerACC source

- XSS-safe required marker via `document.createElement('sup')` + `textContent` (no raw HTML-property writes on labels — same fix pattern as the 1.1.0 `DropdownToolButton` audit).
- WAI-ARIA combobox role on the display input (`role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-required`).
- Single-chokepoint value writes — every `domNode.value` mutation routes through `set_value()`.
- `destroy()` stops the `MutationObserver`, clears subscribers, and is idempotent.
- Plain `type` for options (no `EditorProps<any>` extension); `unknown` instead of `any` throughout.

### Internal helpers (not part of the public API)

- `src/editors/shared/maskedPattern.ts`, `src/editors/shared/requiredMarker.ts`, `src/editors/shared/validationObserver.ts` are internal modules for editor authoring. They are NOT re-exported from the public `editors` barrel and are subject to change without a major version bump.

### Recommended migration

Replace direct PowerACC imports:

```ts
// before
import { SearchButtonEditor } from 'PowerACC/Modules/Csi'

// after
import { IdevsSearchButtonEditor } from '@idevs/corelib/editors'
```

For consumers that previously did:

```ts
editor.filterKeys = { region: 'EU' }
editor.CriteriaKeys = ['active']
```

migrate to:

```ts
editor.setFilterKeys({ region: 'EU' })
editor.setCriteriaKeys(['active'])
```

## 1.0.x → 1.1.0

**No runtime breaking changes.** All changes from 1.0.5 preserve the runtime
behaviour of existing code paths. One TypeScript-signature change is worth
noting: `doExportPdf` and `doExportExcel` now return `Promise<void>` instead
of `void`. Existing call sites that did not previously expect a return value
still work at runtime (the promise is dropped), but callers whose code passes
either function to a `() => void` callback slot will see a TS error because
`() => Promise<void>` is no longer assignable. Either await the call, attach
`.catch()`, or wrap in a void-returning lambda.

This release is otherwise a foundation update — strict TS slice enabled,
Vitest harness, GitHub Actions CI, XSS fixes, async export helpers, and
additive wire-contract fixes. Consumers on `^1.0.5` upgrade with
`npm update @idevs/corelib`.

### Recommended migration steps

#### 1. Use `DownloadName` instead of `FileName`

`IdevsContentResponse.FileName` is now `@deprecated`. The server (Idevs.Net.CoreLib)
emits `DownloadName`; the `FileName` field has always been `undefined` at runtime.

```ts
// before
const name = response.FileName ?? 'report.pdf'
// after
const name = response.DownloadName ?? 'report.pdf'
```

#### 2. Opt in to prototype extensions explicitly

For backwards compatibility, `import '@idevs/corelib'` still applies the global
prototype extensions to `Date.prototype`, `Number.prototype`, and
`String.prototype`. This will be removed in 2.0.0.

Prepare today:

```ts
// In your app entry point, replace any reliance on the implicit side-effect
// with one of these patterns:

// (A) Use the utility functions directly (preferred):
import { toSqlDateString, toTimeString, truncateString } from '@idevs/corelib'
const sql = toSqlDateString(new Date())

// (B) Opt in to the prototype patches explicitly:
import '@idevs/corelib/globals'
// Now `new Date().toSqlDate()` is available throughout the app.
```

#### 3. Await `doExportPdf` / `doExportExcel`

Both helpers now return `Promise<void>` and reject on server failure. Existing
calls (`doExportPdf(opts)`) still work but leak unhandled rejections.

```ts
// before
doExportPdf({ service: '/api/Foo/Export', ... })
// after
await doExportPdf({ service: '/api/Foo/Export', ... })
// or
doExportPdf({ ... }).catch(err => Q.notifyError(err.message))
```

#### 4. Note: `addDateProxyInput` now throws when the source input is missing

Previously it would crash with an opaque `TypeError`. Now it throws
`Error('addDateProxyInput: input[name="..."] not found')`. Wrap calls in
try/catch if you wire date proxies on conditionally-rendered forms.

#### 5. Declare Serenity as a peer

If your `package.json` does not already list `@serenity-is/corelib`,
`npm install` will now warn. Add the peers explicitly:

```jsonc
"dependencies": {
  "@serenity-is/corelib": "^8.8.6",
  "@serenity-is/sleekgrid": "^1.9.6"
}
```

> Note: you usually do **not** add `@idevs/corelib` to your `package.json`
> yourself — the `Idevs.Net.CoreLib` NuGet package's `.targets` file installs
> it for you on `dotnet build` (pinned to the matching npm major). Add it
> manually only if you've set `<IdevsCoreLibInstallNpmPackage>false</IdevsCoreLibInstallNpmPackage>`
> to opt out of the auto-install.

---

## 1.x → 2.0.0 (planned)

The 2.0.0 release is not yet scheduled. It will be a Serenity-10 / .NET-10
relaunch in lockstep with `Idevs.Net.CoreLib` 0.8+, plus the breaking-cleanup
of items deprecated in 1.1.0.

### Compatibility direction

| | 1.x lane (current) | 2.x lane (future) |
|---|---|---|
| `Idevs.Net.CoreLib` | 0.7.x | 0.8+ (planned) |
| .NET TFM | `net8.0` | `net10.0` |
| `Serenity.Net.Services` | `8.8.9` | `10.x` |
| `@serenity-is/corelib` | `>=8.8.6 <9` | `>=10.0.0 <11` |
| Visual Studio | 2022 | 2026 |

Serenity 9.x is intentionally skipped — the project follows Serenity's own
".NET 8 stays on the 8.x lane; .NET 10 moves to 10.x" guidance.

### Planned 2.0.0 changes

**Deprecation removals (from 1.1.0):**
- Remove `IdevsContentResponse.FileName` (use `DownloadName`).
- Remove implicit `import './globals'` from the root entry (use the subpath).

**Wire-contract alignment with .NET DTOs:**
- Rename camelCase wire fields to PascalCase to match the .NET DTO:
  `viewName` → `ViewName`, `companyName` → `CompanyName`,
  `reportName` → `ReportName`, `selectionRange` → `SelectionRange`,
  `conditionRange` → `ConditionRange`, `logo` → `Logo`, `entity` → `Entity`,
  `pageSize` → `PageSize`, `margin` → `Margin`.
- Drop the `render` / `openPrintDialog` flags from `IdevsExportRequest` (the
  wire DTO) — they remain on `PdfExportOptions` (the client-side options type).

**Serenity 10 modernization:**
- Replace `@Decorators.registerEditor(...)` / `@Decorators.registerFormatter(...)`
  / `@Decorators.option()` with `static [Symbol.typeInfo] = this.registerClass(...)`
  in every editor and formatter (Serenity 9+ deprecated decorator registration).
- Rewrite `DropdownToolButton` to use Serenity 10's `Fluent` / `@serenity-is/domwise`
  instead of jQuery `$(...)` HTML templates.
- Audit `pdfExportHelper.showFluentPdfPreview` for strict-CSP compatibility
  (Serenity 10's StartSharp template enables strict CSP by default) — move
  inline `cssText` blobs into the `css/` folder.
- Drop `@types/jquery`, `@types/jquery.validation`, `@types/jqueryui` from
  `tsconfig.types`.

**General cleanup:**
- Enable full TypeScript strict mode.
- Consider dropping CommonJS in favor of ESM-only, aligned with the modern
  Serenity 10 toolchain.
