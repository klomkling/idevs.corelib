import { Fluent, Toolbar, type PrefixedContext } from '@serenity-is/corelib'

/**
 * Generic dialog/modal helpers ported from PowerACC's Dialogs.ts. The
 * existing `dialogHelper.ts` (singular) hosts the DialogHelper class and a
 * handful of validators/utilities; this file (plural) adds the rest of the
 * PowerACC-generic helpers without disturbing the existing module.
 *
 * PowerACC's domain-specific parameter types (RequestApprovalParameter,
 * BookingRequestApprovalParameter, RequestPrintShippingMarkParameter, etc.)
 * are intentionally NOT ported — they belong in PowerACC's app code.
 */

// ──────────────────────────────────────────────────────────────────────────
// Dialog sizing
// ──────────────────────────────────────────────────────────────────────────

export type IDialogSize = {
  width?: number
  height?: number
}

/**
 * Use within `onDialogOpen()` AFTER the super call. Sizes the modal dialog
 * to the supplied width/height (or measured height when not specified) and
 * centers it on the viewport.
 *
 * Selector source (in priority order):
 *   1. `opt.selector` if supplied — preferred; immune to minification.
 *   2. `.s-<className>` derived from `dialog.constructor.name` — preserves
 *      PowerACC source behavior, but **breaks under JS minification**
 *      (class names mangle to `t`, `Y`, etc.). Production consumers using
 *      a minifier should pass `opt.selector` explicitly.
 */
export function setDialogSize(
  dialog: object,
  opt?: IDialogSize & { selector?: string },
): void {
  const name = opt?.selector ?? `.s-${dialog.constructor.name}`
  const optionH = opt?.height ?? 0
  const measuredH = ($(`${name} .modal-dialog`).innerHeight() ?? 0) as number
  const h = optionH > 0 ? optionH : measuredH
  const w = opt?.width ?? 420
  $(name)
    .css({ width: `${w}px`, height: `${h}px` })
    .position({
      of: window,
      my: 'center center',
      at: 'center center',
    })
}

/**
 * Wire a touchstart-to-click handler on every close button matching
 * `<cssClass> .ui-dialog-titlebar-close`. Workaround for older mobile
 * browsers where the titlebar close button needs an explicit synthetic click.
 */
