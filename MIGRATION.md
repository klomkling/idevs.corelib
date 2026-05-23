# Migration Guide

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
