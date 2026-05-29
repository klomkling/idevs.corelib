# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-05-30

> Covers work landed on `main` after `v1.1.1`: editor, dialog, panel, grid,
> helper, and hardening work for the 1.5.0 release.

### Added

- **Editor additions**:
  - `IdevsTagEditor` with combobox/listbox ARIA, casing support, required-state validation, read-only support, keyboard navigation, and idempotent cleanup.
  - `IdevsDateEditor` at `@idevs/corelib/editors/idevsDateEditor`, with `flatpickr` as an optional peer, ISO-value normalization, user-format display, modal placement handling, validation-class sync, and read-only handling.
  - `IdevsNumericTagEditor`, `IdevsSearchButtonEditor`, `IdevsSelfSearchButtonEditor`, `SlickEditorBase`, `SlickSearchButtonEditor`, and `SlickSelfSearchButtonEditor`.
  - Internal editor helpers for masked patterns, required markers, validation mirroring, and self-search result rendering.
- **Dialog and panel additions**:
  - `IdevsPropertyDialog`, `IdevsEntityDialog`, `IdevsInlineDialog`, `IdevsSearchDialog`.
  - `IdevsPage`, `IdevsPanel`, `IdevsOffcanvasPanel`, `IdevsTabControl`.
- **Grid additions**:
  - Root exports: `IdevsEntityGrid`, `IdevsSearchGrid`, `IdevsGridEditController`.
  - Optional-subpath exports: `IdevsSelectableEntityGrid` and `IdevsGridEditorBase`.
  - Custom cell-editor registry via `IdevsGridEditController.registerCellEditor(...)`.
- **Helper ports**:
  - `layoutHelper`, `filterHelper`, and plural `dialogHelpers` modules.
  - Root helper exports extended with layout/dialog/filter helpers; async layout `getElementHeight` is exported as `waitForElementHeight` to avoid a name clash.
- **Optional peer dependency coverage**:
  - `flatpickr` for `IdevsDateEditor`.
  - `@serenity-is/extensions` for selectable/grid-editor subpath grids.
- **Test coverage and docs**:
  - New Vitest suites for editors, self-search controllers, dialogs, panels, helpers, grids, grid-controller type assertions, and regression scenarios.
  - Design/spec and review documents for the 1.5.0 component work.

### Changed

- The public root barrel now exports `editors`, `dialogs`, `grids`, `panels`, expanded `helpers`, `utils`, and `types`.
- Legacy PascalCase assignment APIs were converted to camelCase methods where applicable, with compatibility shims retained on the dialog/search/grid surfaces documented in `MIGRATION.md`.
- `IdevsDateEditor` is intentionally not re-exported from the `editors` barrel so consumers that do not use dates are not forced to resolve `flatpickr`.
- `IdevsPanel` no longer assumes a legacy date editor format; consumers using `IdevsDateEditor` should pass `format: 'd/m/Y'` explicitly when they need that display format.
- `IdevsGridEditController` identifies mounted custom editors by a controller-owned marker attribute instead of class-name regex matching. Custom renderers must use the provided `appendEditorChild(child)` callback.
- `IdevsGridEditController` header navigation matches `column.id` first, then `column.field`, and logs a warning when header `data-id` matches no visible column.
- `IdevsGridEditController.notifyCellChange` now catches and logs throwing host subscribers after the editor state has already been committed.
- `IdevsGridEditorBase.deleteCurrentRow` no longer rethrows if grid repaint fails after the data-layer delete has succeeded; it records the deleted row, logs, and notifies the user.
- `IdevsGridEditorBase` cell-click handling now commits active edits before any same-row or different-row cell navigation. Failed commits block navigation.
- `IdevsGridEditorBase.addButtonClick` preserves commit -> row-validate -> addItem ordering.
- `IdevsSearchGrid.handleEditItemError` is now invoked through a safe wrapper that downgrades throwing overrides to logged warnings.
- `package.json` now includes subpath exports for optional date/grid modules and peer metadata for optional peers.
- `eslint.config.mjs` and test TypeScript config were extended for the larger source and test surface.
- `package-lock.json` now scopes the `glob` override to `@serenity-is/tsbuild` for CVE-2025-64756.

