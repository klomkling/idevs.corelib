# `@idevs/corelib` 1.1.0 Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `@idevs/corelib` from 1.0.5 to 1.1.0 by adding a real test/CI safety net, fixing code-quality issues surfaced in the codebase review (XSS, unhandled promises, `any` leaks, null-deref risks), and adding additive wire-contract fixes (new field names alongside old, opt-in subpath for prototype patches). Every change is non-breaking under semver — breaking removals are tagged `@deprecated` and deferred to a future 2.0.0.

**Architecture:** Phased TDD migration in four blocks. Phase 1 builds the safety net (Vitest + strict TS slice + GitHub Actions CI + `prepublishOnly` gates). Phase 2 fixes code-quality bugs under that net. Phase 3 adds the wire-contract additions (new fields alongside old, peer-dep alignment, opt-in globals subpath). Phase 4 ships 1.1.0 with CHANGELOG + MIGRATION.

**Tech Stack:** TypeScript 5.9, Vitest, ESLint 9 (flat config), Prettier 3, GitHub Actions, npm.

---

## File Structure

**New files:**
- `vitest.config.ts` — Vitest config (jsdom env for DOM tests, coverage settings)
- `tests/utils/format.test.ts` — unit tests for `src/utils/format.ts`
- `tests/utils/date.test.ts` — unit tests for `src/utils/date.ts`
- `tests/utils/dom.test.ts` — unit tests for `src/utils/dom.ts`
- `tests/types/export.test.ts` — type-level test for wire DTO shape
- `tests/helpers/pdfExportHelper.test.ts` — async + sanitization tests
- `tests/ui/DropdownToolButton.test.ts` — XSS sanitization tests
- `tests/setup.ts` — global jsdom shim (jQuery stub if needed)
- `.github/workflows/ci.yml` — PR build/lint/test
- `MIGRATION.md` — 1.0.x → 1.1.0 deprecation guide; 2.0.0 outlook

**Modified files:**
- `package.json` — add Vitest scripts/deps, peer-deps split, exports map for subpath
- `tsconfig.json` / `src/tsconfig.json` — incremental strictness, `strictNullChecks`
- `eslint.config.js` — promote `no-explicit-any` from `warn` to `error` once cleaned
- `src/index.ts` — add deprecation comment around `import './globals'`
- `src/globals/index.ts` — null-safe DOM helpers, deprecation tag
- `src/types/export.ts` — add `DownloadName` + `PdfExportOptions`/`ExcelExportOptions`; drop `(e: any)`
- `src/ui/DropdownToolButton.ts` — DOM-API construction (no HTML interpolation)
- `src/helpers/pdfExportHelper.ts` — async, dedupe, sanitize filename, DOM-API dialog
- `src/helpers/excelExportHelper.ts` — return Promise, error handling
- `src/editors/checkboxButtonEditor.ts` — replace `any` with typed lookup item
- `src/formatters/formatters.ts` — replace `any` in `LookupFormatter.format`
- `CHANGELOG.md` — 1.1.0 entry

**Deferred to 2.0.0 (not in this plan):**
- Remove side-effect `import './globals'` from `src/index.ts`
- Rename `FileName` → `DownloadName` (drop alias)
- Rename camelCase wire fields (`viewName` → `ViewName`, etc.)
- Drop dual CJS/ESM ambiguity; commit to one

---

## Pre-flight

- [ ] **Step 0.1: Create work branch**

```bash
cd /Users/sarawut/GitHub/Idevs/single-repo/idevs.corelib
git checkout -b feature/1.1.0-foundation
```

- [ ] **Step 0.2: Verify baseline builds**

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

Expected: all succeed on the current `main`. If any fail, **stop** and fix on `main` first.

---

## Phase 1 — Foundation (Tasks 1–7)

### Task 1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1.1: Add Vitest devDependencies**

```bash
npm install --save-dev vitest @vitest/coverage-v8 jsdom @types/node
```

- [ ] **Step 1.2: Add test scripts to `package.json`**

Replace the existing `"test"` line in `scripts` with:

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 1.3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
    },
  },
})
```

- [ ] **Step 1.4: Create `tests/setup.ts`**

```ts
// Minimal jsdom shims. jQuery is provided as a global by Serenity in real apps;
// stub it here so DOM-only helper tests do not need the full jQuery dependency.
import { vi } from 'vitest'

;(globalThis as unknown as { $?: unknown }).$ = vi.fn()
```

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts
git commit -m "test: add Vitest with jsdom environment"
```

---

### Task 2: First sanity test — `truncateString`

**Files:**
- Create: `tests/utils/format.test.ts`

- [ ] **Step 2.1: Write the test**

```ts
// tests/utils/format.test.ts
import { describe, expect, it } from 'vitest'
import { truncateString, toTimeString, stringToNumber } from '../../src/utils/format'

describe('truncateString', () => {
  it('returns the string unchanged when shorter than maxLength', () => {
    expect(truncateString('hello', 10)).toBe('hello')
  })

  it('truncates and appends ellipsis when longer than maxLength', () => {
    expect(truncateString('hello world', 5)).toBe('hell…')
  })

  it('returns ellipsis-only when maxLength is 1', () => {
    expect(truncateString('hello', 1)).toBe('…')
  })
})

describe('toTimeString', () => {
  it('pads single-digit hours and minutes', () => {
    expect(toTimeString(65)).toBe('01:05')
  })

  it('formats zero as 00:00', () => {
    expect(toTimeString(0)).toBe('00:00')
  })
})

describe('stringToNumber', () => {
  it('strips thousands separators', () => {
    expect(stringToNumber('1,234.5')).toBe(1234.5)
  })

  it('returns 0 for empty input', () => {
    expect(stringToNumber('')).toBe(0)
  })
})
```