export function fixMobileCloseDialog(cssClass: string): void {
  cssClass = cssClass.trim()
  cssClass = `${cssClass[0] === '.' ? '' : '.'}${cssClass}`
  document.querySelectorAll(`${cssClass} .ui-dialog-titlebar-close`).forEach(el => {
    ;(el as HTMLElement).addEventListener('touchstart', evt => {
      const btn = evt.target as HTMLElement | null
      btn?.click()
    })
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Field grouping
// ──────────────────────────────────────────────────────────────────────────

/**
 * Group fields together in a single wrapper div. Each tuple is
 * `[fieldClassName, colWidthClassesToApply]`. The first tuple's class
 * + '_group' becomes the wrapper class. Idempotent (no-op when the wrapper
 * already exists).
 */
export function groupFields(
  domNode: HTMLElement,
  classNames: [string, string][],
  groupCssClass: string,
): void {
  const elements: HTMLElement[] = classNames
    .map(([cls]) => domNode.querySelector<HTMLElement>(`.${cls}`))
    .filter((el): el is HTMLElement => el !== null)

  // Bail if any of the requested fields weren't found.
  if (elements.length !== classNames.length) return

  const groupName = `${classNames[0][0]}_group`
  const existing = domNode.querySelector<HTMLElement>(`.${groupName}`)
  if (existing) return

  const groupDiv = document.createElement('div')
  groupDiv.classList.add('field', 'p-0', groupName, ...groupCssClass.split(' ').filter(Boolean))

  const rootElement = elements[0].parentElement
  if (!rootElement) return
  rootElement.insertBefore(groupDiv, elements[0])

  classNames.forEach(([, colWidth], index) => {
    const element = elements[index]
    // Strip any existing col-* classes
    Array.from(element.classList)
      .filter(c => c.startsWith('col-'))
      .forEach(c => element.classList.remove(c))
    // Apply requested col classes
    element.classList.add(...colWidth.split(' ').filter(Boolean))
    groupDiv.appendChild(element)
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Modal stack (active/inactive layering)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Restore the most-recently-active modal at or below `currentLevel` by
 * removing its `modal-inactive` class. Inputs are HTML elements stamped
 * with `data-qrouterorder` indicating their nesting depth.
 */
export function setActiveModal(currentLevel: number): void {
  let previousDialog: HTMLElement | undefined
  let maxOrder = -1
  document.querySelectorAll<HTMLElement>('.modal[data-qrouterorder]').forEach(el => {
    const level = parseInt(Fluent(el).attr('data-qrouterorder') ?? '0', 10)
    if (level < currentLevel && level > maxOrder) {
      maxOrder = level
      previousDialog = el
    }
  })
  previousDialog?.classList.remove('modal-inactive')
}

/**
 * Mark all modals below `currentModel`'s level as `modal-inactive`. If
 * `includeCurrent` is true, also marks the current model. Deferred by 100ms
 * to match PowerACC's source behavior (allows the new modal to mount first).
 */
export function setInactiveModal(currentModel: HTMLElement, includeCurrent?: boolean): void {
  if (!currentModel.classList.contains('modal-body')) return

  setTimeout(() => {
    const parent = currentModel.closest('.modal')
    if (!parent) return
    const currentLevel = parseInt(Fluent(parent).attr('data-qrouterorder') ?? '0', 10)
    document.querySelectorAll<HTMLElement>('.modal[data-qrouterorder]').forEach(el => {
      const level = parseInt(Fluent(el).attr('data-qrouterorder') ?? '0', 10)
      if (level < currentLevel && !el.classList.contains('modal-inactive')) {
        Fluent(el).addClass('modal-inactive')
      }
      if (includeCurrent) (parent as HTMLElement).classList.add('modal-inactive')
    })
  }, 100)
}

// ──────────────────────────────────────────────────────────────────────────
// Radio-button enable/disable
// ──────────────────────────────────────────────────────────────────────────

export function disableRadioButtons(element: HTMLElement): void {
  element.querySelectorAll<HTMLElement>('.s-RadioButtonEditor').forEach(field => {
    field.setAttribute('disabled', 'disabled')
    field.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach(child => {
      child.setAttribute('disabled', 'disabled')
    })
  })
}

export function enableRadioButtons(element: HTMLElement): void {
  element.querySelectorAll<HTMLElement>('.s-RadioButtonEditor').forEach(field => {
    field.removeAttribute('disabled')
    field.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach(child => {
      child.removeAttribute('disabled')
    })
  })
}

export function enableRadioButtonEditor(element: HTMLElement): void {
  element.removeAttribute('disabled')
  element.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach(child => {
    child.removeAttribute('disabled')
  })
}

export function disableRadioButtonEditor(element: HTMLElement): void {
  element.setAttribute('disabled', 'disabled')
  element.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach(child => {
    child.setAttribute('disabled', 'disabled')
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Generic editor enable/disable
// ──────────────────────────────────────────────────────────────────────────

type ReadOnlyEditor = { set_readOnly(value: boolean): void }

function trySetReadOnly(element: HTMLElement, readOnly: boolean): boolean {
  const widget = Fluent(element).getWidget() as ReadOnlyEditor | undefined
  if (widget && typeof widget.set_readOnly === 'function') {
    widget.set_readOnly(readOnly)
    return true
  }
  return false
}

/**
 * Enable an editor by class-based detection. Handles RadioButtonEditor,
 * IdevsSearchButtonEditor (`.s-IdevsSearchButtonEditor`), IdevsTagEditor
 * (`.s-IdevsTagEditor`), IdevsNumericTagEditor, plus a generic
 * remove-readonly fallback. Special-cases IdevsDateEditor's trigger-button
 * opacity.
 */
export function enableEditor(element: HTMLElement): void {
  if (element.classList.contains('s-RadioButtonEditor')) {
    enableRadioButtonEditor(element)
  } else if (
    element.classList.contains('s-IdevsSearchButtonEditor') ||
    element.classList.contains('s-IdevsSelfSearchButtonEditor') ||
    element.classList.contains('s-IdevsTagEditor') ||
    element.classList.contains('s-IdevsNumericTagEditor') ||
    // Legacy class names from PowerACC's Csi* editors — retained for
    // migration period; can be removed once consumers update.
    element.classList.contains('s-SearchButtonEditor') ||
    element.classList.contains('s-TagEditor') ||
    element.classList.contains('s-NumericTagEditor')
  ) {
    trySetReadOnly(element, false)
  } else {
    element.classList.remove('readonly')
    element.removeAttribute('readonly')
  }

  // IdevsDateEditor: restore the trigger button opacity.
  if (
    element.classList.contains('s-IdevsDateEditor') ||
    element.classList.contains('s-DateEditor') ||
    element.classList.contains('s-CsiDateEditor')
  ) {
    const btn = element.parentElement?.querySelector<HTMLElement>('.ui-datepicker-trigger')
    btn?.style.removeProperty('opacity')
  }
}

export function disableEditor(element: HTMLElement): void {
  if (element.classList.contains('s-RadioButtonEditor')) {
    disableRadioButtonEditor(element)
  } else if (
    element.classList.contains('s-IdevsSearchButtonEditor') ||
    element.classList.contains('s-IdevsSelfSearchButtonEditor') ||
    element.classList.contains('s-IdevsTagEditor') ||
    element.classList.contains('s-IdevsNumericTagEditor') ||
    element.classList.contains('s-SearchButtonEditor') ||
    element.classList.contains('s-SelfSearchButtonEditor') ||
    element.classList.contains('s-TagEditor') ||
    element.classList.contains('s-NumericTagEditor')
  ) {
    trySetReadOnly(element, true)
  } else {
    element.classList.add('readonly')
    element.setAttribute('readonly', 'readonly')
  }

  if (
    element.classList.contains('s-IdevsDateEditor') ||
    element.classList.contains('s-DateEditor') ||
    element.classList.contains('s-CsiDateEditor')
  ) {
    const btn = element.parentElement?.querySelector<HTMLElement>('.ui-datepicker-trigger')
    if (btn) btn.style.opacity = '0.1'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Toolbar button state
// ──────────────────────────────────────────────────────────────────────────

export function disableToolbarButton(toolbar: Toolbar, buttonCssClass: string): void {
  const button = toolbar.findButton(buttonCssClass)
  if (!button) return
  setTimeout(() => {
    button.addClass('disabled')
    button.attr('disabled', 'disabled')
  }, 0)
}

export function enableToolbarButton(toolbar: Toolbar, buttonCssClass: string): void {
  const button = toolbar.findButton(buttonCssClass)
  if (!button) return
  setTimeout(() => {
    button.removeClass('disabled')
    button.removeAttr('disabled')
  }, 0)
}

// ──────────────────────────────────────────────────────────────────────────
// Input validation message
// ──────────────────────────────────────────────────────────────────────────

/**
 * Toggle an inline error message next to a form field. The PowerACC source
 * used `innerHTML` to build the error label (XSS vector if the message
 * comes from user input); this port uses DOM API + textContent.
 */
export function toggleInputValidateMessage(
  form: PrefixedContext,
  fieldName: string,
  message: string,
): void {
  const input = (form as unknown as Record<string, { domNode: HTMLInputElement }>)[fieldName]
    ?.domNode
  if (!input) return
  const sibling = input.nextElementSibling
  if (!sibling) return

  if (message) {
    input.classList.remove('valid')
    input.classList.add('error')
    // Clear existing content; rebuild via DOM API (no innerHTML).
    while (sibling.firstChild) sibling.removeChild(sibling.firstChild)
    const label = document.createElement('label')
    label.classList.add('error')
    label.setAttribute('id', `${input.id}-error`)
    label.setAttribute('for', input.id)
    label.setAttribute('title', `${message}.`)
    label.textContent = `${message}.`
    sibling.appendChild(label)
  } else {
    input.classList.remove('error')
    input.classList.add('valid')
    while (sibling.firstChild) sibling.removeChild(sibling.firstChild)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Search button wiring
// ──────────────────────────────────────────────────────────────────────────

export type SearchDialogOptions<F extends PrefixedContext> = {
  form: F
  fieldName: keyof F
  buttonClass: string
  filterKey?: string
  dialogClass: new (P: Record<string, unknown>) => {
    dialogOpen(): void
    element: [HTMLElement]
    FilterKey?: unknown
  }
  callback: (form: F, data: unknown) => void
}

/**
 * Add an in-place search button to a form field. Clicking the button opens
 * the supplied dialog class; when the dialog closes with detail data, the
 * callback fires with the form and detail. Idempotent (no-op when the
 * button class already exists on the page).
 */
export function addSearchButton<F extends PrefixedContext>(options: SearchDialogOptions<F>): void {
  const fieldHolder = (options.form as unknown as Record<string, { domNode: HTMLElement }>)[
    options.fieldName as string
  ]
  if (!fieldHolder?.domNode?.parentElement) return

  const fieldParent = fieldHolder.domNode.parentElement

  // Idempotency check scoped to THIS field's parent (was document-global).
  // Multiple forms/dialogs sharing a buttonClass — common when the same
  // search-button helper is wired up on every customer/order form on a
  // page — would have left every form after the first one without a
  // button. The scoped check still prevents double-injection on the
  // target field while allowing siblings to receive their own button.
  if (fieldParent.querySelector(`.${options.buttonClass}`)) return

  const btn = document.createElement('button')
  btn.setAttribute('type', 'button')
  btn.classList.add('inplace-button', options.buttonClass)
  btn.setAttribute('aria-label', 'Search')

  const icon = document.createElement('i')
  icon.classList.add('bi', 'bi-search')
  btn.appendChild(icon)

  const ref = fieldParent.querySelector('.vx')
  fieldParent.insertBefore(btn, ref)

  btn.onclick = () => {
    const dlg = new options.dialogClass({})
    if (options.filterKey) {
      const filterField = (options.form as unknown as Record<string, { value: unknown }>)[
        options.filterKey
      ]
      dlg.FilterKey = filterField?.value
    }
    dlg.dialogOpen()
    // `{ once: true }` so the listener removes itself after firing once.
    // Without it, every button click added a fresh listener — opening
    // and closing the dialog N times would invoke the consumer's
    // callback N times on the (N+1)th close.
    // Wrapped in try/catch so a thrown consumer callback can't bubble
    // into Bootstrap/jQuery's event dispatch (which can leave the
    // dialog in an inconsistent state).
    dlg.element[0].addEventListener(
      'onDialogClose',
      (e: Event) => {
        const detail = (e as CustomEvent).detail
        try {
          options.callback(options.form, detail)
        } catch {
          /* Consumer callback errors should not corrupt dialog teardown.
           * Swallow here; Serenity's own onError pathways surface details. */
        }
      },
      { once: true },
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Dialog event constants
// ──────────────────────────────────────────────────────────────────────────

/**
 * Standard dialog event names dispatched on the dialog's root element via
 * `CustomEvent`. Renamed from PowerACC's `CsiDialogEventName`.
 */
export class IdevsDialogEventName {
  static readonly DialogOpen = 'onDialogOpen'
  static readonly DialogClose = 'onDialogClose'
  static readonly DialogSave = 'onDialogSave'
  static readonly DialogDelete = 'onDialogDelete'
}

export function createCustomEvent<T = unknown>(eventName: string, detail: T): CustomEvent<T> {
  return new CustomEvent<T>(eventName, { detail })
}