### Fixed

- XSS risks in new editor, dialog, panel, grid, and validation-message rendering paths by using DOM APIs and `textContent` instead of raw markup writes.
- Data-loss paths in grid editing where navigation could tear down an active editor before commit or validate stale row state before adding a row.
- Lifecycle leaks from unremoved window/document/SlickGrid listeners, mutation observers, self-search modal/dropdown listeners, and grid-editor subscriber arrays.
- Read-only, focus, validation, and modal-placement edge cases in date, tag, search-button, self-search, dialog, and grid controls.
- SlickGrid editor cleanup drift, including stale editor marker/classes during toggle-off, row changes, and cell changes.
- Null-guard and private-field access issues across dialogs, panels, search grids, grid editors, and helper code.
- Async correctness issues in dialog close handling, search dialog opening, self-search focus timers, and grid edit error handling.

### Removed

- Application-domain modules and types were intentionally not included: `ShippingMark*` modules and approval/report parameter types that reference application-specific server rows.
- The application-specific `CustomerProductPriceEditor` special case was removed from grid editor dispatch; consumers should register app-specific editors through `registerCellEditor(...)`.
- Layout helper prototype extensions were not carried forward; affected helpers are plain exported functions.
- Raw CSS-string style variants were removed from `IdevsInlineDialog.IdevsCustomButton.style` and `IdevsInlineDialog.IdevsEmptyField.style`; use `Partial<CSSStyleDeclaration>`.
- Internal self-search/helper modules are not part of the public barrel and should not be imported by consumers.

### Migration

- See `MIGRATION.md` for the full migration path since `v1.1.1`, including:
  - `1.1.1 -> 1.5.0` overview.
  - `1.1.x -> 1.2.0` editor/search-button changes.
  - `1.2.x -> 1.3.0` self-search changes.
  - `1.3.x -> 1.4.0` dialog/panel/helper changes.
  - `1.4.x -> 1.5.0` grid changes and PR-4b hardening contracts.

---

## [1.1.1] - 2026-05-24

### Added

- **Component primitives**:
  - `helpers/windowHelper.ts` — `isSmallDevice()` responsive media-query check.
  - `helpers/processQueryButtons.ts` — `addProcessQueryButtons()` factory for paired Query/Clear toolbar buttons.
  - `types/gridEditableMode.ts` — `GridEditableMode` discriminated union (`Full` / `Off` / `Some`).
  - `formatters/formatterHelper.ts` — `customerCodeFormatter`, `isNumericTemplate`, `isNumericInput` (filename fixes the original `Formater` typo).
- 22 new unit tests covering the three modules above.

## [1.1.0] - 2026-05-23

### Added

- **Vitest test harness** with jsdom environment; unit tests for `utils/format`, `utils/dom`, `globals` date proxy helpers, `DropdownToolButton`, and `pdfExportHelper`.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) running typecheck, lint, test, and build on PRs and pushes to `main`.
- **`@idevs/corelib/globals` subpath export** for opt-in prototype patches. Prepares for the 2.0.0 removal of the implicit side-effect import from the root entry.
- **`IdevsContentResponse.DownloadName`** field matching the .NET DTO. The existing `FileName` is preserved as a `@deprecated` alias.
- **`PdfExportOptions` / `ExcelExportOptions`** typed variants of `IdevsExportOptions` documenting which client-only flags apply to each path.
- **`MIGRATION.md`** with the deprecation guide and the 2.0.0 outlook.

### Changed

- `doExportPdf` and `doExportExcel` now return `Promise<void>` and surface server errors. Existing callers continue to work but should `await` (or `.catch`) to capture failures.
- `prepublishOnly` now gates publish behind typecheck, lint, and tests.
- `@serenity-is/corelib` and `@serenity-is/sleekgrid` are now `peerDependencies` (range `>=8.8.6 <9` / `>=1.9.6 <2`) instead of regular `dependencies`. `jquery` and `jspdf` are declared as optional peers.
- TypeScript `strictNullChecks` is now enabled. The rest of the strict-family flags remain off pending further migration.

### Fixed