- [ ] **Step 2.2: Run the test, expect PASS**

```bash
npm test
```

Expected: 6 tests pass. These functions already exist; this proves the harness works.

- [ ] **Step 2.3: Commit**

```bash
git add tests/utils/format.test.ts
git commit -m "test: add unit tests for utils/format"
```

---

### Task 3: Enable `strictNullChecks` (incremental strictness)

**Files:**
- Modify: `src/tsconfig.json`

- [ ] **Step 3.1: Flip the flag**

In `src/tsconfig.json`, change:

```jsonc
"strictNullChecks": false,
```

to:

```jsonc
"strictNullChecks": true,
```

Leave the other strict-family flags (`strict`, `noImplicitAny`, `strictFunctionTypes`, etc.) **off** for this release — they require larger refactors and will be enabled in subsequent minor releases.

- [ ] **Step 3.2: Run typecheck to enumerate errors**

```bash
npm run typecheck 2>&1 | tee /tmp/strict-null-errors.txt
```

Expected: 10–30 errors, concentrated in `src/globals/index.ts`, `src/editors/checkboxButtonEditor.ts`, `src/helpers/pdfExportHelper.ts`, and `src/utils/dom.ts`. Tasks 4 and 5 fix them.

- [ ] **Step 3.3: Commit the config change only (typecheck still failing — intentional)**

```bash
git add src/tsconfig.json
git commit -m "build: enable strictNullChecks (errors fixed in follow-up tasks)"
```

---

### Task 4: Fix null-deref risks in `utils/dom.ts` and `formatters.ts`

**Files:**
- Modify: `src/utils/dom.ts`
- Modify: `src/formatters/formatters.ts`

- [ ] **Step 4.1: Add tests for `getElementWidth` fallback**

Create `tests/utils/dom.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { getElementWidth, getElementHeight } from '../../src/utils/dom'

afterEach(() => {
  document.body.replaceChildren()
})

describe('getElementWidth', () => {
  it('returns the element clientWidth when an element is passed', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 250 })
    expect(getElementWidth(el)).toBe(250)
  })

  it('falls back to window.innerWidth when no element is passed', () => {
    expect(getElementWidth()).toBe(window.innerWidth)
  })
})

describe('getElementHeight', () => {
  it('returns the element clientHeight when an element is passed', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientHeight', { value: 400 })
    expect(getElementHeight(el)).toBe(400)
  })
})
```

- [ ] **Step 4.2: Run tests, expect PASS**

```bash
npm test
```

- [ ] **Step 4.3: Run typecheck on `dom.ts` only**

```bash
npx tsc --noEmit -p src/tsconfig.json 2>&1 | grep 'utils/dom'
```

If any errors mention undefined-vs-undefined, narrow them with explicit guards. The existing code is mostly fine because `clientWidth` returns a `number`.

- [ ] **Step 4.4: Fix `formatters.ts` if typecheck flags it**

Apply any null guards (e.g., `if (!ctx.value) return ''`) that the compiler now demands. Show the diff in the commit.

- [ ] **Step 4.5: Commit**

```bash
git add src/utils/dom.ts src/formatters/formatters.ts tests/utils/dom.test.ts
git commit -m "fix: null-safe DOM/formatter helpers under strictNullChecks"
```

---

### Task 5: Fix null guards in `globals/index.ts` (date proxy helpers)

**Files:**
- Modify: `src/globals/index.ts`
- Create: `tests/globals.test.ts`

- [ ] **Step 5.1: Replace `addDateProxyInput`**

Replace the existing function with this null-safe version (the current version assumes `input` and `input.parentNode` are non-null):

```ts
export function addDateProxyInput(opt: dateProxyInputOption): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${opt.name}"]`)
  if (!input) {
    throw new Error(`addDateProxyInput: input[name="${opt.name}"] not found`)
  }
  const parent = input.parentNode
  if (!parent) {
    throw new Error(`addDateProxyInput: input[name="${opt.name}"] has no parent`)
  }

  const cloneInput = input.cloneNode(true) as HTMLInputElement
  cloneInput.setAttribute('name', `${opt.name}-2`)
  const originalId = input.getAttribute('id')
  if (originalId) {
    cloneInput.setAttribute('id', `${originalId}-2`)
  }
  cloneInput.setAttribute('readonly', 'readonly')
  cloneInput.classList.remove('customValidate')
  cloneInput.classList.remove('s-DateEditor')
  cloneInput.classList.remove('s-Serenity-DateEditor')

  if (opt.readOnly) {
    cloneInput.style.backgroundColor = 'rgba(var(--s-bright-rgb), 0.02)'
  } else {
    cloneInput.style.backgroundColor = 'white'
  }
  if (opt.width) {
    cloneInput.style.width = `${opt.width}px`
  }

  parent.insertBefore(cloneInput, input.nextSibling)
  input.classList.add('d-none')

  return cloneInput
}
```

- [ ] **Step 5.2: Replace `updateDateProxyValue`**

```ts
export function updateDateProxyValue(
  name: string,
  dateValue: string | Date | null,
  locale?: string
): void {
  let target = document.querySelector<HTMLInputElement>(`#${name}-2`)
  if (!target) {
    target = document.querySelector<HTMLInputElement>(`input[name=${name}-2]`)
  }
  if (!target) {
    return
  }

  if (dateValue == null || isEmptyOrNull(dateValue.toString())) {
    target.value = ''
    return
  }

  const effectiveLocale = locale ?? 'en-GB'
  const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue)
  target.value = dateObj.toLocaleString(effectiveLocale, dateStringOption())
}
```

- [ ] **Step 5.3: Re-run typecheck**

```bash
npm run typecheck
```

Expected: zero errors. If anything else surfaces (e.g., in `checkboxButtonEditor.ts`), fix it inline with the same null-guard pattern.

- [ ] **Step 5.4: Add tests for the new error paths**

Create `tests/globals.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { addDateProxyInput, updateDateProxyValue } from '../src/globals'

