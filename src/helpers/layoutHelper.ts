import { Fluent, Toolbar } from '@serenity-is/corelib'

/**
 * DOM/layout helpers ported from PowerACC's LayoutHelper. The PowerACC source
 * attached the first 7 of these as prototype extensions on `HTMLElement`
 * (e.g., `element.createLayout(...)`). They are exposed here as plain
 * functions to avoid polluting the global prototype:
 *
 *   // PowerACC:
 *   element.createLayout(3, 'col')
 *
 *   // idevs.corelib:
 *   import { createLayout } from '@idevs/corelib/helpers'
 *   createLayout(element, 3, 'col')
 *
 * Behavioral parity is preserved otherwise.
 */

// ──────────────────────────────────────────────────────────────────────────
// Converted from PowerACC prototype extensions
// ──────────────────────────────────────────────────────────────────────────

/**
 * Insert `columns` div children into `parent`, optionally anchored before/
 * after a reference child matched by `refChildCssClass`. The returned array
 * is in left-to-right order.
 */
export function createLayout(
  parent: HTMLElement,
  columns: number,
  cssClass: string | string[],
  refChildCssClass?: string,
): HTMLElement[] {
  const divCollection: HTMLElement[] = []
  let isAfter: boolean
  let refChild: ChildNode | Element | null

  if (refChildCssClass) {
    refChild = parent.querySelector(`.${refChildCssClass}`)
    isAfter = !!refChild
  } else {
    refChild = parent.firstChild
    isAfter = false
  }

  const insertBeforeReference = (div: HTMLElement) => {
    parent.insertBefore(div, refChild as Node | null)
  }
  const insertAfterReference = (div: HTMLElement) => {
    parent.insertBefore(div, (refChild as ChildNode | null)?.nextSibling ?? null)
  }

  for (let i = 0; i < columns; i++) {
    const div = document.createElement('div')
    if (Array.isArray(cssClass)) {
      div.className = i > cssClass.length - 1 ? cssClass[cssClass.length - 1] : cssClass[i]
    } else {
      div.className = cssClass
    }
    divCollection.push(div)

    if (isAfter) {
      insertAfterReference(div)
      refChild = div
    } else {
      if (i === 0) insertBeforeReference(div)
      else insertAfterReference(div)
      refChild = div
    }
  }

  return divCollection
}

/**
 * Create a new div wrapper inside `parent`, gathering elements either by
 * CSS-class lookup against `source` (string arg) or by direct reference
 * (HTMLElement arg). Returns the new wrapper.
 */
export function addElementGroup(
  parent: HTMLElement,
  source: HTMLElement,
  cssClass: string,
  ...args: Array<HTMLElement | string>
): HTMLElement {
  const div = document.createElement('div')
  if (cssClass) div.className = cssClass

  for (const arg of args) {
    if (typeof arg === 'string') {
      const selectors = arg.split(',').map(c => `:scope .${c.trim()}`).join(', ')
      source.querySelectorAll<HTMLElement>(selectors).forEach(el => div.appendChild(el))
    } else {
      div.appendChild(arg)
    }
  }

  parent.appendChild(div)
  return div
}

/**
 * Create a new div, optionally gathering children matching `target` (a
 * comma-separated CSS-class list) from `source`. Returns the new div
 * without appending it anywhere.
 */
export function createGroup(
  source: HTMLElement,
  cssClass?: string,
  target?: string,
): HTMLElement {
  const div = document.createElement('div')
  if (cssClass) div.className = cssClass
  if (target) {
    const selectors = target.split(',').map(c => `:scope .${c.trim()}`).join(', ')
    source.querySelectorAll<HTMLElement>(selectors).forEach(el => div.appendChild(el))
  }
  return div
}

/**
 * Append elements (or class-matched elements) into `parent`.
 */
export function addElements(
  parent: HTMLElement,
  source: HTMLElement,
  ...args: Array<HTMLElement | string>
): void {
  for (const arg of args) {
    if (typeof arg === 'string') {
      const selectors = arg.split(',').map(c => `:scope .${c.trim()}`).join(', ')
      source.querySelectorAll<HTMLElement>(selectors).forEach(t => parent.appendChild(t))
    } else {
      parent.appendChild(arg)
    }
  }
}