- **XSS** in `DropdownToolButton.addSideButtonItem` — replaced HTML template interpolation with DOM-API construction (`buildSideButtonElement`), with invalid CSS-class tokens dropped as defense-in-depth.
- **XSS** in `pdfExportHelper.showFluentPdfPreview` — dialog title now uses `textContent` via the new `__buildPreviewDialog` helper. Bonus: the close-button glyph also moved from `innerHTML` to `textContent`.
- **Filename injection** in `doExportPdf` download — `options.reportName` is sanitized before use as `<a download>` via the new `__sanitizeDownloadName` helper.
- **Unhandled promise rejection** in `doExportPdf` — `serviceCall(...)` rejections are now propagated to the caller (function returns `Promise<void>` instead of `void`).
- **Null-deref risk** in `addDateProxyInput` and `updateDateProxyValue` when DOM queries return `null`. Note: `addDateProxyInput` now throws `Error('addDateProxyInput: input[name="..."] not found')` instead of crashing with a TypeError when the source input is missing.
- **Duplicate Blob/objectURL** creation in `doExportPdf` download branch.
- Replaced `any` with typed signatures in `IdevsExportOptions.onClick` (`(e: Event) => void`), `LookupFormatter.format(src: unknown, ...)`, and `CheckboxButtonEditor` lookup items (`Record<string, unknown>`).
- Stale `toastr` entry removed from `tsconfig.types` (the `@types/toastr` package wasn't installed and broke `tsc --noEmit`).

### Deprecated

- `IdevsContentResponse.FileName` — use `DownloadName` (matches the server DTO). Removal in 2.0.0.
- Implicit `import './globals'` in the root entry — opt in via `import '@idevs/corelib/globals'` instead. Removal in 2.0.0.

### Compatibility

- **No breaking changes.** Consumers on `^1.0.5` upgrade by running `npm update @idevs/corelib`.
- A future 2.0.0 will remove the deprecated paths and align wire DTO casing with the .NET DTO (`viewName` → `ViewName`, etc.). See `MIGRATION.md`.

---

## [1.0.5] - 2025-01-26

### Changed

- **Code Organization**: Eliminated duplicate type declarations by consolidating all export-related types in `src/types/export.ts`
- **Import Structure**: Updated imports to use proper source modules instead of duplicate declarations
- **Type Consistency**: Ensured all type definitions are maintained in a single source of truth

### Fixed

- **Type Definition Issues**: Resolved inconsistencies between duplicate type declarations that were causing TypeScript errors
- **Missing Properties**: Fixed missing `dialogTitle` property in `IdevsExportOptions` type definitions
- **Backward Compatibility**: Maintained compatibility by re-exporting types from `globals/index.ts`

### Removed

- **Duplicate Types**: Removed redundant type declarations from `src/globals/index.ts` (now re-exported from `types/export`)

## [1.0.4] - 2025-01-26

### Changed

- **PDF Export Enhancement**: Improved `doExportPdf` function with better rendering logic:
  - Added direct download functionality when render mode is disabled
  - Enhanced PDF preview dialog with Fluent UI styling and better user experience
  - Improved error handling for print functionality

### Added

- **Download Mode**: Added automatic file download functionality for PDF exports when render mode is set to false
- **Fluent UI Dialog**: Modern dialog interface for PDF preview with proper styling and animations
- **Auto-print Support**: Optional automatic print dialog trigger for PDF previews

### Fixed

- **Memory Management**: Proper cleanup of object URLs to prevent memory leaks
- **ESLint Compliance**: Added necessary ESLint disable comments for browser globals

## [1.0.3] - 2025-01-26

### Removed

- **Dependency cleanup**: Removed unused PDF-related packages and their type definitions:
  - Dependencies: `html-to-pdfmake`, `pdfmake`, `html2pdf.js`, `jspdf`
  - DevDependencies: `@types/html-to-pdfmake`, `@types/jspdf`, `@types/pdfmake`, `@types/toastr`, `@typescript-eslint/typescript-estree`, `bootstrap`
- **Bundle size reduction**: Significantly reduced package size by removing unused dependencies
- **Improved build performance**: Faster installation and build times due to fewer dependencies

### Changed

- **PDF Export Enhancement**: Improved `doExportPdf` function with better rendering logic:
  - Simplified conditional logic for render mode: now uses `options.render !== false` instead of `options.render || false`
  - Added direct download functionality when render mode is disabled
  - Enhanced PDF preview dialog with Fluent UI styling and better user experience
  - Improved error handling for print functionality

### Added

- **Download Mode**: Added automatic file download functionality for PDF exports when render mode is set to false
- **Fluent UI Dialog**: Modern dialog interface for PDF preview with proper styling and animations
- **Auto-print Support**: Optional automatic print dialog trigger for PDF previews

### Fixed

- **ESLint errors**: Fixed `no-undef` ESLint errors for browser globals (`setTimeout`, `requestAnimationFrame`)
- **Memory Management**: Proper cleanup of object URLs to prevent memory leaks

## [1.0.2] - 2025-01-26

### Changed

- **doExportPdf flexibility**: Made `grid` property optional in `IdevsExportOptions` type. The `doExportPdf` function now supports both grid-based exports (existing behavior) and manual exports without requiring a grid instance. When no grid is provided, the function will use the export options directly without extracting grid-specific data.

## [1.0.1] - 2025-01-26

### Fixed

- **Type compatibility issue**: Fixed `PageSize` type definition in `src/globals/index.ts` where the `Size` property was incorrectly self-referencing instead of referencing the `PageSizes` enum. This resolves the TypeScript error when using `doExportPdf` function across different projects.

## [1.0.0] - 2024-08-16

> **BREAKING CHANGES**: This is a major refactoring release with breaking changes. See migration guide below.

### 📦 Dependencies Updated - 2024-08-16

#### Major Updates

- **ESLint**: Updated from v8.57.0 to v9.33.0 with new flat config format
- **jsPDF**: Updated from v2.5.1 to v3.0.1 (major version update)
- **Prettier**: Updated from v2.8.8 to v3.6.2 (major version update)
- **TypeScript**: Updated from v5.5.4 to v5.9.2

#### Updated Dependencies

- `@serenity-is/corelib`: 8.6.2 → 8.8.6
- `@serenity-is/sleekgrid`: 1.9.0 → 1.9.6
- `@serenity-is/tsbuild`: 8.6.0 → 8.8.7
- `@types/jquery`: 3.5.29 → 3.5.32
- `@types/jquery.validation`: 1.16.10 → 1.17.0
- `@types/jqueryui`: 1.12.22 → 1.12.24
- `@types/pdfmake`: 0.2.9 → 0.2.11
- `@typescript-eslint/eslint-plugin`: 5.62.0 → 8.39.1
- `@typescript-eslint/parser`: 5.62.0 → 8.39.1
- `@typescript-eslint/typescript-estree`: 8.1.0 → 8.39.1
- `bootstrap`: 5.3.3 → 5.3.7
- `eslint-config-prettier`: 8.10.0 → 10.1.8
- `html-to-pdfmake`: 2.5.13 → 2.5.30
- `html2pdf.js`: 0.10.2 → 0.10.3
- `pdfmake`: 0.2.12 → 0.2.20

#### Configuration Changes

- **Migrated to ESLint v9 flat configuration format**
- Created new `eslint.config.js` replacing `.eslintrc`
- Updated all npm scripts to work with new ESLint
- Fixed security vulnerability in `brace-expansion` dependency

#### Benefits

- Latest security fixes and performance improvements
- Enhanced TypeScript support with newer versions
- Better linting with updated ESLint rules
- Improved PDF generation with jsPDF v3

### 🔄 Major Refactoring

#### Added

- **New modular structure** with separate utility modules:
  - `utils/date` - Date manipulation utilities
  - `utils/dom` - DOM manipulation utilities
  - `utils/format` - String and number formatting utilities
  - `types/common` - Common type definitions
  - `types/export` - Export-related types and functions
- **Modern build configuration**:
  - Updated package.json with proper exports field
  - Modern TypeScript configuration with strict mode
  - Enhanced ESLint rules with type checking
  - Updated Prettier configuration
- **Improved documentation**:
  - Comprehensive README with API examples
  - Migration guide for breaking changes
  - TypeScript configuration examples

#### Changed

- **Package structure**:
  - Main entry point now points to `dist/index.js` instead of `src/index.js`
  - Added proper TypeScript declaration files output
  - Moved type definitions to devDependencies where appropriate
- **Code organization**:
  - Separated concerns with dedicated utility modules
  - Improved type safety with strict TypeScript settings
  - Better naming conventions (camelCase functions)
  - Enhanced error handling and null checks
- **Build system**:
  - Updated build scripts for modern workflow
  - Added development scripts (watch, typecheck, etc.)
  - Improved dependency management

#### Deprecated

- **Prototype extensions**: While still functional, users are encouraged to use utility functions directly:
  - `String.prototype.truncate` → `truncateString()`
  - `Number.prototype.toTimeString` → `toTimeString()`
  - `Date.prototype.toSqlDate` → `toSqlDateString()`
  - And more...

#### Fixed

- **Type safety issues**: Resolved TypeScript strict mode violations
- **Import/export consistency**: Standardized module exports
- **Code quality**: Fixed ESLint violations and improved code style
- **Build issues**: Resolved package.json configuration problems

### 📦 Technical Improvements

- **Dependencies**: Updated and reorganized dependencies
- **TypeScript**: Enabled strict mode and modern compiler options
- **ESLint**: Added comprehensive rules with type checking
- **Prettier**: Updated formatting configuration
- **Documentation**: Added comprehensive API documentation and examples

### 🔧 Developer Experience

- **Better IDE support**: Improved TypeScript definitions and imports
- **Enhanced debugging**: Better source maps and declaration maps
- **Modern tooling**: Updated build tools and configurations
- **Clear structure**: Organized code into logical modules

---

## Previous versions

_For versions prior to this refactoring, please refer to the git commit history._

# Changelog

## 0.1.0 (2025-07-)

### Updates

## 0.0.97 (2024-09-08)

### Add

- Add makePdf function based on html-to-pdfmake and pdfmake

## 0.0.96 (2024-09-03)

### Add

- Add IdevsContentResponse

## 0.0.95 (2024-09-03)

### Add

- Add generatePdf function based on jspdf and html2pdf.js

## 0.0.94 (2024-08-16)

### Updates

- Update Serenity to version 8.6.2 and also update all library
- Update formatter

## 0.0.93 (2024-04-05)

### Fixes

- Change target environment to ES2020

## 0.0.92 (2024-04-05)

### Updates

- Update library
- Remove unused declaration

## 0.0.91 (2024-01-27)

### Updates

- Update Serenity to version 8.2.2
- Update editor and formatter related to the changes from Serenity

## 0.0.90 (2024-01-13)

### Updates

- Remove @types/bootstrap that no used

## 0.0.89 (2024-01-13)

### Changes

- Update serenity to version 8.1.5
- Remove support aggregate columns on ExcelExporter because it's cause performance issue

## 0.0.88 (2023-12-23)

### Updates

- Remove click function from DropdownToolButton. No need to manipulate dropdown toggle here.

## 0.0.87 (2023-12-23)

### Updates

- Update DropDownToolButton to use manual dropdown instead of bootstrap script

## 0.0.86 (2023-10-26)

### Updates

- Add space after comma for CheckBoxButtonEditor to be easy to wrap line

## 0.0.85 (2023-10-23)

### Updates

- Add option isStringId to correct mapping value

## 0.0.84 (2023-10-23)

### Updates

- Add property to CheckBoxButtonEditor that can get items or set items to update rendering output

## 0.0.83 (2023-10-15)

### Updates

- Add PageSizes enum, PageOrientations enum
- Add PageSize
- Update IdevsExportRequest

## 0.0.82 (2023-10-14)

### Updates

- Update IDevsExportRequest by add new property PageSize and PageMargin

## 0.0.81 (2023-10-13)

### Fixed

- Fixed DropdownToolButton not show dropdown when click. It's because the bootstrap

## 0.0.80 (2023-08-14)

### Updated

- Remove GetModal boostrap because it block serenity menu

## 0.0.79 (2023-07-29)

### Fixed

- Rollback to 0.0.73 and add toString()

## 0.0.78 (2023-07-28)

### Fixed

- Fixed error LookupFormatter again

## 0.0.77 (2023-07-28)

### Test

## 0.0.76 (2023-07-28)

### Fixed

- Fixed error LookupFormatter again

## 0.0.75 (2023-07-28)

### Fixed

- Fixed error LookupFormatter

## 0.0.74 (2023-07-28)

### Updated

- Change lookup formatter to use getLookupAsync

## 0.0.73 (2023-07-07)

### Updated

- Update DateMonthEditor to support uppercase

## 0.0.72 (2023-06-14)

### Fixed

- Fixed null exception error for updateDateProxyValue

## 0.0.71 (2023-06-14)

### Updated

- Merge addDateProxyInput and addDateQuickFilterProxy into addDateProxyInput
- Add dateDateProxyInputOption

## 0.0.70 (2023-06-14)

### Updated

- Update add date proxy value default locale to en-GB

## 0.0.69 (2023-06-14)

### Added

- Add support to add date proxy input background color for enabled and disabled/readonly

## 0.0.68 (2023-06-14)

### Fixed

- Fixed proxy element is null when find by id so have to find by name also

## 0.0.67 (2023-06-14)

### Updates

- Update updateDateProxyValue to support date and string

## 0.0.66 (2023-06-13)

### Updates

- Rename doProxyInput to addDateProxyInput
- Add updateDateProxyValue

## 0.0.65 (2023-06-07)

### Added

- Add google font to idevs.print.css

## 0.0.64 (2023-06-05)

### Added

- Add function find begin month and end month

## 0.0.63 (2023-06-03)

### Added

- Add conditionRange to IdevsExportRequest

## 0.0.62 (2023-06-01)

### Changes

- rename and remove talbe theme property on IdevsExportRequest

## 0.0.61 (2023-06-01)

### Added

- Add support customize table theme style for ExcelExporter
- Add more css

## 0.0.60 (2023-05-31)

### Updates

- Add GROUP to AggregateType enum

## 0.0.59 (2023-05-27)

### Updates

- Update function updateDateQuickFilterProxyValue to return empty string when value is null

## 0.0.58 (2023-05-27)

### Updates

- Change property columnName of IdevsExportRequest to optional

## 0.0.57 (2023-05-27)

### Fixed

- Fixed optional parameter for ExportOptions

## 0.0.56 (2023-05-27)

### Fixed

- Fixed passing parameter from ExportOptions to IdevsExportRequest

## 0.0.55 (2023-05-26)

### Fixed

- Fixed mis-spell

## 0.0.54 (2023-05-26)

### Updates

- Added aggregateColumns property for aggregate column on summary row
- Remove unnecessary property for ExcelExportRequest

## 0.0.53 (2023-05-24)

### Fixed

- Chane property type in IdevsExportRequest

## 0.0.52 (2023-05-24)

### Updates

- Add property to IdevsExportRequest

## 0.0.51 (2023-05-20)

### Updates

- Update CSS

## 0.0.50 (2023-05-18)

### Fixed

- Fixed bug for function toDecimal and toNumber

## 0.0.49 (2023-05-13)

### Updates

- Update CSS

## 0.0.48 (2023-05-11)

### Updates

- Update CSS

## 0.0.47 (2023-05-11)

### Updates

- Update CSS

## 0.0.46 (2023-04-15)

### Updates

- Update css

## 0.0.45 (2023-04-15)

### Updates

- Remove convertToDateString
- Add dateStrignOption() to get default Intl.DateTimeFormatOptions

## 0.0.44 (2023-04-15)

### Fixed

- Fixed pdfExportHelper and excelExportHelper
- rename toLocaleString to convertToLocaleString

## 0.0.43 (2023-04-14)

### Updates

- Update typescript to v.5.0.4 and related packages to latest version
- Update globals.ts

## 0.0.42 (2023-04-06)

### Fixed

- Fixed updateDateQuickFilterProxyValue

## 0.0.41 (2023-04-06)

## Fixed

- Fixed toSqlDate
- Fixed updateDateQuickFilterProxyValue

## 0.0.40 (2023-04-06)

### Changes

- Rename ToolDropdownButton to DropdownToolButton
- Add ToggleToolButton

## 0.0.39 (2023-04-02)

### Added

- Add DateMonthFormatter

## 0.0.38 (2023-04-02)

### Fixed

- Fixed return value from DateMonthEditor

## 0.0.37 (2023-04-02)

### Updates

- Update return value from DateMonthEditor

## 0.0.36 (2023-04-02)

### Fixed

- Fixed error DateMonthEditor

## 0.0.35 (2023-04-02)

### Fixed

- Forget export DateMonthEditor

## 0.0.34 (2023-04-02)

### Added

- Add DateMonthEditor

## 0.0.33 (2023-03-30)

### Added

- Add toSqlDate, toTimeString, toNumber

## 0.0.32 (2023-03-24)

### Updates

- Rename onExportExcel to doExportExcel
- Change IdevsExportRequest property viewName to nullable string type

## 0.0.31 (2023-03-24)

### Added

- add function toSqlDateString to convert date to string in sql format yyyy-MM-dd

## 0.0.30 (2023-03-23)

### Added

- Added more css

## 0.0.29 (2023-03-23)

### Changes

- Rename new properties add from v0.0.28

## 0.0.28 (2023-03-23)

### Changes

- Add more property to IdevsExportRequest

## 0.0.27 (2023-03-22)

## Fixed

- Finally remove onViewSubmit and check within onClick event

## 0.0.26 (2023-03-22)

## Fixed

- Forgot to build

## 0.0.25 (2023-03-22)

### Fixed

- Fixed onViewSubmit

## 0.0.24 (2023-03-22)

### Changes

- bring back onViewSubmit

## 0.0.23 (2023-03-22)

### Fixed

- remove onViewSubmit from excelExportHelper and pdfExportHelper

## 0.0.22 (2023-03-22)

### Fixed

- onViewSubmit on excelExportHelper and pdfExportHelper

## 0.0.21 (2023-03-22)

### Fixed

- onViewSubmit on excelExportHelper and pdfExportHelper

## 0.0.20 (2023-03-22)

### Fixed

- createExportToolButton onClick

## 0.0.19 (2023-03-22)

### Fixed

- createExportToolButton

## 0.0.18 (2023-03-22)

### Updated

- Update pdfExporHelper, excelExportHelper, IDevsExportRequest
- Merge createPdfToolButton and createExcelToolButton with new name createExportToolButton

## 0.0.17 (2023-03-21)

### Fixed

- ExcelExportHelper.createToolButton => createExcelToolButton
- PdfExportHelper.createToolButton => createPdfToolButton

## 0.0.16 (2023-03-20)

### Fixed

- updateDateQuickFilterProxyValue

## 0.0.15 (2023-03-20)

## Added

- addDateQuickFilterProxy
- updateDateQuickFilterProxyValue

## 0.0.14 (2023-03-18)

### Fixed

- Fixed mistake for GridHelper

## 0.0.13 (2023-03-18)

### Added

- Add idevsEditors.load and idevsFormatters.load to force load scripts

## 0.0.12 (2023-03-14)

### Fixed

- Fixed LookupFormatter

## 0.0.11 (2023-03-13)

### Added

- LookupFormatter to display lookup values

## 0.0.10 (2023-03-10)

### Fixed

- Forgot to export CheckboxButtonEditor

## 0.0.9 (2023-03-10)

### Changes

- Include css into CheckboxButtonEditor directly instead of using external css file

## 0.0.8 (2023-03-09)

### Added

- CheckboxButtonEditor

## 0.0.7 (2023-03-04)

### Changes

Remove idevs.font.css

## 0.0.6 (2023-03-03)

### Changes

All new changes

## 0.0.5 (2023-02-28)

### Changes

- TypeScripts
  - Rename arguments all formatter

## 0.0.4 (2023-02-28)

### Added

- TypeScripts
  - ZeroDisplayFormatter

### Removed

- TypeScripts
  - ZeroToBlankFormatter

## 0.0.2 (2023-02-26)

Update package with usable version.

### Added

- TypeScripts
  - ToolDropdownButton
  - CheckboxFormatter
  - ZeroToBlankFormatter

- Stylesheets
  - idevs.dropdown.css
  - idevs.font.css
  - idevs.print.css

## 0.0.1 (2023-02-25)

Test publish on npm libraries.