afterEach(() => {
  document.body.replaceChildren()
})

describe('addDateProxyInput', () => {
  it('throws when the source input is missing', () => {
    expect(() => addDateProxyInput({ name: 'missing' })).toThrow(/not found/)
  })
})

describe('updateDateProxyValue', () => {
  it('is a no-op when no proxy input exists', () => {
    expect(() => updateDateProxyValue('missing', new Date())).not.toThrow()
  })
})
```

- [ ] **Step 5.5: Run tests + typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 5.6: Commit**

```bash
git add src/globals/index.ts tests/globals.test.ts
git commit -m "fix: null-safe date proxy helpers under strictNullChecks"
```

---

### Task 6: Wire `prepublishOnly` to gate the publish

**Files:**
- Modify: `package.json`

- [ ] **Step 6.1: Replace the existing `prepublishOnly`**

In `package.json` scripts, change:

```jsonc
"prepublishOnly": "npm run clean && npm run build"
```

to:

```jsonc
"prepublishOnly": "npm run clean && npm run typecheck && npm run lint && npm test && npm run build"
```

- [ ] **Step 6.2: Verify locally**

```bash
npm run prepublishOnly
```

Expected: typecheck → lint → test → build all succeed.

- [ ] **Step 6.3: Commit**

```bash
git add package.json
git commit -m "build: gate publish behind typecheck, lint, and tests"
```

---

### Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 7.1: Write the workflow (modeled on the .NET sibling repo)**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    types: [opened, reopened, ready_for_review, synchronize]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-test:
    name: Build & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

- [ ] **Step 7.2: Commit and push branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions build/lint/test workflow"
git push -u origin feature/1.1.0-foundation
```

- [ ] **Step 7.3: Open a draft PR to verify CI green**

Run:

```bash
gh pr create --draft --title "1.1.0 foundation (WIP)" \
  --body "Phase 1 of the 1.1.0 update — see docs/superpowers/plans/2026-05-23-corelib-1-1-0-update.md"
```

Expected: CI run completes green within ~3 minutes. If red, fix locally and push again.

---

## Phase 2 — Code Quality (Tasks 8–15)

### Task 8: Sanitize HTML in `DropdownToolButton.addSideButton`

**Files:**
- Modify: `src/ui/DropdownToolButton.ts`
- Create: `tests/ui/DropdownToolButton.test.ts`

- [ ] **Step 8.1: Write the failing XSS test**

```ts
// tests/ui/DropdownToolButton.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { buildSideButtonElement } from '../../src/ui/DropdownToolButton'

afterEach(() => {
  document.body.replaceChildren()
})

describe('buildSideButtonElement', () => {
  it('does not interpret HTML in button.title', () => {
    const el = buildSideButtonElement({
      key: 'k',
      title: '<img src=x onerror="window.__xss=true">',
      icon: 'fa fa-x',
      cssClass: '',
      disabled: false,
      onClick: () => undefined,
    })
    expect(el.getAttribute('title')).toContain('<img')
    expect(el.querySelector('img')).toBeNull()
  })

  it('does not produce inline event handlers from caller-supplied cssClass', () => {
    const el = buildSideButtonElement({
      key: 'k',
      title: '',
      icon: '',
      cssClass: 'foo" onerror="window.__xss=true',
      disabled: false,
      onClick: () => undefined,
    })
    expect(el.outerHTML).not.toContain('onerror=')
  })
})
```

- [ ] **Step 8.2: Run the test, expect FAIL**

```bash
npm test -- DropdownToolButton
```

Expected: import fails or `buildSideButtonElement` is undefined.

- [ ] **Step 8.3: Extract a pure builder and use DOM API**

In `src/ui/DropdownToolButton.ts`, **add** (do not remove the existing class) the following exported helper near the top of the file, then refactor `addSideButton` to call it. The full replacement of the template-string block is:

```ts
// Exported for unit testing — avoids HTML interpolation of caller-supplied strings.
export function buildSideButtonElement(button: {
  key?: string
  title?: string
  icon?: string
  cssClass?: string
  disabled?: boolean
}): HTMLDivElement {
  const el = document.createElement('div')
  const classes = ['tool-button', 'add-button', 'icon-tool-button']
  if (button.cssClass) classes.push(button.cssClass)
  if (button.disabled) classes.push('disabled')
  el.className = classes.join(' ')
  el.setAttribute('data-idevs-key', button.key ?? '')
  if (button.title) el.title = button.title // safe: title is a property, not parsed as HTML

  const outer = document.createElement('div')
  outer.className = 'button-outer'
  const inner = document.createElement('span')
  inner.className = 'button-inner'
  const icon = document.createElement('i')
  if (button.icon) icon.className = button.icon
  inner.appendChild(icon)
  outer.appendChild(inner)
  el.appendChild(outer)

  return el
}
```

Then replace the existing `const sideButtonTemplate = ...; const sideButton = $(sideButtonTemplate)` lines inside `addSideButton` with:

```ts
const sideButton = $(buildSideButtonElement(button))
```

- [ ] **Step 8.4: Run the tests, expect PASS**

```bash
npm test -- DropdownToolButton
```

- [ ] **Step 8.5: Commit**