/**
 * Append elements + pad with `emptyCount` empty `.field` divs.
 */
export function addElementsWithEmptyElement(
  parent: HTMLElement,
  source: HTMLElement,
  emptyCount: number,
  ...args: Array<HTMLElement | string>
): void {
  addElements(parent, source, ...args)
  for (let i = 0; i < emptyCount; i++) {
    const div = document.createElement('div')
    div.classList.add('field')
    parent.appendChild(div)
  }
}

/**
 * Assign sequential `tabindex` values to inputs within each field. Handles
 * radio (`label > input`), textarea (`div > textarea`), normal inputs
 * (`div > input`), and DropdownEditor (anchor-wrapped input with
 * `tabindex="-1"`). Returns the next available tab index.
 */
export function setTabIndex(
  scope: HTMLElement,
  startIdx: number,
  ...args: Array<HTMLElement | string>
): number {
  let idx = startIdx

  const apply = (target: HTMLElement, currentIdx: number): number => {
    let el = target.querySelector<HTMLElement>('label > input')
    if (el) {
      el.setAttribute('tabindex', currentIdx.toString())
      return currentIdx + 1
    }
    el = target.querySelector<HTMLElement>('div > textarea')
    if (el) {
      el.setAttribute('tabindex', currentIdx.toString())
      return currentIdx + 1
    }
    el = target.querySelector<HTMLElement>('div > input')
    if (!el) return currentIdx
    const existing = el.getAttribute('tabindex')
    if (existing === '-1') {
      const inner = target.querySelector<HTMLElement>('a > input')
      if (inner) el = inner
    }
    el.setAttribute('tabindex', currentIdx.toString())
    return currentIdx + 1
  }

  for (const arg of args) {
    if (typeof arg === 'string') {
      const selectors = arg.split(',').map(c => `.${c.trim()}`).join(', ')
      scope.querySelectorAll<HTMLElement>(selectors).forEach(target => {
        idx = apply(target, idx)
      })
    } else {
      idx = apply(arg, idx)
    }
  }
  return idx
}

// ──────────────────────────────────────────────────────────────────────────
// SlickGrid column header utilities
// ──────────────────────────────────────────────────────────────────────────

/**
 * Group `columnCount` adjacent SlickGrid columns under a shared header
 * titled `title`. The `columnName` argument identifies the first column;
 * subsequent siblings are pulled in until `columnCount` is reached.
 *
 * NOTE: this manipulates SlickGrid's internal DOM (`.slick-header`,
 * `.slick-header-columns`, `.slick-header-column`, `.slick-resizable-handle`).
 * Behavior may change if SlickGrid's DOM structure changes upstream.
 */
