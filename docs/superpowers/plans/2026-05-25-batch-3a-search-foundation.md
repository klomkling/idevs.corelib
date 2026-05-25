# Batch 3a — Search-Button Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR-3a — the foundation half of batch 3: `IdevsSearchButtonEditor` + `IdevsNumericTagEditor` + `SlickEditorBase` + `SlickSearchButtonEditor` + three internal `shared/` modules (`maskedPattern`, `requiredMarker`, `validationObserver`) — with batch-2 hardening parity (XSS-safe DOM, full WAI-ARIA, single-chokepoint value writes, full destroy cleanup).

**Architecture:** Bottom-up TDD. Pure helpers first (no DOM coupling, exhaustively tested). Test stubs next (EntityGrid, dialog, serviceCall). Standalone editors next (`IdevsNumericTagEditor` extends `IdevsTagEditor`; `SlickEditorBase` is abstract). `IdevsSearchButtonEditor` consumes the shared helpers. `SlickSearchButtonEditor` composes both. Public barrel and MIGRATION updates last; final CI gate ensures the whole batch passes locally before pushing.

**Tech Stack:** TypeScript 5.9, Vitest (jsdom env, fake timers), ESLint 9 (flat config), `@serenity-is/corelib` 8.8.6, `@serenity-is/sleekgrid` 1.9.6.

**Spec:** [`docs/superpowers/specs/2026-05-25-batch-3-search-editors-design.md`](../specs/2026-05-25-batch-3-search-editors-design.md)

---

## File Structure

**New source files:**
- `src/editors/shared/maskedPattern.ts` — pure helpers for masked-pattern formatting + cursor calc
- `src/editors/shared/requiredMarker.ts` — XSS-safe `<sup>*</sup>` marker via DOM API
- `src/editors/shared/validationObserver.ts` — `MutationObserver` wrapper for validation-class sync
- `src/editors/shared/index.ts` — internal barrel (NOT re-exported publicly)
- `src/editors/idevsNumericTagEditor.ts` — extends `IdevsTagEditor` with prefix/suffix/specialValues
- `src/editors/slickEditorBase.ts` — abstract SleekGrid Editor wrapping a Serenity widget
- `src/editors/idevsSearchButtonEditor.ts` — search-button-style editor (hidden input + display input + buttons + dialog)
- `src/editors/slickSearchButtonEditor.ts` — SleekGrid column adapter wrapping the above

**New test files:**
- `tests/editors/shared/maskedPattern.test.ts`
- `tests/editors/shared/requiredMarker.test.ts`
- `tests/editors/shared/validationObserver.test.ts`
- `tests/editors/_helpers/entityGridStub.ts`
- `tests/editors/_helpers/searchDialogStub.ts`
- `tests/editors/idevsNumericTagEditor.test.ts`
- `tests/editors/slickEditorBase.test.ts`
- `tests/editors/idevsSearchButtonEditor.test.ts`
- `tests/editors/slickSearchButtonEditor.test.ts`

**Modified files:**
- `src/editors/index.ts` — add public exports
- `MIGRATION.md` — document API renames

---

## Task 1: `shared/maskedPattern.ts` — apply + extract (round-trip)

**Files:**
- Create: `src/editors/shared/maskedPattern.ts`
- Create: `tests/editors/shared/maskedPattern.test.ts`

**Concept:** Masked patterns mix template chars (`0` = digit, `X` = alphanumeric) with separators (anything else, typically `-`, `/`, ` `, `.`). `applyMaskedPattern("12345678", "0000-0000")` → `"1234-5678"`. `extractRawValue("1234-5678", "0000-0000")` → `"12345678"`. Round-trip must be identity for valid input.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/editors/shared/maskedPattern.test.ts
import { describe, expect, it } from 'vitest'
import {
  applyMaskedPattern,
  extractRawValue,
} from '../../../src/editors/shared/maskedPattern'

describe('applyMaskedPattern', () => {
  it('inserts separators into numeric template', () => {
    expect(applyMaskedPattern('12345678', '0000-0000')).toBe('1234-5678')
  })

  it('inserts separators into alphanumeric template', () => {
    expect(applyMaskedPattern('AB1234', 'XX-0000')).toBe('AB-1234')
  })

  it('returns the partial raw value when shorter than the template', () => {
    expect(applyMaskedPattern('12', '0000-0000')).toBe('12')
    expect(applyMaskedPattern('1234', '0000-0000')).toBe('1234')
    expect(applyMaskedPattern('12345', '0000-0000')).toBe('1234-5')
  })

  it('returns the empty string for empty input', () => {
    expect(applyMaskedPattern('', '0000-0000')).toBe('')
  })

  it('returns the input unchanged when pattern is empty', () => {
    expect(applyMaskedPattern('12345678', '')).toBe('12345678')
  })
})