```bash
git add src/ui/DropdownToolButton.ts tests/ui/DropdownToolButton.test.ts
git commit -m "fix: build DropdownToolButton side button via DOM API (prevents XSS)"
```

---

### Task 9: Sanitize PDF preview dialog (`showFluentPdfPreview`)

**Files:**
- Modify: `src/helpers/pdfExportHelper.ts`
- Create: `tests/helpers/pdfExportHelper.test.ts`

- [ ] **Step 9.1: Add an XSS test for the dialog title**

```ts
// tests/helpers/pdfExportHelper.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { __buildPreviewDialog } from '../../src/helpers/pdfExportHelper'

afterEach(() => {
  document.body.replaceChildren()
})

describe('__buildPreviewDialog', () => {
  it('uses textContent for the dialog title (no HTML injection)', () => {
    const { titleEl } = __buildPreviewDialog('blob:fake', '<img src=x onerror=1>', false)
    expect(titleEl.querySelector('img')).toBeNull()
    expect(titleEl.textContent).toBe('<img src=x onerror=1>')
  })

  it('uses a default title when dialogTitle is undefined', () => {
    const { titleEl } = __buildPreviewDialog('blob:fake', undefined, false)
    expect(titleEl.textContent).toBe('PDF Preview')
  })
})
```

- [ ] **Step 9.2: Run, expect FAIL**

```bash
npm test -- pdfExportHelper
```

- [ ] **Step 9.3: Refactor `showFluentPdfPreview` to use DOM APIs**

In `src/helpers/pdfExportHelper.ts`, extract the title/header/content construction into a `__buildPreviewDialog` helper exported for tests, using `textContent` for any caller-supplied string:

```ts
export function __buildPreviewDialog(
  objectUrl: string,
  dialogTitle: string | undefined,
  autoPrint: boolean
): { container: HTMLDivElement; titleEl: HTMLDivElement; iframe: HTMLIFrameElement } {
  const container = document.createElement('div')
  container.className = 'ms-Dialog-overlay'
  // keep the existing cssText assignment for layout

  const titleEl = document.createElement('div')
  titleEl.className = 'ms-Dialog-title'
  titleEl.textContent = dialogTitle ?? 'PDF Preview' // safe: textContent escapes

  const iframe = document.createElement('iframe')
  iframe.src = objectUrl
  if (autoPrint) {
    let printTriggered = false
    iframe.onload = () => {
      if (printTriggered) return
      printTriggered = true
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch (e) {
          console.warn('Error triggering print:', e)
        }
      }, 1000)
    }
  }

  return { container, titleEl, iframe }
}
```

Then refactor `showFluentPdfPreview` to call this helper and assemble the rest of the dialog (close button, listeners) on top of the returned elements.

- [ ] **Step 9.4: Run tests, expect PASS**

```bash
npm test -- pdfExportHelper
```

- [ ] **Step 9.5: Commit**

```bash
git add src/helpers/pdfExportHelper.ts tests/helpers/pdfExportHelper.test.ts
git commit -m "fix: build PDF preview dialog via DOM API (prevents XSS in dialogTitle)"
```

---

### Task 10: Sanitize the PDF download filename

**Files:**
- Modify: `src/helpers/pdfExportHelper.ts`

- [ ] **Step 10.1: Add a test**

Append to `tests/helpers/pdfExportHelper.test.ts`:

```ts
import { __sanitizeDownloadName } from '../../src/helpers/pdfExportHelper'

describe('__sanitizeDownloadName', () => {
  it('strips path separators and control chars', () => {
    expect(__sanitizeDownloadName('a/b\\c.pdf')).toBe('a_b_c_.pdf')
  })

  it('preserves safe characters', () => {
    expect(__sanitizeDownloadName('Order Report 2026-05.pdf')).toBe('Order Report 2026-05.pdf')
  })

  it('returns a fallback when input is empty', () => {
    expect(__sanitizeDownloadName('')).toBe('report')
  })
})
```

- [ ] **Step 10.2: Run, expect FAIL**

- [ ] **Step 10.3: Add the helper and use it in `doExportPdf`**

In `src/helpers/pdfExportHelper.ts`:

```ts
export function __sanitizeDownloadName(name: string): string {
  if (!name) return 'report'
  return name.replace(/[^\w.\- ]/g, '_')
}
```

Update the download branch:

```ts
const safeName = __sanitizeDownloadName(options.reportName ?? '')
link.download = `${safeName}.pdf`
```

- [ ] **Step 10.4: Run tests, expect PASS**

- [ ] **Step 10.5: Commit**

```bash
git add src/helpers/pdfExportHelper.ts tests/helpers/pdfExportHelper.test.ts
git commit -m "fix: sanitize PDF download filename"
```

---

### Task 11: Dedupe blob/objectURL creation in `doExportPdf`

**Files:**
- Modify: `src/helpers/pdfExportHelper.ts`

- [ ] **Step 11.1: Review the current branch and rewrite**

The current download branch shadows `blob` and `url`. Replace the `if (render) { ... } else { ... }` block with one that reuses the outer `objectUrl`:

```ts
const objectUrl = URL.createObjectURL(blob)

if (options.render) {
  showFluentPdfPreview(objectUrl, options.dialogTitle, options.openPrintDialog ?? false)
  // showFluentPdfPreview is responsible for revoking objectUrl on close.
  return
}

// Download path
const link = document.createElement('a')
link.href = objectUrl
link.download = `${__sanitizeDownloadName(options.reportName ?? '')}.pdf`
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
```

- [ ] **Step 11.2: Run all tests + typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 11.3: Commit**