export function groupColumnHeader(
  domNode: HTMLElement,
  title: string,
  columnName: string,
  columnCount: number,
  height: number,
): void {
  const gridHeader = domNode.querySelector<HTMLElement>('.slick-header')
  if (!gridHeader) return
  const headerColumns = gridHeader.querySelector<HTMLElement>('.slick-header-columns')
  if (!headerColumns) return
  const headerRect = headerColumns.getClientRects().item(0)
  height = height ?? headerRect?.height ?? 0

  const columns: string[] = [columnName]
  // Escape `columnName` for CSS attribute selector safety — column names
  // can include characters that need quoting (or break the selector
  // entirely). CSS.escape handles all required cases.
  const escapedColumnName = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(columnName)
    : columnName.replace(/(["\\[\]])/g, '\\$1')
  let targetColumn = domNode.querySelector<HTMLElement>(`[id$="${escapedColumnName}"]`)
  if (!targetColumn) return
  const prefix = (targetColumn.getAttribute('id') ?? '').replace(columnName, '')
  let width = targetColumn.getClientRects().item(0)?.width ?? 0

  for (let i = 0; i < columnCount - 1; i++) {
    const next = targetColumn.nextElementSibling as HTMLElement | null
    if (next) {
      const name = (next.getAttribute('id') ?? '').replace(prefix, '')
      columns.push(name)
      width += next.getClientRects().item(0)?.width ?? 0
      targetColumn = next
    }
  }

  const prev = targetColumn.previousElementSibling as HTMLElement | null
  const newColumn = Fluent('div')
    .attr('id', `${columnName}Group`)
    .class(['slick-header-column', 'ui-state-default', 'd-flex', 'flex-column', 'px-0'])
    .attr('data-id', columnName)
    .attr('draggable', 'false')
    .style(css => {
      css.width = `${width}px`
    })
    .insertBefore(prev as HTMLElement)

  // Title row — text via textContent (no innerHTML)
  const titleEl = Fluent('div')
    .style(css => {
      css.height = `${height - 1}px`
      css.borderBottom = '2px solid #ddd'
    })
    .class(['w-100', 'text-center'])
    .attr('draggable', 'false')
    .attr('id', `${columnName}GroupTitle`)
    .appendTo(newColumn)
    .getNode()
  titleEl.textContent = title

  const groupPanel = Fluent('div')
    .class(['w-100', 'h-100', 'd-flex', 'align-items-center'])
    .attr('draggable', 'false')
    .appendTo(newColumn)

  Array.from(headerColumns.children).forEach((c: Element) => {
    const child = Fluent(c as HTMLElement)
    const childName = (child.attr('id') ?? '').replace(prefix, '')
    if (childName && !columns.includes(childName) && !child.hasClass('group-member')) {
      child.style(css => {
        css.height = `${height * 2 - 2}px`
        css.display = 'flex'
        css.alignItems = 'center'
      })
      if (childName !== `${columnName}Group`) {
        child.findFirst('.slick-column-name')?.style(css => {
          css.whiteSpace = 'normal'
        })
      }
    } else {
      child.findFirst('.slick-resizable-handle')?.remove()
      if (childName !== columnName) {
        // Scope the lookup to this grid's domNode (was `document.querySelector`
        // — would bind to the WRONG grid when multiple SlickGrids share id
        // prefixes). Also escape the constructed id for CSS-selector safety.
        const escapedId =
          typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(`${prefix}${childName}`)
            : `${prefix}${childName}`.replace(/(["\\[\]])/g, '\\$1')
        domNode.querySelector(`#${escapedId}`)?.addEventListener('click', (evt: Event) => {
          evt.preventDefault()
          evt.stopPropagation()
          return false
        })
      }
      child
        .style(css => {
          css.left = '0'
          css.borderBottom = 'none'
          css.height = `${height - 1}px`
        })
        .addClass(['group-member'])
        .appendTo(groupPanel)
    }
  })
}

export function groupHeaderColumns(
  domNode: HTMLElement,
  title: string,
  columnName: string,
  columnCount: number,
  height: number,
): void {
  // The standalone variant follows the same logic as the (formerly prototype)
  // groupColumnHeader; the original source kept both. Delegating for consistency.
  groupColumnHeader(domNode, title, columnName, columnCount, height)
}

// ──────────────────────────────────────────────────────────────────────────
// Async DOM-ready helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve when the first SlickGrid header-column element is measurable.
 * Internally polls via getTargetElement → getElementHeight.
 */
export function getColumnHeaderHeight(domNode: HTMLElement): Promise<number> {
  return getTargetElement(domNode, 'slick-header')
    .then(header => getTargetElement(header, 'slick-header-columns'))
    .then(headerColumns => getTargetElement(headerColumns, 'slick-header-column'))
    .then(headerColumn => getElementHeight(headerColumn))
}

/**
 * Resolve with the first ClientRect height of `element` after a 500ms delay.
 * Rejects if the rect is unavailable.
 */
export function getElementHeight(element: HTMLElement): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    setTimeout(() => {
      const rect = element.getClientRects().item(0)
      if (rect && rect.height) resolve(rect.height)
      else reject(new Error('Element height not found.'))
    }, 500)
  })
}

/**
 * Resolve with the first descendant of `container` matching `.${cssClass}`
 * after a 100ms delay. Rejects if not found.
 */
export function getTargetElement(container: HTMLElement, cssClass: string): Promise<HTMLElement> {
  return new Promise<HTMLElement>((resolve, reject) => {
    setTimeout(() => {
      const target = container.querySelector<HTMLElement>(`.${cssClass}`)
      if (target) resolve(target)
      else reject(new Error(`Element with selector ".${cssClass}" not found within the specified domNode.`))
    }, 100)
  })
}

// ──────────────────────────────────────────────────────────────────────────
// DOM construction shorthand
// ──────────────────────────────────────────────────────────────────────────

export function createDivWithClassesAndAppendBefore(
  domNode: HTMLElement,
  selector: string,
  classes: string,
): void {
  const div = document.createElement('div')
  div.classList.add(...classes.split(' ').filter(Boolean))
  const existing = domNode.querySelector(selector)
  if (existing?.parentNode) existing.parentNode.insertBefore(div, existing)
}

export function createDivWithClassesAndAppendAfter(
  domNode: HTMLElement,
  selector: string,
  classes: string,
): void {
  const div = document.createElement('div')
  div.classList.add(...classes.split(' ').filter(Boolean))
  const existing = domNode.querySelector(selector)
  existing?.parentNode?.insertBefore(div, existing.nextSibling)
}

export function createDivWithClassesAndAppendTo(
  domNode: HTMLElement,
  selector: string,
  classes: string,
): void {
  const div = document.createElement('div')
  div.classList.add(...classes.split(' ').filter(Boolean))
  domNode.querySelector(selector)?.appendChild(div)
}

export function moveDivToNewParent(
  domNode: HTMLElement,
  newParentSelector: string,
  targetChildSelector: string,
): void {
  const newParent = domNode.querySelector(newParentSelector)
  const targetChild = domNode.querySelector(targetChildSelector)
  if (newParent && targetChild) newParent.appendChild(targetChild)
}

export function moveDivsToNewParent(
  domNode: HTMLElement,
  newParentSelector: string,
  targetChildSelector: string,
): void {
  const newParent = domNode.querySelector(newParentSelector)
  if (!newParent) return
  const targetChildren = domNode.querySelectorAll(targetChildSelector)
  targetChildren.forEach(child => newParent.appendChild(child))
}

// ──────────────────────────────────────────────────────────────────────────
// Form-field caption layout helpers
// ──────────────────────────────────────────────────────────────────────────

export function labelCaptionTopLeft(field: string, captionClass: string): void {
  applyCSS([field], { flexWrap: 'wrap' })
  applyCSS([captionClass], {
    width: '150px',
    marginBottom: '2px',
    textAlign: 'left',
    flexBasis: '100%',
  })
}

export function labelCaptionTopRight(field: string, captionClass: string): void {
  applyCSS([field], { flexWrap: 'wrap' })
  applyCSS([captionClass], {
    width: '150px',
    marginBottom: '2px',
    textAlign: 'right',
    flexBasis: '100%',
  })
}

/**
 * Apply a CSS property map to every element matching each selector. Silent
 * no-op when a selector matches nothing (the source logged Thai-language
 * errors; replaced with silent fail per project no-console policy).
 */
export function applyCSS(selectors: string[], properties: Record<string, string>): void {
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector)
    elements.forEach(el => {
      if (el instanceof HTMLElement) {
        for (const property of Object.keys(properties)) {
          // Mutating via index signature for camelCase CSS properties (the
          // browser accepts both kebab- and camelCase). Cast keeps TS happy.
          ;(el.style as unknown as Record<string, string>)[property] = properties[property]
        }
      }
    })
  }
}

export function addCssClassToField(
  domNode: HTMLElement,
  fields: string[],
  ...cssClass: string[]
): void {
  for (const field of fields) {
    domNode.querySelectorAll(`.field.${field}`).forEach(el => {
      if (el instanceof HTMLElement) el.classList.add(...cssClass)
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Toolbar button state
// ──────────────────────────────────────────────────────────────────────────

export function toggleButtonInForm(
  domNode: HTMLElement,
  className: string,
  shouldEnable: boolean,
): void {
  const button = domNode.querySelector<HTMLButtonElement>(`.${className}`)
  if (!button) return
  button.classList.toggle('disabled', !shouldEnable)
  button.disabled = !shouldEnable
}

export function toggleButton(toolbar: Toolbar, buttonName: string, shouldEnable: boolean): void {
  toolbar.findButton(buttonName).toggleClass('disabled', !shouldEnable)
}