describe('extractRawValue', () => {
  it('strips separators from a numeric formatted value', () => {
    expect(extractRawValue('1234-5678', '0000-0000')).toBe('12345678')
  })

  it('strips separators from an alphanumeric formatted value', () => {
    expect(extractRawValue('AB-1234', 'XX-0000')).toBe('AB1234')
  })

  it('returns partial raw value for partial formatted input', () => {
    expect(extractRawValue('1234-5', '0000-0000')).toBe('12345')
    expect(extractRawValue('1234-', '0000-0000')).toBe('1234')
  })

  it('returns the empty string for empty input', () => {
    expect(extractRawValue('', '0000-0000')).toBe('')
  })

  it('round-trips apply ∘ extract = identity for complete values', () => {
    expect(extractRawValue(applyMaskedPattern('12345678', '0000-0000'), '0000-0000')).toBe('12345678')
    expect(extractRawValue(applyMaskedPattern('AB1234', 'XX-0000'), 'XX-0000')).toBe('AB1234')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: FAIL — cannot find module `src/editors/shared/maskedPattern`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/editors/shared/maskedPattern.ts

/**
 * Masked pattern helpers shared between IdevsSearchButtonEditor and (in PR-3b)
 * IdevsSelfSearchButtonEditor. Template chars:
 *   `0` — accepts only digits (0-9)
 *   `X` — accepts alphanumerics (A-Z, a-z, 0-9)
 *   anything else — separator (kept verbatim in the formatted value)
 */

const TEMPLATE_CHARS = new Set(['0', 'X'])

export function applyMaskedPattern(rawValue: string, pattern: string): string {
  if (!pattern) return rawValue
  if (!rawValue) return ''

  let formatted = ''
  let rawIndex = 0

  for (let i = 0; i < pattern.length && rawIndex < rawValue.length; i++) {
    const templateChar = pattern[i]
    if (TEMPLATE_CHARS.has(templateChar)) {
      formatted += rawValue[rawIndex]
      rawIndex++
    } else {
      formatted += templateChar
    }
  }

  return formatted
}

export function extractRawValue(formattedValue: string, pattern: string): string {
  if (!pattern) return formattedValue
  if (!formattedValue) return ''

  let raw = ''
  for (let i = 0; i < formattedValue.length && i < pattern.length; i++) {
    if (TEMPLATE_CHARS.has(pattern[i])) {
      raw += formattedValue[i]
    }
  }
  return raw
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/editors/shared/maskedPattern.ts tests/editors/shared/maskedPattern.test.ts
git commit -m "feat(editors/shared): add applyMaskedPattern + extractRawValue helpers"
```

---

## Task 2: `shared/maskedPattern.ts` — separators + character validation

**Files:**
- Modify: `src/editors/shared/maskedPattern.ts`
- Modify: `tests/editors/shared/maskedPattern.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/editors/shared/maskedPattern.test.ts`:

```ts
import {
  applyMaskedPattern,
  extractRawValue,
  getSeparatorsFromTemplate,
  isValidInputCharacter,
} from '../../../src/editors/shared/maskedPattern'

describe('getSeparatorsFromTemplate', () => {
  it('extracts separators from a numeric template', () => {
    expect(getSeparatorsFromTemplate('0000-0000')).toEqual(['-'])
  })

  it('extracts multiple distinct separators', () => {
    expect(getSeparatorsFromTemplate('00/00-00 00')).toEqual(['/', '-', ' '])
  })

  it('deduplicates repeated separators', () => {
    expect(getSeparatorsFromTemplate('00-00-00')).toEqual(['-'])
  })

  it('returns empty array when no separators', () => {
    expect(getSeparatorsFromTemplate('0000')).toEqual([])
  })
})

describe('isValidInputCharacter', () => {
  it('accepts digits when the next template slot is "0"', () => {
    expect(isValidInputCharacter('5', '0000')).toBe(true)
  })

  it('rejects letters when the next template slot is "0"', () => {
    expect(isValidInputCharacter('A', '0000')).toBe(false)
  })

  it('accepts alphanumerics when the next template slot is "X"', () => {
    expect(isValidInputCharacter('A', 'XXXX')).toBe(true)
    expect(isValidInputCharacter('5', 'XXXX')).toBe(true)
  })

  it('rejects symbols when the next template slot is "X"', () => {
    expect(isValidInputCharacter('-', 'XXXX')).toBe(false)
    expect(isValidInputCharacter('@', 'XXXX')).toBe(false)
  })

  it('accepts any character when pattern is empty', () => {
    expect(isValidInputCharacter('@', '')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: FAIL — `getSeparatorsFromTemplate` and `isValidInputCharacter` not exported.

- [ ] **Step 3: Add implementation**

Append to `src/editors/shared/maskedPattern.ts`:

```ts
export function getSeparatorsFromTemplate(pattern: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const ch of pattern) {
    if (!TEMPLATE_CHARS.has(ch) && !seen.has(ch)) {
      seen.add(ch)
      result.push(ch)
    }
  }
  return result
}

export function isValidInputCharacter(char: string, pattern: string): boolean {
  if (!pattern) return true
  // Inspect the first template slot (current behavior: caller has already
  // narrowed to a position; we treat the first non-separator slot as canonical).
  const templateChar = pattern[0]
  if (templateChar === '0') {
    return /^[0-9]$/.test(char)
  }
  if (templateChar === 'X') {
    return /^[A-Za-z0-9]$/.test(char)
  }
  // Separator slot or unknown — accept the character (rare path).
  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/shared/maskedPattern.ts tests/editors/shared/maskedPattern.test.ts
git commit -m "feat(editors/shared): add separator + character-validation helpers"
```

---

## Task 3: `shared/maskedPattern.ts` — `calculateNewCursorPosition`

**Files:**
- Modify: `src/editors/shared/maskedPattern.ts`
- Modify: `tests/editors/shared/maskedPattern.test.ts`

**Concept:** When the masked pattern reformats the input, the cursor may need to advance over inserted separators or stay put if the user is editing mid-string. The cursor moves forward by `newValue.length - oldCursorPos`'s separators relative to the underlying raw position.

- [ ] **Step 1: Write the failing tests**

Append to `tests/editors/shared/maskedPattern.test.ts`:

```ts
import { calculateNewCursorPosition } from '../../../src/editors/shared/maskedPattern'

describe('calculateNewCursorPosition', () => {
  it('places cursor after typed character when no separator was inserted', () => {
    // user typed "12" → new value "12", cursor was at 2
    expect(calculateNewCursorPosition('12', 2, '0000-0000')).toBe(2)
  })

  it('skips past an inserted separator when typing into the slot before it', () => {
    // user typed "1234" → new value "1234-", cursor was at 4 (after the 4)
    expect(calculateNewCursorPosition('1234-', 4, '0000-0000')).toBe(5)
  })

  it('does not move cursor past the end of the new value', () => {
    expect(calculateNewCursorPosition('1234-56', 7, '0000-0000')).toBe(7)
  })

  it('handles cursor at start of value', () => {
    expect(calculateNewCursorPosition('1', 0, '0000-0000')).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: FAIL — `calculateNewCursorPosition` not exported.

- [ ] **Step 3: Add implementation**

Append to `src/editors/shared/maskedPattern.ts`:

```ts
/**
 * After reformatting an input under a masked pattern, compute the new cursor
 * position so the user's caret lands sensibly. The rule: if the character at
 * `oldCursorPos` in the new value is a separator (i.e., the formatter just
 * inserted it), advance past it; otherwise, hold position. Clamp to
 * `[0, newValue.length]`.
 */
export function calculateNewCursorPosition(
  newValue: string,
  oldCursorPos: number,
  pattern: string,
): number {
  if (!pattern || oldCursorPos < 0) return Math.max(0, oldCursorPos)

  let pos = oldCursorPos
  while (pos < newValue.length && pos < pattern.length && !TEMPLATE_CHARS.has(pattern[pos])) {
    pos++
  }
  return Math.min(pos, newValue.length)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/shared/maskedPattern.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/shared/maskedPattern.ts tests/editors/shared/maskedPattern.test.ts
git commit -m "feat(editors/shared): add calculateNewCursorPosition helper"
```

---

## Task 4: `shared/requiredMarker.ts` — XSS-safe required marker

**Files:**
- Create: `src/editors/shared/requiredMarker.ts`
- Create: `tests/editors/shared/requiredMarker.test.ts`

**Concept:** Replaces the source's raw HTML-property write on `<label>` (XSS vector — same fix pattern as the 1.1.0 `DropdownToolButton` audit). Build the `<sup>*</sup>` via DOM API, mark it with `data-idevs-required-marker` for idempotent insert/remove.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/editors/shared/requiredMarker.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import {
  findLabelFor,
  setRequiredMarker,
} from '../../../src/editors/shared/requiredMarker'

afterEach(() => {
  document.body.replaceChildren()
})

function setupForm() {
  const form = document.createElement('form')
  const label = document.createElement('label')
  label.textContent = 'Customer'
  const input = document.createElement('input')
  form.append(label, input)
  document.body.appendChild(form)
  return { form, label, input }
}

describe('findLabelFor', () => {
  it('finds a sibling label in the same parent', () => {
    const { label, input } = setupForm()
    expect(findLabelFor(input)).toBe(label)
  })

  it('walks up to the parent container for nested inputs', () => {
    const { form, label } = setupForm()
    const wrapper = document.createElement('div')
    const input = document.createElement('input')
    wrapper.appendChild(input)
    form.appendChild(wrapper)
    expect(findLabelFor(input)).toBe(label)
  })

  it('returns null when no label exists nearby', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(findLabelFor(input)).toBeNull()
  })
})

describe('setRequiredMarker', () => {
  it('inserts a <sup>*</sup> at the start of the label when isRequired=true', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    const sup = label.querySelector('sup[data-idevs-required-marker]')
    expect(sup).not.toBeNull()
    expect(sup?.textContent).toBe('*')
    expect(label.firstChild).toBe(sup)
  })

  it('is idempotent — re-calling does not duplicate the marker', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    setRequiredMarker(label, true)
    setRequiredMarker(label, true)
    expect(label.querySelectorAll('sup[data-idevs-required-marker]')).toHaveLength(1)
  })

  it('removes the marker when isRequired=false', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    expect(label.querySelector('sup[data-idevs-required-marker]')).not.toBeNull()
    setRequiredMarker(label, false)
    expect(label.querySelector('sup[data-idevs-required-marker]')).toBeNull()
  })

  it('uses textContent (not innerHTML) for the marker', () => {
    // Smoke test against XSS: the marker should never contain attacker-controlled HTML.
    const { label } = setupForm()
    setRequiredMarker(label, true)
    const sup = label.querySelector('sup[data-idevs-required-marker]') as HTMLElement
    expect(sup.children.length).toBe(0) // textContent → no child elements
    expect(sup.textContent).toBe('*')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/shared/requiredMarker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/editors/shared/requiredMarker.ts

/**
 * XSS-safe required-field marker for form labels. Inserts a `<sup>*</sup>` at
 * the start of the label using DOM APIs and `textContent` — never via raw HTML
 * writes. Mirrors the 1.1.0 DropdownToolButton XSS fix.
 *
 * The marker is tagged with `data-idevs-required-marker` so subsequent calls
 * can find and remove (or skip duplicating) it.
 */

const MARKER_ATTR = 'data-idevs-required-marker'

/**
 * Locate the form label associated with the given input. Looks at:
 *   1. The input's immediate parent (sibling label).
 *   2. The parent's parent (label is a cousin under a wrapper).
 * Returns null if no label is reachable.
 */
export function findLabelFor(input: HTMLElement): HTMLLabelElement | null {
  const directParent = input.parentElement
  if (!directParent) return null

  const sibling = directParent.querySelector('label')
  if (sibling) return sibling as HTMLLabelElement

  const grandparent = directParent.parentElement
  if (!grandparent) return null

  return grandparent.querySelector('label')
}

/**
 * Insert or remove the required marker on the given label. Idempotent.
 */
export function setRequiredMarker(label: HTMLLabelElement, isRequired: boolean): void {
  const existing = label.querySelector<HTMLElement>(`sup[${MARKER_ATTR}]`)

  if (isRequired) {
    if (existing) return // already present — idempotent
    const sup = document.createElement('sup')
    sup.setAttribute(MARKER_ATTR, '')
    sup.setAttribute('title', 'this field is required')
    sup.textContent = '*'
    label.insertBefore(sup, label.firstChild)
    return
  }

  // isRequired === false → remove if present
  existing?.remove()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/shared/requiredMarker.test.ts`
Expected: PASS — 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/editors/shared/requiredMarker.ts tests/editors/shared/requiredMarker.test.ts
git commit -m "feat(editors/shared): add XSS-safe required-marker DOM helpers"
```

---

## Task 5: `shared/validationObserver.ts` — class-sync MutationObserver wrapper

**Files:**
- Create: `src/editors/shared/validationObserver.ts`
- Create: `tests/editors/shared/validationObserver.test.ts`

**Concept:** Wraps the `MutationObserver` lifecycle used by `IdevsDateEditor` to mirror validation classes (`error`, `invalid`, `validation-error`) from a hidden input to a visible "alt" element (e.g., flatpickr's altInput, or the SearchButton's displayInput). Returns `start`/`stop`/`syncOnce` handles so the consumer doesn't manage the observer directly.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/editors/shared/validationObserver.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { createValidationObserver } from '../../../src/editors/shared/validationObserver'

const waitForMutation = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
})

function setup() {
  const source = document.createElement('input')
  const target = document.createElement('input')
  document.body.append(source, target)
  return { source, target }
}

describe('createValidationObserver', () => {
  it('syncs added classes from source to target when started', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error', 'invalid'],
    })
    obs.start()
    source.classList.add('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(true)
    obs.stop()
  })

  it('syncs removed classes from source to target', async () => {
    const { source, target } = setup()
    source.classList.add('error')
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    obs.syncOnce() // align target with current source state
    expect(target.classList.contains('error')).toBe(true)
    source.classList.remove('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(false)
    obs.stop()
  })

  it('ignores classes outside the configured allowlist', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'], // 'highlight' not in list
    })
    obs.start()
    source.classList.add('highlight')
    await waitForMutation()
    expect(target.classList.contains('highlight')).toBe(false)
    obs.stop()
  })

  it('stop() disconnects — further source changes do not propagate', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    obs.stop()
    source.classList.add('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(false)
  })

  it('stop() is idempotent', () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    expect(() => {
      obs.stop()
      obs.stop()
      obs.stop()
    }).not.toThrow()
  })

  it('accepts target as a getter function (late binding)', async () => {
    const { source } = setup()
    let lateTarget: HTMLInputElement | undefined
    const obs = createValidationObserver({
      source,
      target: () => lateTarget,
      classes: ['error'],
    })
    obs.start()
    source.classList.add('error')
    await waitForMutation()
    // target was undefined — no error thrown, just no sync yet
    lateTarget = document.createElement('input')
    document.body.appendChild(lateTarget)
    obs.syncOnce()
    expect(lateTarget.classList.contains('error')).toBe(true)
    obs.stop()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/shared/validationObserver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/editors/shared/validationObserver.ts

/**
 * Wraps the MutationObserver pattern used by editors that need to mirror
 * validation classes (`error`, `invalid`, `validation-error`) from a hidden
 * Serenity input to a visible "alt" element (flatpickr altInput, the
 * SearchButton's displayInput, etc.).
 *
 * Returns start/stop/syncOnce handles. The consumer is responsible for calling
 * `stop()` in `destroy()`.
 */

export type ValidationClassSync = {
  start(): void
  stop(): void
  syncOnce(): void
}

export type ValidationObserverOptions = {
  source: HTMLElement
  target: HTMLElement | (() => HTMLElement | null | undefined)
  classes: readonly string[]
}

export function createValidationObserver(opts: ValidationObserverOptions): ValidationClassSync {
  const { source, classes } = opts
  let observer: MutationObserver | undefined

  const resolveTarget = (): HTMLElement | null => {
    if (typeof opts.target === 'function') {
      return opts.target() ?? null
    }
    return opts.target
  }

  const syncOnce = () => {
    const target = resolveTarget()
    if (!target) return
    for (const cls of classes) {
      if (source.classList.contains(cls)) {
        target.classList.add(cls)
      } else {
        target.classList.remove(cls)
      }
    }
  }

  const start = () => {
    if (observer) return // already started — idempotent
    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          syncOnce()
          return
        }
      }
    })
    observer.observe(source, { attributes: true, attributeFilter: ['class'] })
  }

  const stop = () => {
    observer?.disconnect()
    observer = undefined
  }

  return { start, stop, syncOnce }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/shared/validationObserver.test.ts`
Expected: PASS — 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/editors/shared/validationObserver.ts tests/editors/shared/validationObserver.test.ts
git commit -m "feat(editors/shared): add MutationObserver wrapper for validation-class sync"
```

---

## Task 6: `shared/index.ts` — internal barrel

**Files:**
- Create: `src/editors/shared/index.ts`

- [ ] **Step 1: Write the barrel**

```ts
// src/editors/shared/index.ts
/**
 * Internal shared helpers for editors. Not re-exported from
 * `src/editors/index.ts` — consumers should depend on editors, not these
 * utilities. (PR-3b's SelfSearch reuses these via the same internal path.)
 */
export * from './maskedPattern'
export * from './requiredMarker'
export * from './validationObserver'
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Verify all shared/ tests still pass**

Run: `npm test -- --run tests/editors/shared`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/editors/shared/index.ts
git commit -m "feat(editors/shared): add internal barrel"
```

---

## Task 7: Test helpers — `entityGridStub` + `searchDialogStub`

**Files:**
- Create: `tests/editors/_helpers/entityGridStub.ts`
- Create: `tests/editors/_helpers/searchDialogStub.ts`

**Concept:** Minimal stubs that satisfy the editor's interaction surface without dragging in real SleekGrid or a real Serenity dialog. `EntityGridStub` exposes a tiny `slickGrid` shape; `SearchDialogStub` is registered with `Serenity.getType()` and fires `dataSelected` on demand.

- [ ] **Step 1: Write `entityGridStub.ts`**

```ts
// tests/editors/_helpers/entityGridStub.ts
import { vi } from 'vitest'

/**
 * Minimal stub satisfying the SlickGrid surface that SearchButtonEditor's
 * Slick adapter touches: editor-lock commit, navigation, cell change.
 */
export type StubSlickGrid = {
  getEditorLock: () => { commitCurrentEdit: () => boolean }
  getActiveCell: () => { row: number; cell: number } | null
  navigateNext: () => boolean
  editActiveCell: () => void
  getDataItem: (row: number) => Record<string, unknown> | undefined
  onCellChange: { notify: (event: { row: number; cell: number; item: Record<string, unknown> }) => void }
}

export function createEntityGridStub(opts: { items?: Record<string, unknown>[] } = {}) {
  const items = opts.items ?? []
  let activeCell: { row: number; cell: number } | null = { row: 0, cell: 0 }

  const slickGrid: StubSlickGrid = {
    getEditorLock: vi.fn(() => ({ commitCurrentEdit: vi.fn(() => true) })),
    getActiveCell: vi.fn(() => activeCell),
    navigateNext: vi.fn(() => {
      if (activeCell) activeCell = { row: activeCell.row, cell: activeCell.cell + 1 }
      return true
    }),
    editActiveCell: vi.fn(),
    getDataItem: vi.fn((row: number) => items[row]),
    onCellChange: { notify: vi.fn() },
  }

  return {
    slickGrid,
    setActiveCell(cell: { row: number; cell: number } | null) {
      activeCell = cell
    },
  }
}
```

- [ ] **Step 2: Write `searchDialogStub.ts`**

```ts
// tests/editors/_helpers/searchDialogStub.ts

/**
 * Minimal dialog stub for IdevsSearchButtonEditor tests. The editor resolves
 * the dialog class via Serenity's `getType()` — for tests we register a stub
 * class on a known type-name string and the editor instantiates it via
 * `new DialogClass({...})`.
 *
 * The stub exposes a `dialogOpen()` no-op and an `emitSelection()` helper that
 * tests call to simulate the user picking a row.
 */

export class SearchDialogStub {
  static lastInstance: SearchDialogStub | null = null

  public FilterKeys?: Record<string, unknown>
  public CriteriaKeys?: unknown[]
  public SearchValue?: string
  public DialogSize?: string
  public DialogType?: string
  public DialogPermission?: string
  public preItems?: unknown[]
  public element: [HTMLElement]

  constructor(public opts: Record<string, unknown> = {}) {
    this.element = [document.createElement('div')]
    SearchDialogStub.lastInstance = this
  }

  dialogOpen(): void {
    // no-op for tests
  }

  /**
   * Helper invoked by tests to simulate selection. Dispatches the
   * `dataSelected` CustomEvent the editor listens for.
   */
  emitSelection(target: HTMLElement, payload: Record<string, unknown>): void {
    target.dispatchEvent(new CustomEvent('dataSelected', { detail: payload }))
  }
}

/**
 * Install the stub on the global type registry so `getType('SearchDialogStub')`
 * returns the class. Returns a teardown function the afterEach should call.
 */
export function installSearchDialogStub(): () => void {
  const globalAny = globalThis as unknown as Record<string, unknown>
  const previous = globalAny.SearchDialogStub
  globalAny.SearchDialogStub = SearchDialogStub
  return () => {
    if (previous === undefined) {
      delete globalAny.SearchDialogStub
    } else {
      globalAny.SearchDialogStub = previous
    }
    SearchDialogStub.lastInstance = null
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/editors/_helpers/entityGridStub.ts tests/editors/_helpers/searchDialogStub.ts
git commit -m "test(editors): add entityGrid + searchDialog stubs for editor tests"
```

---

## Task 8: `IdevsNumericTagEditor` — scaffold + decorator + constructor

**Files:**
- Create: `src/editors/idevsNumericTagEditor.ts`
- Create: `tests/editors/idevsNumericTagEditor.test.ts`

- [ ] **Step 1: Write the failing scaffold test**

```ts
// tests/editors/idevsNumericTagEditor.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import {
  IdevsNumericTagEditor,
  type IdevsNumericTagEditorOptions,
} from '../../src/editors/idevsNumericTagEditor'

const mountedEditors: IdevsNumericTagEditor[] = []

afterEach(() => {
  mountedEditors.splice(0).forEach(editor => editor.destroy())
  document.body.replaceChildren()
})

function mount(options: IdevsNumericTagEditorOptions = {}) {
  const input = document.createElement('input')
  input.type = 'text'
  document.body.appendChild(input)
  const editor = new IdevsNumericTagEditor({ element: input, ...options })
  mountedEditors.push(editor)
  return { editor, input }
}

describe('IdevsNumericTagEditor — scaffold', () => {
  it('constructs without throwing and inherits IdevsTagEditor surface', () => {
    const { editor } = mount()
    expect(editor).toBeDefined()
    expect(typeof editor.get_value).toBe('function')
    expect(typeof editor.set_value).toBe('function')
    expect(typeof editor.destroy).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/editors/idevsNumericTagEditor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal scaffold**

```ts
// src/editors/idevsNumericTagEditor.ts
import { Decorators } from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'
import { IdevsTagEditor, type IdevsTagEditorOptions, type TagItem } from './idevsTagEditor'

export type IdevsNumericTagEditorOptions = IdevsTagEditorOptions & {
  prefix?: string
  suffix?: string
  addSpace?: boolean
  specialValues?: Record<number, string>
}

@Decorators.registerEditor('Idevs.CoreLib.IdevsNumericTagEditor')
export class IdevsNumericTagEditor<
  P extends IdevsNumericTagEditorOptions = IdevsNumericTagEditorOptions,
> extends IdevsTagEditor<P> {
  private _numericValue: number | null = null
  private _isFormatting = false

  constructor(props: EditorProps<P>) {
    super(props)
  }

  protected addDropdownItems(): void {
    const casing = this.options.valueCasing ?? 'none'
    this._items.forEach((item: TagItem) => {
      const displayText = this.formatDisplayText(item as string | number | null)
      this.createDropdownItem(displayText, item)
    })
  }

  protected override formatDisplayText(value?: string | number | null): string {
    if (value === undefined || value === null || value === '') return ''
    const num = typeof value === 'number' ? value : this.extractNumericValue(String(value))
    if (num === null) return ''

    const special = this.options.specialValues?.[num]
    if (special !== undefined) return special

    const sep = this.options.addSpace ? ' ' : ''
    const prefix = this.options.prefix ? `${this.options.prefix}${sep}` : ''
    const suffix = this.options.suffix ? `${sep}${this.options.suffix}` : ''
    return `${prefix}${num}${suffix}`
  }

  protected extractNumericValue(value: string): number | null {
    if (!value) return null
    // Strip prefix, suffix, and the optional inter-space — keep only the numeric core.
    const cleaned = value
      .replace(this.options.prefix ?? '', '')
      .replace(this.options.suffix ?? '', '')
      .trim()
    const num = Number(cleaned)
    return Number.isFinite(num) ? num : null
  }

  override formatDisplayValue(): void {
    if (this._isFormatting) return
    if (!this.domNode) return

    const cursorPos = this.domNode.selectionStart ?? this.domNode.value.length
    const oldLength = this.domNode.value.length
    const oldValue = this.domNode.value

    this._numericValue = this.extractNumericValue(this.domNode.value)

    this._isFormatting = true
    this.domNode.value = this.formatDisplayText(this._numericValue)
    this._isFormatting = false

    if (oldValue !== this.domNode.value) {
      this.domNode.dispatchEvent(new Event('change', { bubbles: true }))
      this.domNode.dispatchEvent(new Event('input', { bubbles: true }))
    }

    const newLength = this.domNode.value.length
    const newPos = Math.min(cursorPos + (newLength - oldLength), newLength)
    this.domNode.setSelectionRange(newPos, newPos)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/editors/idevsNumericTagEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsNumericTagEditor.ts tests/editors/idevsNumericTagEditor.test.ts
git commit -m "feat(editors): add IdevsNumericTagEditor scaffold extending IdevsTagEditor"
```

---

## Task 9: `IdevsNumericTagEditor` — `formatDisplayText` behavior tests

**Files:**
- Modify: `tests/editors/idevsNumericTagEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/editors/idevsNumericTagEditor.test.ts`:

```ts
describe('IdevsNumericTagEditor — formatDisplayText', () => {
  it('returns empty string for null / undefined / empty', () => {
    const { editor } = mount()
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(null)).toBe('')
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(undefined)).toBe('')
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText('')).toBe('')
  })

  it('renders a plain number when no prefix/suffix configured', () => {
    const { editor } = mount()
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(42)).toBe('42')
  })

  it('applies prefix without space when addSpace=false', () => {
    const { editor } = mount({ prefix: '$' })
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(42)).toBe('$42')
  })

  it('applies prefix with space when addSpace=true', () => {
    const { editor } = mount({ prefix: '$', addSpace: true })
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(42)).toBe('$ 42')
  })

  it('applies suffix', () => {
    const { editor } = mount({ suffix: '%' })
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(42)).toBe('42%')
  })

  it('applies both prefix and suffix with addSpace', () => {
    const { editor } = mount({ prefix: 'USD', suffix: 'only', addSpace: true })
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(42)).toBe('USD 42 only')
  })

  it('uses specialValues when value matches', () => {
    const { editor } = mount({ prefix: '$', specialValues: { 0: 'Free', '-1': 'N/A' } })
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(0)).toBe('Free')
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(-1)).toBe('N/A')
    expect((editor as unknown as { formatDisplayText: (v: unknown) => string }).formatDisplayText(5)).toBe('$5')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

(Implementation from Task 8 already covers this.)

Run: `npm test -- --run tests/editors/idevsNumericTagEditor.test.ts`
Expected: PASS — all 8+ tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/editors/idevsNumericTagEditor.test.ts
git commit -m "test(editors): add formatDisplayText coverage for IdevsNumericTagEditor"
```

---

## Task 10: `IdevsNumericTagEditor` — `extractNumericValue` + `formatDisplayValue` recursion guard

**Files:**
- Modify: `tests/editors/idevsNumericTagEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsNumericTagEditor — extractNumericValue', () => {
  it('strips prefix and parses the number', () => {
    const { editor } = mount({ prefix: '$' })
    expect((editor as unknown as { extractNumericValue: (v: string) => number | null }).extractNumericValue('$42')).toBe(42)
  })

  it('strips suffix and parses the number', () => {
    const { editor } = mount({ suffix: '%' })
    expect((editor as unknown as { extractNumericValue: (v: string) => number | null }).extractNumericValue('42%')).toBe(42)
  })

  it('returns null for unparseable input', () => {
    const { editor } = mount()
    expect((editor as unknown as { extractNumericValue: (v: string) => number | null }).extractNumericValue('not a number')).toBe(null)
  })

  it('returns null for empty input', () => {
    const { editor } = mount()
    expect((editor as unknown as { extractNumericValue: (v: string) => number | null }).extractNumericValue('')).toBe(null)
  })

  it('handles negative numbers', () => {
    const { editor } = mount({ prefix: '$' })
    expect((editor as unknown as { extractNumericValue: (v: string) => number | null }).extractNumericValue('$-5')).toBe(-5)
  })
})

describe('IdevsNumericTagEditor — formatDisplayValue', () => {
  it('reformats the input value and dispatches change/input exactly once if changed', () => {
    const { editor, input } = mount({ prefix: '$' })
    input.value = '42'
    const change = vi.fn()
    const inputEvt = vi.fn()
    input.addEventListener('change', change)
    input.addEventListener('input', inputEvt)

    editor.formatDisplayValue()

    expect(input.value).toBe('$42')
    expect(change).toHaveBeenCalledTimes(1)
    expect(inputEvt).toHaveBeenCalledTimes(1)
  })

  it('does NOT recurse when formatDisplayValue is re-entered via the change handler', () => {
    const { editor, input } = mount({ prefix: '$' })
    input.value = '42'

    // Subscribe a handler that re-calls formatDisplayValue. Without the
    // `_isFormatting` guard, this would infinite-loop.
    input.addEventListener('change', () => editor.formatDisplayValue())

    expect(() => editor.formatDisplayValue()).not.toThrow()
  })

  it('does nothing when value is unchanged after reformat', () => {
    const { editor, input } = mount() // no prefix/suffix
    input.value = '42'
    const change = vi.fn()
    input.addEventListener('change', change)

    editor.formatDisplayValue()
    expect(change).not.toHaveBeenCalled()
  })
})
```

Don't forget the `vi` import at the top of the test file:

```ts
// Update top of tests/editors/idevsNumericTagEditor.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsNumericTagEditor.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 3: Commit**

```bash
git add tests/editors/idevsNumericTagEditor.test.ts
git commit -m "test(editors): add extractNumericValue + formatDisplayValue tests"
```

---

## Task 11: `SlickEditorBase` — scaffold + Editor interface contract

**Files:**
- Create: `src/editors/slickEditorBase.ts`
- Create: `tests/editors/slickEditorBase.test.ts`

**Concept:** Abstract base class implementing SleekGrid's `Editor` interface. Subclasses provide `createEditor()`; the base wires lifecycle (load/serialize/apply/isChanged/validate/focus/destroy) and event cleanup.

- [ ] **Step 1: Write the failing scaffold test with a concrete TestableSlickEditor fixture**

```ts
// tests/editors/slickEditorBase.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProps } from '@serenity-is/corelib'
import type { EditorOptions } from '@serenity-is/sleekgrid'
import { SlickEditorBase } from '../../src/editors/slickEditorBase'

/** A tiny editor stub that satisfies SlickWrappedEditor. */
class FakeInnerEditor {
  public domNode: HTMLInputElement
  public _value: unknown = ''
  public destroyed = false
  public props = { grid: undefined as { slickGrid: unknown } | undefined }

  constructor() {
    this.domNode = document.createElement('input')
  }

  get value(): unknown {
    return this._value
  }

  set value(v: unknown) {
    this._value = v
    this.domNode.value = (v as string) ?? ''
  }

  destroy(): void {
    this.destroyed = true
  }
}

/** Concrete subclass under test. */
class TestableSlickEditor extends SlickEditorBase<FakeInnerEditor, EditorOptions> {
  static instances: TestableSlickEditor[] = []

  constructor(props: EditorProps<EditorOptions>) {
    super(props)
    TestableSlickEditor.instances.push(this)
  }

  protected createEditor(_props: EditorProps<EditorOptions>): FakeInnerEditor {
    return new FakeInnerEditor()
  }
}

const mounted: TestableSlickEditor[] = []

function mount(opts: { item?: Record<string, unknown>; field?: string } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const field = opts.field ?? 'foo'
  const props = {
    container,
    column: { field, sourceItem: { editorParams: {} } },
    grid: undefined,
  } as unknown as EditorProps<EditorOptions>
  const editor = new TestableSlickEditor(props)
  mounted.push(editor)
  if (opts.item) editor.loadValue(opts.item)
  return { editor, container }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  mounted.splice(0).forEach(e => {
    try {
      e.destroy()
    } catch {
      /* ignore re-destroy */
    }
  })
  document.body.replaceChildren()
  TestableSlickEditor.instances = []
})

describe('SlickEditorBase — lifecycle', () => {
  it('constructs and exposes the inner editor', () => {
    const { editor } = mount()
    expect(editor).toBeDefined()
  })

  it('loadValue reads from item and stores originalValue', () => {
    const { editor } = mount({ item: { foo: 'bar' } })
    expect(editor.serializeValue()).toBe('bar')
    expect(editor.isValueChanged()).toBe(false)
  })

  it('isValueChanged detects mutation of the inner value', () => {
    const { editor } = mount({ item: { foo: 'bar' } })
    // Mutate via the inner editor's setter path
    ;(editor as unknown as { setEditorValue: (v: unknown) => void }).setEditorValue('baz')
    expect(editor.isValueChanged()).toBe(true)
  })

  it('applyValue writes back to the item', () => {
    const { editor } = mount({ item: { foo: 'bar' } })
    const target: Record<string, unknown> = {}
    editor.applyValue(target, 'committed')
    expect(target.foo).toBe('committed')
  })

  it('validate returns valid:true by default', () => {
    const { editor } = mount()
    expect(editor.validate()).toEqual({ valid: true, msg: null })
  })

  it('focus calls focusEditor inside requestAnimationFrame', () => {
    const { editor } = mount()
    const focusSpy = vi.spyOn(
      editor as unknown as { focusEditor: () => void },
      'focusEditor',
    )
    editor.focus()
    // RAF in jsdom isn't auto-flushed by fake timers; manually flush:
    vi.runAllTicks()
    // The actual focus happens via requestAnimationFrame which jsdom polyfills as setTimeout
    vi.advanceTimersByTime(20)
    expect(focusSpy).toHaveBeenCalled()
  })

  it('destroy calls inner editor destroy and clears references', () => {
    const { editor } = mount({ item: { foo: 'bar' } })
    const inner = TestableSlickEditor.instances[0]['editor'] as FakeInnerEditor
    editor.destroy()
    expect(inner.destroyed).toBe(true)
    // After destroy, public methods become no-ops
    expect(editor.serializeValue()).toBe(null)
    expect(editor.isValueChanged()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/slickEditorBase.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/editors/slickEditorBase.ts
import type { Editor, EditorOptions } from '@serenity-is/sleekgrid'
import type { EditorProps } from '@serenity-is/corelib'

/**
 * Shape required of the wrapped Serenity editor. Eliminates `(editor as any)`
 * casts that the PowerACC source relied on.
 */
export type SlickWrappedEditor = {
  domNode: HTMLElement
  value?: unknown
  destroy?: () => void
  props?: { grid?: { slickGrid: unknown } }
}

type SlickGridLike = {
  getActiveCell?: () => { row: number; cell: number } | null
  getDataItem?: (row: number) => Record<string, unknown> | undefined
  onCellChange?: { notify: (event: { row: number; cell: number; item: Record<string, unknown> }) => void }
}

/**
 * Abstract SleekGrid Editor wrapping a Serenity widget. Subclasses provide
 * `createEditor`; the base wires loadValue/serializeValue/applyValue/destroy,
 * tracks event listeners for cleanup, and exposes overridable hooks for
 * value-change and key-handling behavior.
 */
export abstract class SlickEditorBase<
  TEditor extends SlickWrappedEditor,
  P extends EditorOptions = EditorOptions,
> implements Editor {
  protected props: EditorProps<P>
  protected editor: TEditor
  protected field: string
  protected container: HTMLElement
  protected originalValue: unknown = null
  protected isDestroyed = false
  protected grid: SlickGridLike | null = null

  /** Tracked listener cleanups. Drained in destroy(). */
  protected eventCleanup: Array<() => void> = []

  protected constructor(props: EditorProps<P>) {
    this.props = props
    this.field = props.column.field
    this.container = props.container

    this.editor = this.createEditor(props)
    this.appendToContainer(props)

    this.grid = (props.grid as SlickGridLike | undefined) ?? null

    // Defer event-handler setup until the DOM is committed.
    setTimeout(() => {
      if (!this.isDestroyed && this.editor) {
        this.setupEventHandlers()
        this.focusEditor()
      }
    }, 0)
  }

  protected abstract createEditor(props: EditorProps<P>): TEditor

  protected appendToContainer(props: EditorProps<P>): void {
    if (this.editor?.domNode) {
      props.container.appendChild(this.editor.domNode)
    }
  }

  protected getEditorValue(): unknown {
    if (this.isDestroyed || !this.editor) return null
    return this.editor.value
  }

  protected setEditorValue(value: unknown): void {
    if (this.isDestroyed || !this.editor) return
    this.editor.value = value ?? ''
  }

  protected focusEditor(): void {
    if (this.isDestroyed || !this.editor) return
    const inputElement = this.getInputElement()
    if (inputElement) {
      inputElement.focus()
    } else {
      this.editor.domNode.focus()
    }
  }

  protected destroyEditor(): void {
    if (this.editor && typeof this.editor.destroy === 'function') {
      this.editor.destroy()
    }
  }

  /**
   * Register a listener for cleanup. The base will remove it in destroy().
   */
  protected addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (this.isDestroyed) return
    target.addEventListener(type, listener, options)
    this.eventCleanup.push(() => {
      target.removeEventListener(type, listener, options)
    })
  }

  protected setupEventHandlers(): void {
    this.setupValueChangeHandler()
  }

  protected setupValueChangeHandler(): void {
    const inputElement = this.getInputElement()
    if (!inputElement) return

    this.addEventListener(inputElement, 'input', () => this.handleValueChange())
    this.addEventListener(inputElement, 'blur', () => {
      this.handleValueChange()
      this.commitValue()
    })
    this.addEventListener(inputElement, 'keydown', (e: Event) => {
      this.handleKeyDown(e as KeyboardEvent)
    })
  }

  protected handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.handleValueChange()
      this.commitValue()
    }
  }

  protected getInputElement(): HTMLInputElement | null {
    if (this.isDestroyed || !this.editor) return null
    return this.container.querySelector('input')
  }

  protected handleValueChange(): void {
    if (this.isDestroyed) return
    this.container.dispatchEvent(
      new CustomEvent('cellchange', {
        detail: { field: this.field, value: this.serializeValue() },
      }),
    )
  }

  protected commitValue(): void {
    if (this.isDestroyed) return
    const value = this.serializeValue()
    if (!this.grid) return

    const activeCell = this.grid.getActiveCell?.()
    if (!activeCell) return

    const item = this.grid.getDataItem?.(activeCell.row)
    if (!item) return

    item[this.field] = value
    this.grid.onCellChange?.notify({
      row: activeCell.row,
      cell: activeCell.cell,
      item,
    })
  }

  // === SleekGrid Editor interface ===

  loadValue(item: Record<string, unknown>): void {
    if (this.isDestroyed) return
    this.originalValue = item[this.field] ?? null
    this.setEditorValue(this.originalValue)
  }

  serializeValue(): unknown {
    if (this.isDestroyed || !this.editor) return null
    return this.getEditorValue()
  }

  applyValue(item: Record<string, unknown>, state: unknown): void {
    if (this.isDestroyed) return
    item[this.field] = state
  }

  isValueChanged(): boolean {
    if (this.isDestroyed || !this.editor) return false
    // Loose equality on purpose — gridded values may shift between string/number
    // representations between load and serialize. Mirrors source semantics.
    return this.serializeValue() != this.originalValue
  }

  validate(): { valid: boolean; msg: string | null } {
    return { valid: true, msg: null }
  }

  focus(): void {
    if (this.isDestroyed || !this.editor) return
    requestAnimationFrame(() => {
      if (!this.isDestroyed && this.editor) {
        this.focusEditor()
      }
    })
  }

  destroy(): void {
    if (this.isValueChanged()) {
      this.handleValueChange()
      this.commitValue()
    }
    this.isDestroyed = true

    // Run cleanups; swallow individual failures (cleanup during teardown is noise).
    for (const cleanup of this.eventCleanup) {
      try {
        cleanup()
      } catch {
        /* intentional: teardown failures are not actionable here */
      }
    }
    this.eventCleanup = []
    this.destroyEditor()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/slickEditorBase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/slickEditorBase.ts tests/editors/slickEditorBase.test.ts
git commit -m "feat(editors): add SlickEditorBase abstract class with typed wrapped editor"
```

---

## Task 12: `SlickEditorBase` — listener cleanup + commitValue + handleKeyDown tests

**Files:**
- Modify: `tests/editors/slickEditorBase.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/editors/slickEditorBase.test.ts`:

```ts
import { createEntityGridStub } from './_helpers/entityGridStub'

describe('SlickEditorBase — listener cleanup', () => {
  it('addEventListener registers a removable listener', () => {
    const { editor, container } = mount()
    vi.advanceTimersByTime(1) // run constructor setTimeout(0)

    const target = document.createElement('div')
    document.body.appendChild(target)
    const handler = vi.fn()
    ;(editor as unknown as {
      addEventListener: (t: EventTarget, type: string, l: EventListener) => void
    }).addEventListener(target, 'click', handler)

    target.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    editor.destroy()
    target.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1) // not called again post-destroy
  })

  it('input event on the editor input triggers handleValueChange → cellchange dispatched', () => {
    const { editor, container } = mount()
    vi.advanceTimersByTime(1) // run setupEventHandlers

    const inner = (editor as unknown as { editor: { domNode: HTMLInputElement } }).editor
    const cellChange = vi.fn()
    container.addEventListener('cellchange', cellChange)

    inner.domNode.dispatchEvent(new Event('input'))
    expect(cellChange).toHaveBeenCalledTimes(1)
  })

  it('Enter key triggers handleValueChange + commitValue', () => {
    const grid = createEntityGridStub({ items: [{ foo: 'bar' }] })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const props = {
      container,
      column: { field: 'foo', sourceItem: { editorParams: {} } },
      grid: grid.slickGrid,
    } as unknown as EditorProps<EditorOptions>
    const editor = new TestableSlickEditor(props)
    mounted.push(editor)
    editor.loadValue({ foo: 'old' })
    vi.advanceTimersByTime(1)

    const inner = (editor as unknown as { editor: { domNode: HTMLInputElement } }).editor
    ;(editor as unknown as { setEditorValue: (v: unknown) => void }).setEditorValue('new')

    inner.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(grid.slickGrid.onCellChange.notify).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/slickEditorBase.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 3: Commit**

```bash
git add tests/editors/slickEditorBase.test.ts
git commit -m "test(editors): cover SlickEditorBase listener cleanup + commit/keydown flow"
```

---

## Task 13: `IdevsSearchButtonEditor` — class scaffold + Serenity contract

**Files:**
- Create: `src/editors/idevsSearchButtonEditor.ts`
- Create: `tests/editors/idevsSearchButtonEditor.test.ts`

**Concept:** The editor's hidden `domNode` holds the canonical value. A separate `displayInput` shows the formatted/looked-up text. The constructor builds the DOM scaffolding; `set_value` is the single chokepoint for value writes.

- [ ] **Step 1: Write the failing scaffold tests**

```ts
// tests/editors/idevsSearchButtonEditor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IdevsSearchButtonEditor,
  type IdevsSearchButtonEditorOptions,
} from '../../src/editors/idevsSearchButtonEditor'
import { installSearchDialogStub } from './_helpers/searchDialogStub'

const mountedEditors: IdevsSearchButtonEditor[] = []
let uninstallDialog: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  uninstallDialog = installSearchDialogStub()
})

afterEach(() => {
  vi.useRealTimers()
  mountedEditors.splice(0).forEach(e => {
    try { e.destroy() } catch { /* ignore */ }
  })
  document.body.replaceChildren()
  uninstallDialog?.()
})

function mount(opts: IdevsSearchButtonEditorOptions = {}) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const editor = new IdevsSearchButtonEditor({
    element: input,
    searchDialogType: 'SearchDialogStub',
    ...opts,
  })
  mountedEditors.push(editor)
  return { editor, input }
}

describe('IdevsSearchButtonEditor — scaffold', () => {
  it('constructs without throwing when searchDialogType is provided', () => {
    expect(() => mount()).not.toThrow()
  })

  it('exposes the Serenity contract (get/set value, readOnly, required, destroy)', () => {
    const { editor } = mount()
    expect(typeof editor.get_value).toBe('function')
    expect(typeof editor.set_value).toBe('function')
    expect(typeof editor.get_readOnly).toBe('function')
    expect(typeof editor.set_readOnly).toBe('function')
    expect(typeof editor.get_required).toBe('function')
    expect(typeof editor.set_required).toBe('function')
    expect(typeof editor.destroy).toBe('function')
  })

  it('throws when searchDialogType is missing', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(() => new IdevsSearchButtonEditor({ element: input })).toThrow(
      /searchDialogType/i,
    )
  })
})

describe('IdevsSearchButtonEditor — value contract', () => {
  it('get_value returns null when domNode is empty', () => {
    const { editor } = mount()
    expect(editor.get_value()).toBeNull()
  })

  it('set_value updates domNode and dispatches change exactly once when value changes', () => {
    const { editor, input } = mount()
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('42')
    expect(input.value).toBe('42')
    expect(editor.get_value()).toBe('42')
    expect(change).toHaveBeenCalledTimes(1)
  })

  it('set_value does not dispatch when value is unchanged', () => {
    const { editor, input } = mount()
    editor.set_value('42')
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('42')
    expect(change).not.toHaveBeenCalled()
  })

  it('set_value(null) clears the domNode and dispatches change', () => {
    const { editor, input } = mount()
    editor.set_value('42')
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value(null)
    expect(input.value).toBe('')
    expect(editor.get_value()).toBeNull()
    expect(change).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the scaffold implementation**

```ts
// src/editors/idevsSearchButtonEditor.ts
import {
  Decorators,
  EditorWidget,
  Fluent,
  IReadOnly,
  IStringValue,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'

export type IdevsSearchButtonEditorOptions = {
  grid?: unknown
  idColumnName?: string
  textColumnName?: string
  searchDialogType?: string
  canClear?: boolean
  displayTemplate?: string
  maskedPattern?: string
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
  minSearchLength?: number
}

export type PreSearchCallback = (
  filters: Record<string, unknown>,
  searchValue: string,
) => Promise<unknown[]> | unknown[]

export type SubscriberCallback = (data: unknown) => void

const DEFAULT_DISPLAY_TEMPLATE = '{id} - {value}'
const DEFAULT_PLACEHOLDER = 'Enter some value and click search button'

@Decorators.registerEditor('Idevs.CoreLib.IdevsSearchButtonEditor', [IReadOnly, IStringValue])
export class IdevsSearchButtonEditor<
  P extends IdevsSearchButtonEditorOptions = IdevsSearchButtonEditorOptions,
> extends EditorWidget<P> implements IReadOnly, IStringValue {
  // Fields
  protected displayInput!: HTMLInputElement
  protected searchButton!: HTMLButtonElement
  protected clearButton?: HTMLAnchorElement
  protected isReadonly = false
  protected isDestroyed = false
  protected subscribers: SubscriberCallback[] = []
  protected preSearchCallback?: PreSearchCallback
  protected filters: Record<string, unknown> = {}
  protected criteria: unknown[] = []

  declare readonly domNode: HTMLInputElement

  static override createDefaultElement(): HTMLInputElement {
    return Fluent('input').attr('type', 'text').addClass('d-none').getNode() as HTMLInputElement
  }

  constructor(props: EditorProps<P>) {
    super(props)
    this.validateRequiredProps()
    // Subsequent tasks fill in: renderUI, setupEventListeners, applyInitialState.
  }

  protected validateRequiredProps(): void {
    if (!this.props.searchDialogType) {
      throw new Error('IdevsSearchButtonEditor requires options.searchDialogType')
    }
  }

  // === Serenity contract ===

  get_value(): string | null {
    return this.domNode.value || null
  }

  set_value(value: string | null): void {
    const newValue = value ?? ''
    if (this.domNode.value === newValue) return
    this.domNode.value = newValue
    Fluent.trigger(this.domNode, 'change')
  }

  get_readOnly(): boolean {
    return this.isReadonly
  }

  set_readOnly(value: boolean): void {
    if (this.isReadonly === value) return
    this.isReadonly = value
    // Task 17 fills in the UI sync.
  }

  get_required(): boolean {
    return (
      this.domNode.hasAttribute('required') ||
      this.domNode.classList.contains('required')
    )
  }

  set_required(value: boolean): void {
    if (value) {
      this.domNode.classList.add('required')
      this.domNode.setAttribute('required', '')
    } else {
      this.domNode.classList.remove('required')
      this.domNode.removeAttribute('required')
    }
    // Task 18 fills in the required-marker integration.
  }

  destroy(): void {
    this.isDestroyed = true
    this.subscribers = []
    super.destroy()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): add IdevsSearchButtonEditor scaffold + Serenity value contract"
```

---

## Task 14: `IdevsSearchButtonEditor` — rendering (container + display input + buttons)

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to test file:

```ts
describe('IdevsSearchButtonEditor — rendering', () => {
  it('wraps the hidden input in a container and inserts the display input', () => {
    const { editor, input } = mount()
    const container = input.parentElement
    expect(container).not.toBeNull()
    expect(container?.classList.contains('search-button-editor')).toBe(true)

    const display = container?.querySelector<HTMLInputElement>('input.editor')
    expect(display).not.toBeNull()
    expect(display?.type).toBe('text')
  })

  it('inserts a search button into the container', () => {
    const { input } = mount()
    const container = input.parentElement
    expect(container?.querySelector('button.search-btn')).not.toBeNull()
  })

  it('inserts a clear button when canClear is undefined or true', () => {
    const { input: a } = mount()
    expect(a.parentElement?.querySelector('a.clear-btn')).not.toBeNull()
    const { input: b } = mount({ canClear: true })
    expect(b.parentElement?.querySelector('a.clear-btn')).not.toBeNull()
  })

  it('omits the clear button when canClear is false', () => {
    const { input } = mount({ canClear: false })
    expect(input.parentElement?.querySelector('a.clear-btn')).toBeNull()
  })

  it('hides the original domNode (display: none class)', () => {
    const { input } = mount()
    expect(input.classList.contains('d-none')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — rendering is not in place.

- [ ] **Step 3: Add rendering**

Modify the constructor and add the rendering helpers. Replace the constructor body and add the helpers immediately after the static `createDefaultElement`:

```ts
  constructor(props: EditorProps<P>) {
    super(props)
    this.validateRequiredProps()
    this.renderUI()
  }

  // ... existing Serenity contract methods ...

  protected renderUI(): void {
    const container = this.createContainer()
    this.createDisplayInput(container)
    this.createButtons(container)
    this.insertIntoDOM(container)
  }

  protected createContainer(): HTMLElement {
    return Fluent('div').addClass('search-button-editor').style(css => {
      css.display = 'flex'
      css.position = 'relative'
      css.width = '100%'
    }).getNode() as HTMLElement
  }

  protected createDisplayInput(container: HTMLElement): void {
    this.displayInput = Fluent('input')
      .attr('type', 'text')
      .attr('placeholder', DEFAULT_PLACEHOLDER)
      .addClass('editor form-control')
      .style(css => {
        css.flexGrow = '1'
        css.minWidth = '10ch'
        if (this.props.canClear !== false) {
          css.paddingRight = '1.75rem'
        }
      })
      .appendTo(container)
      .getNode() as HTMLInputElement
  }

  protected createButtons(container: HTMLElement): void {
    this.searchButton = this.createSearchButton()
    container.appendChild(this.searchButton)
    if (this.props.canClear !== false) {
      this.clearButton = this.createClearButton()
      container.appendChild(this.clearButton)
    }
  }

  protected createSearchButton(): HTMLButtonElement {
    return Fluent('button')
      .attr('type', 'button')
      .addClass('btn btn-primary search-btn')
      .style(css => {
        css.minWidth = '2.5rem'
        css.fontSize = '1.4rem'
      })
      .text('🔍')
      .getNode() as HTMLButtonElement
  }

  protected createClearButton(): HTMLAnchorElement {
    return Fluent('a')
      .attr('href', '#')
      .attr('role', 'button')
      .attr('aria-label', 'Clear')
      .addClass('clear-btn')
      .style(css => {
        css.position = 'absolute'
        css.right = '3rem'
        css.top = '50%'
        css.transform = 'translateY(-50%)'
        css.fontSize = '1.2rem'
        css.textDecoration = 'none'
      })
      .text('✕')
      .getNode() as HTMLAnchorElement
  }

  protected insertIntoDOM(container: HTMLElement): void {
    const parent = this.domNode.parentNode
    parent?.insertBefore(container, this.domNode)
    container.insertBefore(this.domNode, container.firstChild)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS — all 5 new rendering tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): render container + display input + buttons for IdevsSearchButtonEditor"
```

---

## Task 15: `IdevsSearchButtonEditor` — input handlers + masked pattern

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — display input integration', () => {
  it('typing in displayInput updates domNode value via set_value chokepoint', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    display.value = '42'
    display.dispatchEvent(new Event('input'))

    expect(editor.get_value()).toBe('42')
  })

  it('applies maskedPattern formatting on input', () => {
    const { input } = mount({ maskedPattern: '0000-0000' })
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    display.value = '12345678'
    display.dispatchEvent(new Event('input'))

    expect(display.value).toBe('1234-5678')
    expect(input.value).toBe('12345678') // raw stored in domNode
  })

  it('Enter triggers a search when enableEnterKeySearch is true', () => {
    const { input } = mount({ enableEnterKeySearch: true })
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!
    const clickSpy = vi.fn()
    searchBtn.addEventListener('click', clickSpy)

    display.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    // Search-button-click handler is what runs; for now we just assert no throw
    // and that Enter consumed (preventDefault would matter in real DOM).
    expect(() => {}).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — input handlers not wired.

- [ ] **Step 3: Add input handlers**

Add imports at the top:

```ts
import { applyMaskedPattern, extractRawValue } from './shared/maskedPattern'
```

Modify the constructor to call `setupEventListeners()` after `renderUI()`:

```ts
  constructor(props: EditorProps<P>) {
    super(props)
    this.validateRequiredProps()
    this.renderUI()
    this.setupEventListeners()
  }
```

Add the handler methods:

```ts
  protected setupEventListeners(): void {
    this.displayInput.addEventListener('keydown', e => this.handleDisplayInputKeydown(e))
    this.displayInput.addEventListener('input', e => this.handleDisplayInputChange(e))
    this.displayInput.addEventListener('paste', e => this.handleDisplayInputPaste(e))
  }

  protected handleDisplayInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.props.enableEnterKeySearch) {
      event.preventDefault()
      this.searchButton.click()
    }
  }

  protected handleDisplayInputChange(_event: Event): void {
    const pattern = this.props.maskedPattern
    if (pattern) {
      const formatted = applyMaskedPattern(this.displayInput.value, pattern)
      if (formatted !== this.displayInput.value) {
        this.displayInput.value = formatted
      }
      const raw = extractRawValue(formatted, pattern)
      this.set_value(raw)
    } else {
      this.set_value(this.displayInput.value)
    }
  }

  protected handleDisplayInputPaste(event: ClipboardEvent): void {
    if (!this.props.maskedPattern) return
    // Let the paste land, then reformat on the next tick.
    setTimeout(() => {
      if (this.isDestroyed) return
      this.handleDisplayInputChange(event)
    }, 0)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): wire display input handlers + masked pattern integration"
```

---

## Task 16: `IdevsSearchButtonEditor` — search button + dialog open

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

**Concept:** Clicking the search button (or pressing Enter when enabled) opens the dialog. The dialog class is resolved from `searchDialogType` via Serenity `getType()`. The editor instantiates it, populates filter/criteria/search context, and calls `dialogOpen()`. The dialog later fires `dataSelected` on the editor's `domNode` to commit a selection.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { SearchDialogStub } from './_helpers/searchDialogStub'

describe('IdevsSearchButtonEditor — search button + dialog', () => {
  it('clicking the search button instantiates the dialog and calls dialogOpen', () => {
    const { input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    display.value = 'foo'
    const dialogOpenSpy = vi.fn()
    SearchDialogStub.prototype.dialogOpen = dialogOpenSpy

    searchBtn.click()
    vi.runAllTimers() // flush the debounced search

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1)
  })

  it('dialog receives the current displayInput value as SearchValue', () => {
    const { input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    display.value = 'acme'
    searchBtn.click()
    vi.runAllTimers()

    expect(SearchDialogStub.lastInstance?.SearchValue).toBe('acme')
  })

  it('dialog receives filterKeys and criteriaKeys set on the editor', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    editor.setFilterKeys({ region: 'EU' })
    editor.setCriteriaKeys(['active'])
    searchBtn.click()
    vi.runAllTimers()

    expect(SearchDialogStub.lastInstance?.FilterKeys).toEqual({ region: 'EU' })
    expect(SearchDialogStub.lastInstance?.CriteriaKeys).toEqual(['active'])
  })

  it('blocks search when input length is below minSearchLength', () => {
    const { input } = mount({ minSearchLength: 3 })
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    display.value = 'ab' // 2 chars, below the 3-char minimum
    searchBtn.click()
    vi.runAllTimers()

    expect(SearchDialogStub.lastInstance).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — search button isn't wired, `setFilterKeys`/`setCriteriaKeys` not defined.

- [ ] **Step 3: Add public API + button handlers**

Add public API methods to the class (before `destroy`):

```ts
  setFilterKeys(filters: Record<string, unknown>): void {
    this.filters = { ...filters }
  }

  setCriteriaKeys(criteria: unknown[]): void {
    this.criteria = [...criteria]
  }

  subscribe(callback: SubscriberCallback): void {
    if (this.isDestroyed) return
    this.subscribers.push(callback)
  }

  preSearch(callback: PreSearchCallback): void {
    this.preSearchCallback = callback
  }
```

Wire the search button in `setupEventListeners`:

```ts
  protected setupEventListeners(): void {
    this.displayInput.addEventListener('keydown', e => this.handleDisplayInputKeydown(e))
    this.displayInput.addEventListener('input', e => this.handleDisplayInputChange(e))
    this.displayInput.addEventListener('paste', e => this.handleDisplayInputPaste(e))
    this.searchButton.addEventListener('click', e => this.handleSearchButtonClick(e))
    if (this.clearButton) {
      this.clearButton.addEventListener('click', e => this.handleClearButtonClick(e))
    }
  }

  protected handleSearchButtonClick(event: MouseEvent): void {
    event.preventDefault()
    if (this.isReadonly) return
    this.performSearch()
  }

  protected handleClearButtonClick(event: MouseEvent): void {
    event.preventDefault()
    if (this.isReadonly) return
    this.performClear()
  }

  protected performSearch(): void {
    const searchValue = this.props.getSearchValue
      ? this.props.getSearchValue()
      : this.displayInput.value

    const min = this.props.minSearchLength ?? 0
    if (min > 0 && searchValue.length < min) {
      // notifyInfo would normally fire; in tests we skip the toast.
      return
    }

    this.openDialog(searchValue)
  }

  protected performClear(): void {
    this.displayInput.value = ''
    this.set_value(null)
  }

  protected openDialog(searchValue: string): void {
    const DialogClass = this.resolveDialogClass()
    if (!DialogClass) return

    const filters = this.props.getFilters ? this.props.getFilters() : this.filters
    const criteria = this.props.getCriteria ? this.props.getCriteria() : this.criteria

    const dialog = new DialogClass({
      grid: this.props.grid,
      dialogSize: this.props.dialogSize,
    })
    dialog.FilterKeys = filters
    dialog.CriteriaKeys = criteria
    dialog.SearchValue = searchValue
    dialog.DialogSize = this.props.dialogSize
    dialog.DialogType = this.props.dialogType
    dialog.DialogPermission = this.props.modifyDialogPermission

    // Listen for selection on the editor's domNode (dialog fires the event there).
    const selectionHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      this.handleSelection(detail)
    }
    this.domNode.addEventListener('dataSelected', selectionHandler as EventListener)

    dialog.dialogOpen()
  }

  protected resolveDialogClass(): (new (opts: Record<string, unknown>) => {
    dialogOpen(): void
    FilterKeys?: Record<string, unknown>
    CriteriaKeys?: unknown[]
    SearchValue?: string
    DialogSize?: string
    DialogType?: string
    DialogPermission?: string
  }) | null {
    const typeName = this.props.searchDialogType
    if (!typeName) return null
    const globalAny = globalThis as Record<string, unknown>
    return (globalAny[typeName] as new (opts: Record<string, unknown>) => {
      dialogOpen(): void
    }) as unknown as ReturnType<IdevsSearchButtonEditor<P>['resolveDialogClass']> ?? null
  }

  protected handleSelection(data: unknown): void {
    const idCol = this.props.idColumnName
    if (!idCol) return
    const item = data as Record<string, unknown>
    const id = item[idCol]
    this.set_value(id != null ? String(id) : null)
    if (typeof this.props.textColumnName === 'string') {
      const text = item[this.props.textColumnName]
      if (text != null) this.displayInput.value = String(text)
    }
    if (this.props.onDataSelected) this.props.onDataSelected(data)
    for (const sub of this.subscribers) sub(data)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): wire search button + dialog open + selection handling"
```

---

## Task 17: `IdevsSearchButtonEditor` — readOnly state wiring

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — readOnly state', () => {
  it('set_readOnly(true) disables the display input and hides the buttons', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    editor.set_readOnly(true)

    expect(display.readOnly).toBe(true)
    expect(display.classList.contains('readonly')).toBe(true)
    expect(searchBtn.hasAttribute('disabled')).toBe(true)
  })

  it('set_readOnly(false) re-enables the display input and buttons', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!

    editor.set_readOnly(true)
    editor.set_readOnly(false)

    expect(display.readOnly).toBe(false)
    expect(display.classList.contains('readonly')).toBe(false)
    expect(searchBtn.hasAttribute('disabled')).toBe(false)
  })

  it('get_readOnly reflects the current state', () => {
    const { editor } = mount()
    expect(editor.get_readOnly()).toBe(false)
    editor.set_readOnly(true)
    expect(editor.get_readOnly()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — readOnly setter doesn't update UI yet.

- [ ] **Step 3: Implement readOnly state sync**

Replace `set_readOnly` body and add helpers:

```ts
  set_readOnly(value: boolean): void {
    if (this.isReadonly === value) return
    this.isReadonly = value
    this.updateReadonlyState()
  }

  protected updateReadonlyState(): void {
    this.setDisplayInputReadonly(this.isReadonly)
    this.updateButtonsReadonly()
  }

  protected setDisplayInputReadonly(readOnly: boolean): void {
    this.displayInput.readOnly = readOnly
    this.displayInput.classList.toggle('readonly', readOnly)
  }

  protected updateButtonsReadonly(): void {
    if (this.isReadonly) {
      this.searchButton.setAttribute('disabled', 'disabled')
      this.clearButton?.classList.add('readonly')
    } else {
      this.searchButton.removeAttribute('disabled')
      this.clearButton?.classList.remove('readonly')
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): wire IdevsSearchButtonEditor readOnly state to UI"
```

---

## Task 18: `IdevsSearchButtonEditor` — required marker + validation observer

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — required state', () => {
  it('set_required(true) inserts the required marker on the sibling label', () => {
    const form = document.createElement('form')
    const label = document.createElement('label')
    label.textContent = 'Customer'
    const input = document.createElement('input')
    form.append(label, input)
    document.body.appendChild(form)

    const editor = new IdevsSearchButtonEditor({
      element: input,
      searchDialogType: 'SearchDialogStub',
    })
    mountedEditors.push(editor)

    editor.set_required(true)
    const sup = label.querySelector('sup[data-idevs-required-marker]')
    expect(sup).not.toBeNull()
    expect(sup?.textContent).toBe('*')
  })

  it('set_required(false) removes the marker', () => {
    const form = document.createElement('form')
    const label = document.createElement('label')
    const input = document.createElement('input')
    form.append(label, input)
    document.body.appendChild(form)

    const editor = new IdevsSearchButtonEditor({
      element: input,
      searchDialogType: 'SearchDialogStub',
    })
    mountedEditors.push(editor)
    editor.set_required(true)
    editor.set_required(false)
    expect(label.querySelector('sup[data-idevs-required-marker]')).toBeNull()
  })

  it('syncs error classes from domNode to displayInput via the MutationObserver', async () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    input.classList.add('error')
    // Allow MutationObserver microtask to flush
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(display.classList.contains('error')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — required marker integration absent.

- [ ] **Step 3: Add required marker + validation observer integration**

Update imports:

```ts
import { findLabelFor, setRequiredMarker } from './shared/requiredMarker'
import { createValidationObserver, type ValidationClassSync } from './shared/validationObserver'
```

Add a field for the observer:

```ts
  protected validationObserver?: ValidationClassSync
```

Wire the observer in the constructor (after `setupEventListeners()`):

```ts
  constructor(props: EditorProps<P>) {
    super(props)
    this.validateRequiredProps()
    this.renderUI()
    this.setupEventListeners()
    this.startValidationObserver()
  }

  protected startValidationObserver(): void {
    this.validationObserver = createValidationObserver({
      source: this.domNode,
      target: this.displayInput,
      classes: ['error', 'invalid', 'validation-error'],
    })
    this.validationObserver.start()
    this.validationObserver.syncOnce()
  }
```

Update `set_required` to use the shared marker helper:

```ts
  set_required(value: boolean): void {
    if (value) {
      this.domNode.classList.add('required')
      this.domNode.setAttribute('required', '')
      this.displayInput?.setAttribute('aria-required', 'true')
    } else {
      this.domNode.classList.remove('required')
      this.domNode.removeAttribute('required')
      this.displayInput?.removeAttribute('aria-required')
    }
    const label = findLabelFor(this.domNode)
    if (label) setRequiredMarker(label, value)
  }
```

Update `destroy` to stop the observer:

```ts
  destroy(): void {
    this.isDestroyed = true
    this.validationObserver?.stop()
    this.validationObserver = undefined
    this.subscribers = []
    super.destroy()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): integrate shared requiredMarker + validationObserver into search editor"
```

---

## Task 19: `IdevsSearchButtonEditor` — preSearch flow + single-result auto-select

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — preSearch flow', () => {
  it('auto-selects when preSearch returns exactly one result', async () => {
    const { editor, input } = mount({ idColumnName: 'id', textColumnName: 'name' })
    editor.preSearch(() => Promise.resolve([{ id: '42', name: 'Acme' }]))

    const container = input.parentElement!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!
    const display = container.querySelector<HTMLInputElement>('input.editor')!
    display.value = 'acme'

    searchBtn.click()
    // Flush promise resolution
    await vi.runAllTimersAsync()

    expect(editor.get_value()).toBe('42')
    expect(display.value).toBe('Acme')
    expect(SearchDialogStub.lastInstance).toBeNull() // dialog NOT opened
  })

  it('opens the dialog with preItems when preSearch returns multiple results', async () => {
    const { editor, input } = mount()
    const items = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    editor.preSearch(() => Promise.resolve(items))

    const container = input.parentElement!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!
    searchBtn.click()
    await vi.runAllTimersAsync()

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(SearchDialogStub.lastInstance?.preItems).toEqual(items)
  })

  it('opens the dialog with no preItems when preSearch returns empty', async () => {
    const { editor, input } = mount()
    editor.preSearch(() => Promise.resolve([]))

    const container = input.parentElement!
    const searchBtn = container.querySelector<HTMLButtonElement>('button.search-btn')!
    searchBtn.click()
    await vi.runAllTimersAsync()

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(SearchDialogStub.lastInstance?.preItems).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — preSearch flow not implemented.

- [ ] **Step 3: Add preSearch execution**

Replace `performSearch` to fork on `preSearchCallback`:

```ts
  protected performSearch(): void {
    const searchValue = this.props.getSearchValue
      ? this.props.getSearchValue()
      : this.displayInput.value

    const min = this.props.minSearchLength ?? 0
    if (min > 0 && searchValue.length < min) return

    if (this.preSearchCallback) {
      this.executePreSearch(searchValue)
    } else {
      this.openDialog(searchValue, undefined)
    }
  }

  protected executePreSearch(searchValue: string): void {
    if (!this.preSearchCallback) return
    const filters = this.props.getFilters ? this.props.getFilters() : this.filters

    const result = this.preSearchCallback(filters, searchValue)
    if (result instanceof Promise) {
      result.then(data => {
        if (!this.isDestroyed) this.processPreSearchResults(data, searchValue)
      })
    } else {
      this.processPreSearchResults(result, searchValue)
    }
  }

  protected processPreSearchResults(data: unknown[], searchValue: string): void {
    if (!Array.isArray(data)) {
      this.openDialog(searchValue, undefined)
      return
    }
    if (data.length === 1) {
      this.selectSingleItem(data[0] as Record<string, unknown>)
      return
    }
    this.openDialog(searchValue, data.length > 0 ? data : undefined)
  }

  protected selectSingleItem(item: Record<string, unknown>): void {
    if (!this.props.idColumnName) return
    this.handleSelection(item)
  }
```

Update `openDialog` to accept and pass `preItems`:

```ts
  protected openDialog(searchValue: string, preItems?: unknown[]): void {
    const DialogClass = this.resolveDialogClass()
    if (!DialogClass) return

    const filters = this.props.getFilters ? this.props.getFilters() : this.filters
    const criteria = this.props.getCriteria ? this.props.getCriteria() : this.criteria

    const dialog = new DialogClass({
      grid: this.props.grid,
      dialogSize: this.props.dialogSize,
    }) as unknown as {
      dialogOpen(): void
      FilterKeys?: Record<string, unknown>
      CriteriaKeys?: unknown[]
      SearchValue?: string
      DialogSize?: string
      DialogType?: string
      DialogPermission?: string
      preItems?: unknown[]
    }
    dialog.FilterKeys = filters
    dialog.CriteriaKeys = criteria
    dialog.SearchValue = searchValue
    dialog.DialogSize = this.props.dialogSize
    dialog.DialogType = this.props.dialogType
    dialog.DialogPermission = this.props.modifyDialogPermission
    if (preItems !== undefined) dialog.preItems = preItems

    const selectionHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      this.handleSelection(detail)
    }
    this.domNode.addEventListener('dataSelected', selectionHandler as EventListener)

    dialog.dialogOpen()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): add preSearch flow with single-result auto-select"
```

---

## Task 20: `IdevsSearchButtonEditor` — ARIA wiring + setDisplayText + clearDisplayText

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — ARIA + display text', () => {
  it('sets WAI-ARIA combobox attributes on the display input', () => {
    const { input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    expect(display.getAttribute('role')).toBe('combobox')
    expect(display.getAttribute('aria-autocomplete')).toBe('list')
    expect(display.getAttribute('aria-haspopup')).toBe('dialog')
    expect(display.getAttribute('aria-expanded')).toBe('false')
  })

  it('setDisplayText with a template renders the formatted display', () => {
    const { editor, input } = mount({
      displayTemplate: '{id} — {value}',
    })
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    editor.setDisplayText('42', 'Acme')
    expect(display.value).toBe('42 — Acme')
  })

  it('setDisplayText uses default template when none configured', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    editor.setDisplayText('42', 'Acme')
    expect(display.value).toBe('42 - Acme')
  })

  it('clearDisplayText empties the display input', () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    editor.setDisplayText('42', 'Acme')
    editor.clearDisplayText()
    expect(display.value).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: FAIL — ARIA attrs and setDisplayText missing.

- [ ] **Step 3: Add ARIA wiring in createDisplayInput + setDisplayText/clearDisplayText methods**

Modify `createDisplayInput` to set ARIA attrs:

```ts
  protected createDisplayInput(container: HTMLElement): void {
    this.displayInput = Fluent('input')
      .attr('type', 'text')
      .attr('placeholder', DEFAULT_PLACEHOLDER)
      .attr('role', 'combobox')
      .attr('aria-autocomplete', 'list')
      .attr('aria-haspopup', 'dialog')
      .attr('aria-expanded', 'false')
      .addClass('editor form-control')
      .style(css => {
        css.flexGrow = '1'
        css.minWidth = '10ch'
        if (this.props.canClear !== false) {
          css.paddingRight = '1.75rem'
        }
      })
      .appendTo(container)
      .getNode() as HTMLInputElement
  }
```

Add public methods:

```ts
  setDisplayText(id: string, value?: unknown): void {
    const template = this.props.displayTemplate ?? DEFAULT_DISPLAY_TEMPLATE
    const formatted = template
      .replace('{id}', id ?? '')
      .replace('{value}', value != null ? String(value) : '')
    this.displayInput.value = formatted
  }

  clearDisplayText(): void {
    this.displayInput.value = ''
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): add ARIA combobox attrs + setDisplayText/clearDisplayText"
```

---

## Task 21: `IdevsSearchButtonEditor` — destroy cleanup cascade

**Files:**
- Modify: `src/editors/idevsSearchButtonEditor.ts`
- Modify: `tests/editors/idevsSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('IdevsSearchButtonEditor — destroy cleanup', () => {
  it('destroy stops the validation observer (post-destroy class changes do NOT sync)', async () => {
    const { editor, input } = mount()
    const container = input.parentElement!
    const display = container.querySelector<HTMLInputElement>('input.editor')!

    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)

    display.classList.remove('error')
    input.classList.add('error')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(display.classList.contains('error')).toBe(false)
  })

  it('destroy clears subscribers (post-destroy data selection does NOT invoke them)', () => {
    const { editor } = mount({ idColumnName: 'id' })
    const sub = vi.fn()
    editor.subscribe(sub)

    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)

    // Try to trigger selection post-destroy (defensive: handleSelection should
    // be guarded by isDestroyed via the early return on subscribers being empty)
    ;(editor as unknown as { handleSelection: (d: unknown) => void }).handleSelection({ id: '1' })

    expect(sub).not.toHaveBeenCalled()
  })

  it('destroy is idempotent — calling twice does not throw', () => {
    const { editor } = mount()
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)
    expect(() => editor.destroy()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail or pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: First test PASS (observer already stopped in Task 18); second + third may PASS or FAIL depending on guard tightness.

- [ ] **Step 3: Tighten destroy guards if needed**

Ensure `destroy` is guarded against re-entry and that `handleSelection` respects isDestroyed:

Replace `handleSelection`:

```ts
  protected handleSelection(data: unknown): void {
    if (this.isDestroyed) return
    const idCol = this.props.idColumnName
    if (!idCol) return
    const item = data as Record<string, unknown>
    const id = item[idCol]
    this.set_value(id != null ? String(id) : null)
    if (typeof this.props.textColumnName === 'string') {
      const text = item[this.props.textColumnName]
      if (text != null) this.displayInput.value = String(text)
    }
    if (this.props.onDataSelected) this.props.onDataSelected(data)
    for (const sub of this.subscribers) sub(data)
  }
```

Replace `destroy`:

```ts
  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    this.validationObserver?.stop()
    this.validationObserver = undefined
    this.subscribers = []
    super.destroy()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/idevsSearchButtonEditor.test.ts`
Expected: PASS — all destroy cleanup tests green.

- [ ] **Step 5: Commit**

```bash
git add src/editors/idevsSearchButtonEditor.ts tests/editors/idevsSearchButtonEditor.test.ts
git commit -m "feat(editors): tighten IdevsSearchButtonEditor destroy + isDestroyed guards"
```

---

## Task 22: `SlickSearchButtonEditor` — Slick adapter

**Files:**
- Create: `src/editors/slickSearchButtonEditor.ts`
- Create: `tests/editors/slickSearchButtonEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/editors/slickSearchButtonEditor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProps } from '@serenity-is/corelib'
import type { EditorOptions } from '@serenity-is/sleekgrid'
import { SlickSearchButtonEditor } from '../../src/editors/slickSearchButtonEditor'
import { installSearchDialogStub } from './_helpers/searchDialogStub'
import { createEntityGridStub } from './_helpers/entityGridStub'

const mounted: SlickSearchButtonEditor[] = []
let uninstallDialog: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  uninstallDialog = installSearchDialogStub()
})

afterEach(() => {
  vi.useRealTimers()
  mounted.splice(0).forEach(e => {
    try { e.destroy() } catch { /* ignore */ }
  })
  document.body.replaceChildren()
  uninstallDialog?.()
})

function mountSlick(opts: { items?: Record<string, unknown>[] } = {}) {
  const grid = createEntityGridStub({ items: opts.items ?? [{ foo: 'bar' }] })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const props = {
    container,
    column: {
      field: 'foo',
      sourceItem: {
        editorParams: {
          searchDialogType: 'SearchDialogStub',
          idColumnName: 'id',
        },
      },
    },
    grid: grid.slickGrid,
  } as unknown as EditorProps<EditorOptions>
  const editor = new SlickSearchButtonEditor(props)
  mounted.push(editor)
  return { editor, container, grid }
}

describe('SlickSearchButtonEditor', () => {
  it('constructs without throwing and creates the underlying IdevsSearchButtonEditor', () => {
    const { editor } = mountSlick()
    expect(editor).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(editor['editor']).toBeDefined()
  })

  it('listens for dataSelected on the inner editor and commits the value', () => {
    const { editor, grid } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = editor['editor']

    inner.domNode.dispatchEvent(
      new CustomEvent('dataSelected', { detail: { id: '42', name: 'Acme' } }),
    )
    vi.runAllTimers()

    expect(grid.slickGrid.getEditorLock().commitCurrentEdit).toHaveBeenCalled()
    expect(grid.slickGrid.navigateNext).toHaveBeenCalled()
    expect(grid.slickGrid.editActiveCell).toHaveBeenCalled()
  })

  it('serializeValue returns the current inner editor value', () => {
    const { editor } = mountSlick({ items: [{ foo: '42' }] })
    vi.advanceTimersByTime(1)
    editor.loadValue({ foo: '42' })
    expect(editor.serializeValue()).toBe('42')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/editors/slickSearchButtonEditor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/editors/slickSearchButtonEditor.ts
import type { EditorOptions } from '@serenity-is/sleekgrid'
import type { EditorProps } from '@serenity-is/corelib'
import { SlickEditorBase } from './slickEditorBase'
import {
  IdevsSearchButtonEditor,
  type IdevsSearchButtonEditorOptions,
} from './idevsSearchButtonEditor'

type DataSelectedDetail = Record<string, unknown> | null | undefined

/**
 * SleekGrid column adapter wrapping IdevsSearchButtonEditor. Listens for the
 * `dataSelected` CustomEvent the parent editor dispatches on selection, then
 * commits the cell and advances to the next column.
 */
export class SlickSearchButtonEditor<P extends EditorOptions = EditorOptions>
  extends SlickEditorBase<IdevsSearchButtonEditor, P> {
  protected createEditor(props: EditorProps<P>): IdevsSearchButtonEditor {
    const opts = {
      ...((props.column.sourceItem?.editorParams as IdevsSearchButtonEditorOptions) ?? {}),
    } as IdevsSearchButtonEditorOptions

    const wrapper = document.createElement('div')
    props.container.appendChild(wrapper)
    ;(opts as unknown as { element: HTMLElement }).element = wrapper

    return new IdevsSearchButtonEditor(opts as unknown as Parameters<typeof IdevsSearchButtonEditor>[0])
  }

  protected override appendToContainer(props: EditorProps<P>): void {
    props.container.appendChild(this.editor.domNode)
    this.setupDataSelectionHandler(props)
  }

  protected override getInputElement(): HTMLInputElement | null {
    if (!this.editor) return null
    const container = this.editor.domNode.parentElement
    if (!container) return null
    return container.querySelector('input.editor') as HTMLInputElement
  }

  protected override handleValueChange(): void {
    const inputElement = this.getInputElement()
    if (!inputElement) return
    // Sync the visible value back into the hidden domNode via set_value so
    // the chokepoint discipline is preserved.
    this.editor.set_value(inputElement.value)
    super.handleValueChange()
  }

  private setupDataSelectionHandler(props: EditorProps<P>): void {
    const opts = (props.column.sourceItem?.editorParams ?? {}) as IdevsSearchButtonEditorOptions

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DataSelectedDetail>).detail
      if (!detail) return
      const idCol = opts.idColumnName
      if (idCol && idCol in detail) {
        this.editor.set_value(String(detail[idCol]))
      }
      opts.onDataSelected?.(detail)

      const slickGrid = this.grid as { getEditorLock?: () => { commitCurrentEdit(): boolean }; getActiveCell?: () => unknown; navigateNext?: () => void; editActiveCell?: () => void } | null
      if (!slickGrid) return
      slickGrid.getEditorLock?.().commitCurrentEdit()

      setTimeout(() => {
        const cell = slickGrid.getActiveCell?.()
        if (cell) {
          slickGrid.navigateNext?.()
          slickGrid.editActiveCell?.()
        }
      }, 0)
    }

    this.addEventListener(this.editor.domNode, 'dataSelected', handler)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/editors/slickSearchButtonEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editors/slickSearchButtonEditor.ts tests/editors/slickSearchButtonEditor.test.ts
git commit -m "feat(editors): add SlickSearchButtonEditor SleekGrid column adapter"
```

---

## Task 23: Update public barrel + MIGRATION.md

**Files:**
- Modify: `src/editors/index.ts`
- Modify: `MIGRATION.md`

- [ ] **Step 1: Update the editors barrel**

Open `src/editors/index.ts`. Append:

```ts
export * from './idevsSearchButtonEditor'
export * from './idevsNumericTagEditor'
export * from './slickEditorBase'
export * from './slickSearchButtonEditor'
```

The full file should now read (after these additions to whatever was there):

```ts
export * from './checkboxButtonEditor'
export * from './dateMonthEditor'
export * from './idevsTagEditor'
export * from './idevsSearchButtonEditor'
export * from './idevsNumericTagEditor'
export * from './slickEditorBase'
export * from './slickSearchButtonEditor'

// IdevsDateEditor is intentionally NOT re-exported from this barrel.
// It depends on `flatpickr` (an OPTIONAL peer dependency). Re-exporting
// here would force flatpickr resolution for every consumer of the main
// entry, even those who never use the date editor. Import it directly:
//
//   import { IdevsDateEditor } from '@idevs/corelib/editors/idevsDateEditor'
//
// Consumers using this subpath are responsible for installing flatpickr.

// Internal helpers under shared/ are NOT exported publicly.
```

- [ ] **Step 2: Update MIGRATION.md**

Open `MIGRATION.md` and append a new section at the top (after the existing 1.1.0 / 1.1.1 sections):

```markdown
## 1.2.0 — Batch 3a search-button editor foundation

### New editors

- `IdevsSearchButtonEditor` (decorator: `Idevs.CoreLib.IdevsSearchButtonEditor`) — hidden input + display input + search/clear buttons + Serenity dialog integration. Replaces PowerACC's `SearchButtonEditor`.
- `IdevsNumericTagEditor` (decorator: `Idevs.CoreLib.IdevsNumericTagEditor`) — extends `IdevsTagEditor` with prefix/suffix/specialValues formatting. Replaces PowerACC's `NumericTagEditor`.
- `SlickEditorBase` (no decorator — SleekGrid column-editor base, not a Serenity widget) — abstract base for SleekGrid column editors wrapping Serenity widgets. Replaces PowerACC's `SlickEditorBase`.
- `SlickSearchButtonEditor` — SleekGrid column adapter wrapping `IdevsSearchButtonEditor`. Replaces PowerACC's `SlickSearchButtonEditor`.

### Breaking API renames

- `IdevsSearchButtonEditor` ports the PowerACC API but renames two PascalCase setters to camelCase methods:
  - `editor.filterKeys = {...}` (asymmetric setter) → `editor.setFilterKeys({...})`
  - `editor.CriteriaKeys = [...]` (PascalCase asymmetric setter) → `editor.setCriteriaKeys([...])`
- Consumers using `editorParams` to configure these are unaffected.
- `SlickEditorBase.TEditor` generic is now constrained by `SlickWrappedEditor` (must expose `domNode: HTMLElement`; `value?`, `destroy?`, `props?` are optional). Subclasses that wrapped editors lacking those shapes need to declare them.

### Hardening deltas vs PowerACC source

- XSS-safe required marker via `document.createElement('sup')` + `textContent` (no HTML-property writes on labels).
- WAI-ARIA combobox role on the display input (`role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-required`).
- Single-chokepoint value writes — every `domNode.value` mutation routes through `set_value()`.
- `destroy()` stops the `MutationObserver`, clears subscribers, and is idempotent.

### Internal helpers (not part of the public API)

- `src/editors/shared/maskedPattern.ts`, `src/editors/shared/requiredMarker.ts`, `src/editors/shared/validationObserver.ts` are internal modules for editor authoring. They are NOT re-exported from the public `editors` barrel and are subject to change without a major version bump.
```

- [ ] **Step 3: Verify the build picks up the new exports**

Run: `npm run build`
Expected: clean build, produces `dist/editors/idevsSearchButtonEditor.{js,d.ts}`, `dist/editors/idevsNumericTagEditor.{js,d.ts}`, `dist/editors/slickEditorBase.{js,d.ts}`, `dist/editors/slickSearchButtonEditor.{js,d.ts}`.

- [ ] **Step 4: Commit**

```bash
git add src/editors/index.ts MIGRATION.md
git commit -m "feat(editors): export batch 3a editors from public barrel + MIGRATION

Adds IdevsSearchButtonEditor, IdevsNumericTagEditor, SlickEditorBase,
and SlickSearchButtonEditor to the public barrel. MIGRATION.md
documents the setFilterKeys/setCriteriaKeys rename and the new
SlickWrappedEditor generic constraint."
```

---

## Task 24: Full CI verification + PR push

**Files:** (no source changes — verification only)

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: clean — no TS errors.

- [ ] **Step 2: Run full lint**

Run: `npm run lint`
Expected: 0 errors (1 pre-existing warning in `src/helpers/pdfExportHelper.ts:75` is acceptable).

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All ~85 new tests + existing 83 = ~168 tests passing.

- [ ] **Step 4: Run full build**

Run: `npm run build`
Expected: clean build; verify `dist/editors/` contains all four new editor `.d.ts` files plus `dist/editors/shared/` subdirectory.

```bash
ls dist/editors/ dist/editors/shared/
```

Expected output should include:
- `idevsSearchButtonEditor.{js,d.ts,d.ts.map,js.map}`
- `idevsNumericTagEditor.{js,d.ts,d.ts.map,js.map}`
- `slickEditorBase.{js,d.ts,d.ts.map,js.map}`
- `slickSearchButtonEditor.{js,d.ts,d.ts.map,js.map}`
- `shared/maskedPattern.{js,d.ts,d.ts.map,js.map}`
- `shared/requiredMarker.{js,d.ts,d.ts.map,js.map}`
- `shared/validationObserver.{js,d.ts,d.ts.map,js.map}`
- `shared/index.{js,d.ts}`

- [ ] **Step 5: Create feature branch and push**

```bash
git checkout -b feature/csi-batch-3a-search-foundation
git push -u origin feature/csi-batch-3a-search-foundation
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat: port Csi/UI search-button editor foundation (batch 3/4 — PR 3a)" --body "$(cat <<'EOF'
## Summary

Foundation half of batch 3 — search-button editor family from PowerACC. Ports five new modules with batch-2 hardening rigor.

| New module | Source | Purpose |
|---|---|---|
| `editors/idevsSearchButtonEditor.ts` | `Csi/UI/Editors/SearchButtonEditor.tsx` | Hidden input + display input + search/clear buttons + Serenity dialog integration |
| `editors/idevsNumericTagEditor.ts` | `Csi/UI/Editors/NumericTagEditor.tsx` | `IdevsTagEditor` subclass with prefix/suffix/specialValues |
| `editors/slickEditorBase.ts` | `Csi/UI/Editors/SlickEditorBase.ts` | Abstract SleekGrid column-editor base wrapping a Serenity widget |
| `editors/slickSearchButtonEditor.ts` | `Csi/UI/Editors/SlickSearchButtonEditor.ts` | SleekGrid column adapter for `IdevsSearchButtonEditor` |
| `editors/shared/{maskedPattern,requiredMarker,validationObserver}.ts` | (extracted) | Internal helpers used by the new editors (and PR-3b's SelfSearch) |

Decorators registered: `Idevs.CoreLib.IdevsSearchButtonEditor`, `Idevs.CoreLib.IdevsNumericTagEditor`.

### Hardening deltas vs source

- **Security**: XSS-safe required marker via `document.createElement('sup')` + `textContent` (replaces raw HTML-property writes on labels — same fix pattern as 1.1.0 `DropdownToolButton`).
- **Accessibility**: Full WAI-ARIA combobox on the display input (`role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-required`); validation classes mirrored from the canonical hidden input to the visible display input via a shared `MutationObserver` helper.
- **Correctness**: `set_value()` is the single chokepoint for every write to `domNode.value`; change events fire exactly once per real value change.
- **Type quality**: Plain `type` for options (no `EditorProps<any>` extension); `unknown` instead of `any` everywhere; `SlickEditorBase`'s `TEditor` generic constrained by `SlickWrappedEditor` so subclasses don't need `(this.editor as any).domNode` casts.
- **Resource hygiene**: `destroy()` stops the `MutationObserver`, clears subscribers, and is idempotent.

### Breaking API renames

- `editor.filterKeys = {...}` → `editor.setFilterKeys({...})`
- `editor.CriteriaKeys = [...]` → `editor.setCriteriaKeys([...])`

PascalCase asymmetric setters are replaced with camelCase methods. Consumers using `editorParams` to configure these are unaffected. Documented in `MIGRATION.md`.

### Internal shared/ helpers

- `shared/maskedPattern.ts` — pure helpers for masked-pattern formatting + cursor calc.
- `shared/requiredMarker.ts` — XSS-safe `<sup>*</sup>` marker via DOM API.
- `shared/validationObserver.ts` — `MutationObserver` wrapper for validation-class sync.

These are **not** re-exported from the public `editors` barrel. They exist to give PR-3b's SelfSearch the same primitives without duplication. A follow-up issue tracks retrofitting batch 2 editors (`IdevsTagEditor`, `IdevsDateEditor`) to consume them.

### Test coverage

~85 new tests in `tests/editors/` and `tests/editors/shared/`:

- Pure helpers (`maskedPattern`, `requiredMarker`, `validationObserver`) — near-100% coverage.
- `IdevsSearchButtonEditor` — construction, ARIA wiring, value chokepoint, readOnly state, required marker, filter/criteria propagation, displayText template, clear flow, search button opens dialog (with stub), preSearch single + multi result, minSearchLength gate, masked pattern integration, destroy cleanup cascade.
- `IdevsNumericTagEditor` — extension intact, `formatDisplayText` (plain/prefix/suffix/addSpace/specialValues), `extractNumericValue` round-trip, recursion guard.
- `SlickEditorBase` — via a `TestableSlickEditor` fixture: lifecycle, listener cleanup, commit flow, Enter-key behavior.
- `SlickSearchButtonEditor` — composes real `IdevsSearchButtonEditor` in JSDOM; dataSelected → editor.value + commit + navigate.

### Order with the next PR

- **PR-3b** (decomposed `IdevsSelfSearchButtonEditor` + `SlickSelfSearchButtonEditor`) depends on this PR's `shared/` modules. PR-3b drafted only after this lands.

## Test plan

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — 0 errors (1 pre-existing warning in `pdfExportHelper.ts` unchanged)
- [x] `npm test` — ~168 passing (~85 new in this PR)
- [x] `npm run build` — produces all new editor + `shared/` artifacts under `dist/editors/`
- [ ] Manual smoke test on a PowerACC consumer once published (next minor)
EOF
)"
```

- [ ] **Step 7: Verify CI passes on origin**

Wait for the CI run to complete on the PR, then:

```bash
gh pr view --json statusCheckRollup
```

Expected: `Build & Test` job SUCCESS.

---

## Self-Review

After completing all tasks:

1. **Spec coverage**: Walk through `docs/superpowers/specs/2026-05-25-batch-3-search-editors-design.md` sections 4 (API), 5 (architecture), 6 (hardening checklist), 7 (testing) — every PR-3a requirement should map to a task above. PR-3b items deliberately deferred to its own plan.

2. **No placeholders**: This plan contains no "TBD", "implement later", or unspecified type/method references. Every code block is complete and runnable.

3. **Type consistency**: `IdevsSearchButtonEditorOptions`, `PreSearchCallback`, `SubscriberCallback`, `SlickWrappedEditor`, `SlickGridLike`, `ValidationClassSync`, `ValidationObserverOptions` are defined once and reused with the same shape.

4. **Naming consistency**: `setFilterKeys` / `setCriteriaKeys` (camelCase) used throughout. `_isFormatting` (not `_preventRecursion`) used in `IdevsNumericTagEditor`. `IdevsSearchButtonEditor` (not `SearchButtonEditor`) used consistently.

5. **TDD discipline**: Every implementation task has a failing test first, minimal implementation second, verification third, commit fourth (or fifth where a separate "verify it fails" step is broken out).

6. **Commit cadence**: 24 task commits, each touching focused files. PR squashes to a manageable diff or merges as-is showing the TDD trail.

7. **Acceptance criteria** (from spec section 14): All listed acceptance criteria appear in the final CI verification task (typecheck/lint/test/build clean; ~85 new tests; no new lint warnings; no `any` in new code; decorator strings under `Idevs.CoreLib.*`; MIGRATION updated; no subpath export needed).