```bash
git add src/helpers/pdfExportHelper.ts
git commit -m "refactor: dedupe blob/URL creation in doExportPdf"
```

---

### Task 12: Make `doExportPdf` async + surface errors

**Files:**
- Modify: `src/helpers/pdfExportHelper.ts`
- Modify: `src/helpers/excelExportHelper.ts`

- [ ] **Step 12.1: Add a test that the returned promise rejects on server failure**

Append to `tests/helpers/pdfExportHelper.test.ts`:

```ts
import { vi } from 'vitest'
import { doExportPdf } from '../../src/helpers/pdfExportHelper'

vi.mock('@serenity-is/corelib', async () => {
  const actual = await vi.importActual<typeof import('@serenity-is/corelib')>(
    '@serenity-is/corelib'
  )
  return {
    ...actual,
    deepClone: (x: unknown) => JSON.parse(JSON.stringify(x)),
    serviceCall: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
  }
})

describe('doExportPdf', () => {
  it('rejects when the server call fails', async () => {
    await expect(
      doExportPdf({
        service: '/svc/foo',
        reportName: 'r',
      } as never)
    ).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 12.2: Change the signature to `async`**

In `src/helpers/pdfExportHelper.ts`, change the function declaration from:

```ts
export function doExportPdf(options: IdevsExportOptions): void {
```

to:

```ts
export async function doExportPdf(options: IdevsExportOptions): Promise<void> {
```

…and replace the `.then((response) => { ... })` call with `await`. The full body of the function becomes:

```ts
const response = await serviceCall({
  service: options.service,
  request: request,
}) as IdevsContentResponse

const pdfContent = response.Content
const blob = base64ToBlob(pdfContent, response.ContentType)
const objectUrl = URL.createObjectURL(blob)

if (options.render) {
  showFluentPdfPreview(objectUrl, options.dialogTitle, options.openPrintDialog ?? false)
  // showFluentPdfPreview is responsible for revoking objectUrl on close.
  return
}

const link = document.createElement('a')
link.href = objectUrl
link.download = `${__sanitizeDownloadName(options.reportName ?? '')}.pdf`
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
```

(`base64ToBlob` and `__sanitizeDownloadName` are existing helpers in this file.)

- [ ] **Step 12.3: Do the same for `doExportExcel`**

```ts
export async function doExportExcel(options: IdevsExportOptions): Promise<void> {
  // current body unchanged except wrap in try/catch if you want; postToService is sync redirect
}
```

(Excel uses `postToService` which is a synchronous form-post — there is no promise to await, but the signature change keeps the two helpers symmetric and future-proof.)

- [ ] **Step 12.4: Run tests, expect PASS**

```bash
npm test
```

- [ ] **Step 12.5: Commit**

```bash
git add src/helpers/pdfExportHelper.ts src/helpers/excelExportHelper.ts tests/helpers/pdfExportHelper.test.ts
git commit -m "feat: doExportPdf/doExportExcel return Promise; surface server errors"
```

> **Backwards compatibility:** existing callers that do `doExportPdf(opts)` without awaiting still work — they just leak an unhandled promise. Document this in MIGRATION.md (Task 22).

---

### Task 13: Replace `any` in `types/export.ts`

**Files:**
- Modify: `src/types/export.ts`

- [ ] **Step 13.1: Replace `(e: any)` with `(e: Event)`**

In `src/types/export.ts`:

```ts
// before
onClick?: (e: any) => void
// after
onClick?: (e: Event) => void
```

…and remove the surrounding `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment.

- [ ] **Step 13.2: Typecheck and fix any callers that broke**

```bash
npm run typecheck
```

If `createExportToolButton` or other code passes a more specific type (e.g., `JQuery.ClickEvent`), narrow at the call site or widen the type to `Event | JQuery.Event`.

- [ ] **Step 13.3: Commit**

```bash
git add src/types/export.ts
git commit -m "refactor: type onClick as Event in IdevsExportOptions"
```

---

### Task 14: Replace `any` in `checkboxButtonEditor.ts`

**Files:**
- Modify: `src/editors/checkboxButtonEditor.ts`

- [ ] **Step 14.1: Define a proper LookupItem type**

At the top of `src/editors/checkboxButtonEditor.ts`, replace:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
```

…and the `Array<{ [key: string]: any }>` usages, with a typed alias:

```ts
type LookupItem = Record<string, unknown>
```

Then update all occurrences in the file:
- Field type: `private _items: LookupItem[]`
- Method param/return: `LookupItem[]` in `get_items`, `set_items`, `items` accessors
- Cast site: `this.set_items(lookup.items as LookupItem[])`
- `enumType?: unknown` (in `CheckboxButtonEditorOptions`)

- [ ] **Step 14.2: Typecheck**

```bash
npm run typecheck
```

If access patterns like `item.id` or `item.text` now error, add narrow casts at the read site:

```ts
const id = item[this._idField] as string | number | undefined
```

- [ ] **Step 14.3: Lint**

```bash
npm run lint
```

The file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` can stay for now (other `any` may remain) but verify the count of suppressions decreased.

- [ ] **Step 14.4: Commit**

```bash
git add src/editors/checkboxButtonEditor.ts
git commit -m "refactor: replace any with LookupItem in CheckboxButtonEditor"
```

---

### Task 15: Replace `any` in `formatters.ts::LookupFormatter.format`

**Files:**
- Modify: `src/formatters/formatters.ts`

- [ ] **Step 15.1: Narrow `src` to `unknown` and narrow inside**

```ts
// before
static format(src: any, lookupKey?: string): string {
// after
static format(src: unknown, lookupKey?: string): string {
  if (src == null) return ''
  const key = String(src)
  // rest of body uses `key` instead of `src`
}
```

And replace `const items = lookup.items as Array<{ [key: string]: any }>` with:

```ts
const items = lookup.items as Array<Record<string, unknown>>
```

- [ ] **Step 15.2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 15.3: Commit**

```bash
git add src/formatters/formatters.ts
git commit -m "refactor: narrow LookupFormatter.format src parameter to unknown"
```

---

## Phase 3 — Wire-Contract Additive (Tasks 16–20)

### Task 16: Add `DownloadName` alongside `FileName`

**Files:**
- Modify: `src/types/export.ts`
- Create: `tests/types/export.test.ts`

- [ ] **Step 16.1: Add the new field, deprecate the old**

In `src/types/export.ts`, change:

```ts
export type IdevsContentResponse = ServiceResponse & {
  Content: string
  ContentType: string
  FileName?: string
}
```

to:

```ts
export type IdevsContentResponse = ServiceResponse & {
  Content: string
  ContentType: string
  /**
   * Filename the server suggests for the download. Matches the .NET DTO
   * `Idevs.Models.IdevsContentResponse.DownloadName`.
   * @since 1.1.0
   */
  DownloadName?: string
  /**
   * @deprecated since 1.1.0 — the server emits `DownloadName`, not `FileName`.
   * This field has always been `undefined` at runtime. Use `DownloadName`.
   * Will be removed in 2.0.0.
   */
  FileName?: string
}
```

- [ ] **Step 16.2: Add a type-level test**

Create `tests/types/export.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { IdevsContentResponse } from '../../src/types/export'

describe('IdevsContentResponse', () => {
  it('exposes DownloadName and (deprecated) FileName', () => {
    const res: IdevsContentResponse = { Content: '', ContentType: '' }
    expectTypeOf(res.DownloadName).toEqualTypeOf<string | undefined>()
    expectTypeOf(res.FileName).toEqualTypeOf<string | undefined>()
  })
})
```

- [ ] **Step 16.3: Run tests, expect PASS**

- [ ] **Step 16.4: Commit**

```bash
git add src/types/export.ts tests/types/export.test.ts
git commit -m "feat: add IdevsContentResponse.DownloadName (matches .NET DTO); deprecate FileName"
```

---

### Task 17: Add subpath export for `@idevs/corelib/globals`

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`

- [ ] **Step 17.1: Update `package.json` `exports`**

```jsonc
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.js"
  },
  "./globals": {
    "types": "./dist/globals/index.d.ts",
    "import": "./dist/globals/index.js",
    "require": "./dist/globals/index.js"
  },
  "./package.json": "./package.json"
}
```

- [ ] **Step 17.2: Add a deprecation banner to the root `src/index.ts`**

Replace the bottom of the file:

```ts
// Global prototype extensions (import side-effects only)
import './globals'
```

with:

```ts
/**
 * @deprecated since 1.1.0 — prototype extensions auto-load via the root entry
 * point for backwards compatibility, but this will be removed in 2.0.0.
 *
 * To prepare your code for 2.0.0:
 *
 *   // Replace existing usage with explicit imports of the utility functions:
 *   import { toSqlDateString } from '@idevs/corelib'   // instead of date.toSqlDate()
 *
 *   // Or, if you still want the prototype patches, opt in explicitly:
 *   import '@idevs/corelib/globals'
 */
import './globals'
```

- [ ] **Step 17.3: Build and dry-pack to verify the subpath is shipped**

```bash
npm run build
npm pack --dry-run | grep 'dist/globals'
```

Expected: `dist/globals/index.js` and `dist/globals/index.d.ts` are listed.

- [ ] **Step 17.4: Commit**

```bash
git add package.json src/index.ts
git commit -m "feat: add @idevs/corelib/globals subpath (opt-in prototype patches)"
```

---

### Task 18: Move `@serenity-is/*` to `peerDependencies`

**Files:**
- Modify: `package.json`

- [ ] **Step 18.1: Edit `package.json`**

Move:

```jsonc
"dependencies": {
  "@serenity-is/corelib": "^8.8.6",
  "@serenity-is/sleekgrid": "^1.9.6"
}
```

to:

```jsonc
"peerDependencies": {
  "@serenity-is/corelib": ">=8.8.6 <9",
  "@serenity-is/sleekgrid": ">=1.9.6 <2"
},
"peerDependenciesMeta": {
  "@serenity-is/corelib": { "optional": false },
  "@serenity-is/sleekgrid": { "optional": false }
},
"devDependencies": {
  ...
  "@serenity-is/corelib": "^8.8.6",
  "@serenity-is/sleekgrid": "^1.9.6"
}
```

(Keep them in `devDependencies` so local `npm ci` still resolves them for typecheck/build.)

- [ ] **Step 18.2: Reinstall and verify**

```bash
rm -rf node_modules
npm ci
npm run typecheck
npm run build
```

- [ ] **Step 18.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: move Serenity packages to peerDependencies"
```

---

### Task 19: Document jQuery / jspdf / pdfmake / toastr runtime requirements

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 19.1: Add optional peer entries**

```jsonc
"peerDependencies": {
  "@serenity-is/corelib": ">=8.8.6 <9",
  "@serenity-is/sleekgrid": ">=1.9.6 <2",
  "jquery": ">=3.5",
  "jspdf": ">=3"
},
"peerDependenciesMeta": {
  "jquery": { "optional": true },
  "jspdf": { "optional": true }
}
```

(These are optional because not every consumer uses the PDF/Excel export paths.)

- [ ] **Step 19.2: Add a "Runtime dependencies" section to `README.md`**

Insert after the "Installation" section:

```markdown
## Runtime dependencies

`@idevs/corelib` ships against the following peers, declared in your app's
`package.json`:

| Package | Range | Required |
|---|---|---|
| `@serenity-is/corelib` | `>=8.8.6 <9` | yes |
| `@serenity-is/sleekgrid` | `>=1.9.6 <2` | yes |
| `jquery` | `>=3.5` | optional (used by UI helpers) |
| `jspdf` | `>=3` | optional (used by PDF helpers) |

### Compatibility matrix

`@idevs/corelib` tracks the same Serenity major as its server-side
companion [Idevs.Net.CoreLib](https://www.nuget.org/packages/Idevs.Net.CoreLib).
Serenity 9.x is intentionally skipped — pick the lane that matches your
target framework:

| Lane | `Idevs.Net.CoreLib` | .NET TFM | `Serenity.Net.Services` | `@serenity-is/corelib` | `@idevs/corelib` |
|---|---|---|---|---|---|
| **Current** | 0.7.x | `net8.0` | `8.8.9` | `>=8.8.6 <9` | **1.x** |
| **Future** | 0.8+ (planned) | `net10.0` | `10.x` | `>=10.0.0 <11` | **2.x** (planned) |

The TS DTOs in `@idevs/corelib/types/export` mirror the .NET `Idevs.Models.*`
DTOs; see [MIGRATION.md](./MIGRATION.md) for naming changes between versions.

### Install bridge

You normally do **not** run `npm install @idevs/corelib` yourself. The
`Idevs.Net.CoreLib` NuGet package ships an MSBuild `.targets` file that runs
the npm install for you on first `dotnet build`, pinned to the npm major
matching your `Idevs.Net.CoreLib` version (see the matrix above). It also
copies CSS assets from `node_modules/@idevs/corelib/css/` into
`wwwroot/lib/Idevs/Content/`.

To opt out (e.g., air-gapped CI), set in your `.csproj`:

```xml
<PropertyGroup>
  <IdevsCoreLibInstallNpmPackage>false</IdevsCoreLibInstallNpmPackage>
</PropertyGroup>
```

…and provision `@idevs/corelib` manually.
```

- [ ] **Step 19.3: Commit**

```bash
git add package.json README.md
git commit -m "docs: declare jQuery/jspdf as optional peers; document runtime deps"
```

---

### Task 20: Split `IdevsExportOptions` into PDF/Excel variants (additive)

**Files:**
- Modify: `src/types/export.ts`

- [ ] **Step 20.1: Add typed variants alongside the existing union**

In `src/types/export.ts`, append:

```ts
/**
 * Options specific to `doExportPdf`. The `render`, `openPrintDialog`,
 * and `dialogTitle` fields only have effect on the PDF path.
 * @since 1.1.0
 */
export type PdfExportOptions = IdevsExportOptions & {
  render?: boolean
  openPrintDialog?: boolean
  dialogTitle?: string
}

/**
 * Options specific to `doExportExcel`. The Excel path uses `postToService`
 * (form-post redirect), so the PDF render/print flags are ignored.
 * @since 1.1.0
 */
export type ExcelExportOptions = IdevsExportOptions
```

Then in `src/helpers/pdfExportHelper.ts`:

```ts
// before
export async function doExportPdf(options: IdevsExportOptions): Promise<void> {
// after
export async function doExportPdf(options: PdfExportOptions): Promise<void> {
```

…and import `PdfExportOptions` from `../types/export`. Same for `ExcelExportOptions` in the Excel helper. The existing `IdevsExportOptions` type still works for callers (subtype assignment).

- [ ] **Step 20.2: Typecheck and run all tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 20.3: Commit**

```bash
git add src/types/export.ts src/helpers/pdfExportHelper.ts src/helpers/excelExportHelper.ts
git commit -m "feat: add PdfExportOptions/ExcelExportOptions variants"
```

---

## Phase 4 — Release 1.1.0 (Tasks 21–24)

### Task 21: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 21.1: Insert the 1.1.0 entry at the top of the changelog body**

After the `# Changelog` header, before the existing `## [1.0.5]` entry:

```markdown
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
- **XSS** in `DropdownToolButton.addSideButton` — replaced HTML template interpolation with DOM-API construction.
- **XSS** in `pdfExportHelper.showFluentPdfPreview` — dialog title now uses `textContent` instead of an HTML template.
- **Filename injection** in `doExportPdf` download — `options.reportName` is sanitized before use as `<a download>`.
- **Unhandled promise rejection** in `doExportPdf` — `serviceCall(...)` rejections are now propagated to the caller.
- **Null-deref risk** in `addDateProxyInput` and `updateDateProxyValue` when DOM queries return `null`.
- **Duplicate Blob/objectURL** creation in `doExportPdf` download branch.
- Replaced `any` with typed signatures in `IdevsExportOptions.onClick`, `LookupFormatter.format`, and `CheckboxButtonEditor` lookup items.

### Deprecated
- `IdevsContentResponse.FileName` — use `DownloadName` (matches the server DTO). Removal in 2.0.0.
- Implicit `import './globals'` in the root entry — opt in via `import '@idevs/corelib/globals'` instead. Removal in 2.0.0.

### Compatibility
- **No breaking changes.** Consumers on `^1.0.5` upgrade by running `npm update @idevs/corelib`.
- A future 2.0.0 will remove the deprecated paths and align wire DTO casing with the .NET DTO (`viewName` → `ViewName`, etc.). See `MIGRATION.md`.

---
```

- [ ] **Step 21.2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add 1.1.0 changelog entry"
```

---

### Task 22: Write `MIGRATION.md`

**Files:**
- Create: `MIGRATION.md`

- [ ] **Step 22.1: Write the migration guide**

```markdown
# Migration Guide

## 1.0.x → 1.1.0

**No breaking changes.** This release is a foundation update — strict TS slice
enabled, Vitest harness, GitHub Actions CI, XSS fixes, async export helpers,
and additive wire-contract fixes. Consumers on `^1.0.5` upgrade with
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

#### 4. Declare Serenity as a peer

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

| | 1.x lane (this branch) | 2.x lane (future) |
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
```

- [ ] **Step 22.2: Commit**

```bash
git add MIGRATION.md
git commit -m "docs: add MIGRATION.md with 1.1.0 guidance and 2.0.0 outlook"
```

---

### Task 23: Bump version to 1.1.0

**Files:**
- Modify: `package.json`

- [ ] **Step 23.1: Bump version**

```bash
npm version 1.1.0 --no-git-tag-version
```

This updates `package.json` (and `package-lock.json`) to `"version": "1.1.0"`.

- [ ] **Step 23.2: Verify the prepublish pipeline**

```bash
npm run prepublishOnly
```

Expected: clean → typecheck → lint → test → build all green.

- [ ] **Step 23.3: Dry-pack and inspect the tarball contents**

```bash
npm pack --dry-run
```

Expected: includes `dist/index.js`, `dist/index.d.ts`, `dist/globals/index.js`, `dist/globals/index.d.ts`, `README.md`, `LICENSE`, `CHANGELOG.md`. **Should not** include `tests/`, `docs/`, `src/`.

- [ ] **Step 23.4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: release 1.1.0"
```

---

### Task 24: Tag, push, and publish

**Files:** none

- [ ] **Step 24.1: Tag the release**

```bash
git tag -a v1.1.0 -m "Release 1.1.0"
```

- [ ] **Step 24.2: Push branch and tag, then merge via the PR**

```bash
git push origin feature/1.1.0-foundation
git push origin v1.1.0
```

Convert the draft PR (opened in Task 7.3) to "ready for review". After CI green and review approval, merge to `main`.

- [ ] **Step 24.3: Publish to npm**

After merge:

```bash
git checkout main
git pull
npm publish
```

(`prepublishOnly` re-runs the full pipeline. Authentication via `npm login` or `NPM_TOKEN` must be set in advance.)

- [ ] **Step 24.4: Create a GitHub Release**

```bash
gh release create v1.1.0 --title "v1.1.0" --notes-from-tag
```

- [ ] **Step 24.5: Verify the published package**

```bash
npm view @idevs/corelib version
# expected: 1.1.0

npm view @idevs/corelib exports
# expected: { ".": {...}, "./globals": {...}, "./package.json": "./package.json" }
```

---

## Done When

- [ ] CI is green on `main` after merge.
- [ ] `npm view @idevs/corelib version` returns `1.1.0`.
- [ ] A fresh consumer project can `npm install @idevs/corelib@1.1.0` and use both `import { toSqlDateString } from '@idevs/corelib'` (utility) and `import '@idevs/corelib/globals'` (opt-in prototype patches).
- [ ] CHANGELOG.md and MIGRATION.md are visible on the npm page and the GitHub Release.
- [ ] No code path in the new release uses an HTML template string with caller-supplied interpolation.
- [ ] No `as any` exists in `src/`. (`/* eslint-disable @typescript-eslint/no-explicit-any */` may remain on `checkboxButtonEditor.ts` — track its removal as a 1.2.0 task.)
- [ ] **Enum parity audit (manual check, document in MIGRATION.md if mismatched):** Open the .NET DTO at `Idevs.Net.CoreLib/src/Idevs.Net.CoreLib/Models/IdevsExportRequest.cs` and compare `PageSizes`, `PageOrientations`, and `TableTheme` ordinals against `src/types/export.ts`. The TS side currently declares `PageSizes { A4 = 0, A3 = 1 }` and `PageOrientations { Portrait = 0, Landscape = 1 }`. If the .NET enum has additional members or different ordinals, the wire is silently corrupt for those values — add a "Known mismatch" subsection to MIGRATION.md and open a tracking issue for the cross-repo fix.

---

## Out of Scope (Future Releases)

- **1.2.0** — Enable `noImplicitAny`; finish removing `any` from `checkboxButtonEditor.ts`. Drop ESLint file-level disables. Add tests for `gridHelper`, `dialogHelper`, `editors/*`.
- **1.3.0** — Move PDF dialog inline CSS into the `css/` folder; reuse classes instead of `cssText` blobs.
- **1.4.0** — Generate TS wire DTOs from the .NET project (e.g., extend Serenity transformer, or run `Microsoft.TypeScript.MSBuild` over the .NET assembly) so the TS↔.NET contract is single-sourced.
- **2.0.0** — Remove every `@deprecated` path from 1.x. Rename wire fields to PascalCase. Decide ESM-only or dual-build. Consider net10/Serenity 10 alignment.
- **Cross-repo** — Two pending items in `Idevs.Net.CoreLib`:
  1. **Pin `@idevs/corelib` npm range in `Idevs.Net.CoreLib.targets`** (ship as `0.7.10`, patch bump). The current `npm install @idevs/corelib` resolves to whatever is tagged `latest`, which becomes a flag-day risk when `@idevs/corelib 2.x` ships for the Serenity-10 lane. Detailed guideline: `docs/cross-repo/2026-05-23-net-corelib-targets-pin-guideline.md`. **Do this before publishing `@idevs/corelib` 2.0.**
  2. Add `ExportColumns` to `IIdevsExportRequest` so the wire DTO declares the field the TS client already sends. Coordinate with `Idevs.Net.CoreLib` 0.8.0.
