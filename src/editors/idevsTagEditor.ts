import {
  Decorators,
  EditorWidget,
  Fluent,
  IReadOnly,
  IStringValue,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'

export type TagItem = string | number | { text?: string; toString(): string }

export type TagValueCasing = 'upper' | 'lower' | 'none'

export type IdevsTagEditorOptions = {
  valueCasing?: TagValueCasing
  placeholder?: string
}

const REQUIRED_MARKER_ATTR = 'data-idevs-required-marker'

function tagItemToText(item: TagItem): string {
  if (typeof item === 'object' && item !== null) {
    if (item.text) return item.text
    return item.toString()
  }
  return String(item)
}

function applyCasing(value: string, casing: TagValueCasing): string {
  switch (casing) {
    case 'upper':
      return value.toUpperCase()
    case 'lower':
      return value.toLowerCase()
    default:
      return value
  }
}

@Decorators.registerEditor('Idevs.CoreLib.IdevsTagEditor')
export class IdevsTagEditor<P extends IdevsTagEditorOptions = IdevsTagEditorOptions>
  extends EditorWidget<P>
  implements IReadOnly, IStringValue
{
  protected dropdownContainer!: HTMLDivElement
  protected wrapperElement!: HTMLDivElement
  protected _items: TagItem[] = []
  protected currentFocusIndex = -1
  protected valueAssigned = false

  private _readOnly = false
  private readonly dropdownId: string = `tag-dropdown-${Math.random().toString(36).substring(2, 10)}`
  private documentClickHandler!: (e: MouseEvent) => void
  private _navigatingDropdown = false
  private optionIdCounter = 0

  declare readonly domNode: HTMLInputElement

  static override createDefaultElement() {
    return Fluent('input').attr('type', 'text').addClass(['w-100']).getNode()
  }

  constructor(props: EditorProps<P>) {
    super(props)
    this.initializeComponent()
  }

  protected initializeComponent() {
    this.createWrapperAndDropdown()
    this.setupEventHandlers()
    this.setInitialOptions()
    this.applyComboboxAria()
    this.validate()
  }

  protected createWrapperAndDropdown() {
    this.createWrapper()
    this.createDropdown()
  }

  protected createWrapper() {
    this.wrapperElement = Fluent('div')
      .addClass('tag-suggest-wrapper')
      .style(css => {
        css.position = 'relative'
        css.width = '100%'
      })
      .getNode() as HTMLDivElement

    this.domNode.parentNode?.insertBefore(this.wrapperElement, this.domNode)
    this.wrapperElement.appendChild(this.domNode)
  }

  protected createDropdown() {
    this.dropdownContainer = Fluent('div')
      .attr('id', this.dropdownId)
      .attr('tabindex', '-1')
      .attr('role', 'listbox')
      .addClass('tag-suggest-dropdown')
      .style(css => this.getDropdownStyles(css))
      .getNode() as HTMLDivElement

    this.wrapperElement.appendChild(this.dropdownContainer)
  }

  /**
   * Wire up the WAI-ARIA 1.2 combobox-with-listbox pattern on the input. The
   * dropdown element gets `role="listbox"`; individual items get
   * `role="option"`. `aria-expanded` is toggled in open/hide; the currently
   * focused item is tracked via `aria-activedescendant` so the input keeps
   * focus while screen readers can still announce the active suggestion.
   */
  protected applyComboboxAria() {
    this.domNode.setAttribute('role', 'combobox')
    this.domNode.setAttribute('aria-autocomplete', 'list')
    this.domNode.setAttribute('aria-controls', this.dropdownId)
    this.domNode.setAttribute('aria-expanded', 'false')
    this.domNode.setAttribute('aria-haspopup', 'listbox')
  }

  protected getDropdownStyles(css: CSSStyleDeclaration) {
    css.position = 'absolute'
    css.display = 'none'
    css.border = '1px solid #ccc'
    css.minWidth = '100px'
    css.overflowY = 'auto'
    css.backgroundColor = '#fff'
    css.zIndex = '1000'
    css.width = '100%'
    css.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.175)'
    css.borderRadius = '4px'
  }

  protected setInitialOptions() {
    if (this.options.placeholder) {
      this.domNode.setAttribute('placeholder', this.options.placeholder)
    }
  }

  protected setupEventHandlers() {
    this.setupDocumentClickHandler()
    this.setupDropdownEventHandlers()
    this.setupInputEventHandlers()
  }

  protected setupDocumentClickHandler() {
    this.documentClickHandler = (e: MouseEvent) => {
      if (this.isClickOutsideComponent(e)) {
        this.hideDropdown()
      }
    }
    document.addEventListener('click', this.documentClickHandler)
  }

  protected isClickOutsideComponent(e: MouseEvent): boolean {
    const target = e.target as HTMLElement | null
    return !!(
      target &&
      this.domNode &&
      this.dropdownContainer &&
      !this.domNode.contains(target) &&
      !this.dropdownContainer.contains(target)
    )
  }

  protected setupDropdownEventHandlers() {
    this.dropdownContainer.addEventListener('mousedown', this.handleDropdownMouseDown.bind(this))
    this.dropdownContainer.addEventListener('keydown', this.handleDropdownNavigation.bind(this))
  }

  protected handleDropdownMouseDown(e: MouseEvent) {
    // Suppress the default mousedown behavior (blurring the input) so the
    // subsequent click on the dropdown item can fire while the input still
    // has focus. Selection itself happens in the per-item click handler —
    // doing it here too would double-dispatch and overwrite cased values
    // with the raw rendered textContent.
    e.preventDefault()
  }

  protected setupInputEventHandlers() {
    this.domNode.addEventListener('focus', this.handleInputFocus.bind(this))
    this.domNode.addEventListener('blur', this.handleInputBlur.bind(this))
    this.domNode.addEventListener('keydown', this.handleInputKeyDown.bind(this))
    this.domNode.addEventListener('input', this.handleInputChange.bind(this))
    this.domNode.addEventListener('change', () => this.validate())
  }

  protected handleInputFocus() {
    if (this._readOnly) return
    if (this._items.length === 0) return
    // Reset the suppression flag and let filterDropdownItems decide visibility
    // based on current input text — keeps the dropdown closed when nothing
    // matches instead of opening an empty container.
    this.valueAssigned = false
    this.filterDropdownItems()
  }

  protected handleInputBlur() {
    if (this._navigatingDropdown) {
      this._navigatingDropdown = false
      return
    }

    setTimeout(() => {
      this.validate()
      this.hideDropdown()
    }, 100)
  }

  protected handleInputKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        this._navigatingDropdown = false
        this.hideDropdown()
        e.preventDefault()
        break
      case 'Tab':
        this._navigatingDropdown = false
        this.handleTabKey()
        break
      case 'ArrowDown':
        this._navigatingDropdown = true
        this.handleArrowDownKey(e)
        break
    }
  }

  protected handleTabKey() {
    this.formatDisplayValue()
  }

  protected handleArrowDownKey(e: KeyboardEvent) {
    e.preventDefault()
    this._navigatingDropdown = true
    this.openDropdownIfHidden()
    this.focusFirstVisibleItem()
  }

  protected handleInputChange() {
    // User is actively typing — re-enable filter-driven dropdown visibility.
    // (`valueAssigned` is set by programmatic set_value() to suppress the
    // hide-when-empty path during initial value population.)
    this.valueAssigned = false
    this.applyInputCasing()
    this.filterDropdownItems()
  }

  protected applyInputCasing() {
    const casing = this.options.valueCasing ?? 'none'
    if (casing === 'none') return

    const rawValue = this.domNode.value
    const formattedValue = applyCasing(rawValue, casing)

    if (formattedValue !== rawValue) {
      const cursorPos = this.domNode.selectionStart ?? formattedValue.length
      this.domNode.value = formattedValue
      this.domNode.setSelectionRange(cursorPos, cursorPos)
    }
  }

  protected refreshDropdownItems() {
    this.clearDropdownItems()
    this.addDropdownItems()
  }

  protected clearDropdownItems() {
    this.dropdownContainer.replaceChildren()
  }

  protected addDropdownItems() {
    this.optionIdCounter = 0
    const casing = this.options.valueCasing ?? 'none'
    this._items.forEach(item => {
      const displayText = this.formatItemText(item, casing)
      this.createDropdownItem(displayText, item)
    })
  }

  protected formatItemText(item: TagItem, casing: TagValueCasing): string {
    return applyCasing(tagItemToText(item), casing)
  }

  protected createDropdownItem(text: string, item: TagItem) {
    const optionId = `${this.dropdownId}-opt-${this.optionIdCounter++}`
    const itemEl = Fluent('div')
      .addClass('dropdown-item')
      .attr('id', optionId)
      .attr('role', 'option')
      .attr('aria-selected', 'false')
      .attr('tabindex', '-1')
      .text(text)
      .style(css => {
        css.padding = '8px 12px'
        css.cursor = 'pointer'
      })
      .on('mouseover', e => this.highlightItem(e.target as HTMLElement))
      .on('mouseout', e => this.unhighlightItem(e.target as HTMLElement))
      .on('click', e => this.handleItemClick(e, item))
      .appendTo(this.dropdownContainer)

    itemEl.getNode().addEventListener('keydown', e => this.handleDropdownKeyDown(e as KeyboardEvent))
  }

  protected handleItemClick(e: Event, item: TagItem) {
    e.preventDefault()
    this.selectItem(item)
  }

  public formatDisplayValue() {
    // Stub for subclass override. Subclasses that mutate `domNode.value` here
    // are responsible for dispatching 'change' / 'input' events themselves.
  }

  protected formatDisplayText(value?: string | number | null): string {
    return value != null ? String(value) : ''
  }

  protected navigateDropdownDown(focusedItem: HTMLElement | null, visibleItems: HTMLElement[]) {
    if (!focusedItem) {
      this.focusFirstVisibleItem()
      return
    }
    const currentIndex = visibleItems.indexOf(focusedItem)
    if (currentIndex < visibleItems.length - 1) {
      const next = visibleItems[currentIndex + 1]
      if (next) this.focusDropdownItem(next)
    }
  }

  protected navigateDropdownUp(focusedItem: HTMLElement | null, visibleItems: HTMLElement[]) {
    if (!focusedItem) {
      this.focusFirstVisibleItem()
      return
    }
    const currentIndex = visibleItems.indexOf(focusedItem)
    if (currentIndex > 0) {
      const prev = visibleItems[currentIndex - 1]
      if (prev) this.focusDropdownItem(prev)
    } else {
      this.clearDropdownFocus()
      this.domNode.focus()
    }
  }

  protected handleDropdownNavigation(e: KeyboardEvent) {
    const focusedItem = this.getFocusedDropdownItem()
    const visibleItems = this.getVisibleDropdownItems()

    if (visibleItems.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        this._navigatingDropdown = true
        this.navigateDropdownDown(focusedItem, visibleItems)
        break
      case 'ArrowUp':
        e.preventDefault()
        this._navigatingDropdown = true
        this.navigateDropdownUp(focusedItem, visibleItems)
        break
      case 'Enter':
        if (focusedItem) {
          e.preventDefault()
          this._navigatingDropdown = false
          focusedItem.click()
        }
        break
      case 'Escape':
        e.preventDefault()
        this._navigatingDropdown = false
        this.hideDropdown()
        this.domNode.focus()
        break
      case 'Tab':
        this._navigatingDropdown = false
        break
    }
  }

  protected handleDropdownKeyDown(e: KeyboardEvent) {
    // Only handle the keys we navigate with; let everything else (most
    // importantly Tab) bubble so keyboard users aren't trapped in the
    // dropdown when an item has focus.
    if (
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'Enter' &&
      e.key !== 'Escape'
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()

    const visibleItems = this.getVisibleDropdownItems()
    if (visibleItems.length === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        this._navigatingDropdown = true
        this.currentFocusIndex = Math.min(this.currentFocusIndex + 1, visibleItems.length - 1)
        const item = visibleItems[this.currentFocusIndex]
        if (item) this.focusDropdownItem(item)
        break
      }
      case 'ArrowUp': {
        this._navigatingDropdown = true
        if (this.currentFocusIndex <= 0) {
          this.clearDropdownFocus()
          this.currentFocusIndex = -1
          this.domNode.focus()
        } else {
          this.currentFocusIndex--
          const item = visibleItems[this.currentFocusIndex]
          if (item) this.focusDropdownItem(item)
        }
        break
      }
      case 'Enter': {
        this._navigatingDropdown = false
        const item = visibleItems[this.currentFocusIndex]
        item?.click()
        this.hideDropdown()
        this.clearDropdownFocus()
        this.domNode.focus()
        break
      }
      case 'Escape':
        this._navigatingDropdown = false
        this.hideDropdown()
        this.clearDropdownFocus()
        this.domNode.focus()
        break
    }
  }

  protected openDropdown() {
    this.dropdownContainer.style.display = 'block'
    this.domNode.setAttribute('aria-expanded', 'true')
  }

  protected hideDropdown() {
    this.dropdownContainer.style.display = 'none'
    this.domNode.setAttribute('aria-expanded', 'false')
    this.domNode.removeAttribute('aria-activedescendant')
  }

  protected isDropdownHidden(): boolean {
    return this.dropdownContainer.style.display === 'none'
  }

  protected openDropdownIfHidden() {
    if (this.isDropdownHidden()) {
      this.openDropdown()
      this.filterDropdownItems()
    }
  }

  protected getVisibleDropdownItems(): HTMLElement[] {
    return Array.from(
      this.dropdownContainer.querySelectorAll('.dropdown-item:not([style*="display: none"])'),
    ) as HTMLElement[]
  }

  protected getFocusedDropdownItem(): HTMLElement | null {
    return this.dropdownContainer.querySelector<HTMLElement>('.dropdown-item-focused')
  }

  protected focusFirstVisibleItem() {
    const visibleItems = this.getVisibleDropdownItems()
    const first = visibleItems[0]
    if (first) {
      this.currentFocusIndex = 0
      this.focusDropdownItem(first)
    }
  }

  protected selectItem(item: TagItem) {
    // Single canonical selection path: write through set_value() so the
    // valueCasing contract is honored and change/input events fire exactly
    // once (only if the value actually changed), then do the UI cleanup.
    this.set_value(tagItemToText(item))
    this.hideDropdown()
    this.domNode.focus()
  }

  protected focusDropdownItem(item: HTMLElement) {
    this.clearDropdownFocus()
    item.classList.add('dropdown-item-focused')
    item.setAttribute('aria-selected', 'true')
    this.highlightItem(item)
    item.focus()
    item.scrollIntoView({ block: 'nearest' })
    if (item.id) {
      this.domNode.setAttribute('aria-activedescendant', item.id)
    }
  }

  protected clearDropdownFocus() {
    const focused = this.getFocusedDropdownItem()
    if (focused) {
      focused.classList.remove('dropdown-item-focused')
      focused.setAttribute('aria-selected', 'false')
      this.unhighlightItem(focused)
    }
    this.domNode.removeAttribute('aria-activedescendant')
  }

  protected highlightItem(item: HTMLElement) {
    item.style.backgroundColor = '#3875d7'
    item.style.color = 'white'
  }

  protected unhighlightItem(item: HTMLElement) {
    item.style.backgroundColor = 'transparent'
    item.style.color = 'var(--bs-dropdown-link-color)'
  }

  protected filterDropdownItems() {
    const searchText = this.domNode.value.toLowerCase()
    const items = this.dropdownContainer.querySelectorAll<HTMLElement>('.dropdown-item')
    let hasVisibleItems = false

    // textContent avoids the layout flush that innerText triggers on every
    // keystroke; for filtering, the rendered-text semantics of innerText
    // aren't needed.
    items.forEach(el => {
      const isVisible = (el.textContent ?? '').toLowerCase().includes(searchText)
      el.style.display = isVisible ? 'block' : 'none'
      hasVisibleItems = hasVisibleItems || isVisible
    })

    if (!this.valueAssigned) {
      if (hasVisibleItems) {
        this.openDropdown()
      } else {
        this.hideDropdown()
      }
    }
  }

  get items(): TagItem[] {
    return this._items
  }

  set items(value: TagItem[]) {
    this._items = value
    this.refreshDropdownItems()
  }

  get_readOnly(): boolean {
    return this._readOnly
  }

  get readOnly(): boolean {
    return this.get_readOnly()
  }

  set_readOnly(value: boolean): void {
    if (this._readOnly !== value) {
      this._readOnly = value
      this.updateReadOnlyState()
    }
  }

  set readOnly(value: boolean) {
    this.set_readOnly(value)
  }

  get_value(): string {
    return this.domNode.value ?? ''
  }

  get value(): string {
    return this.get_value()
  }

  set_value(value: string): void {
    const oldValue = this.domNode.value
    // Single chokepoint for the valueCasing contract: applies to programmatic
    // writes AND to selections from the dropdown (handleItemClick funnels
    // through here). Mirrors the casing already applied to user typing in
    // applyInputCasing() and to rendered dropdown labels in formatItemText().
    const casing = this.options.valueCasing ?? 'none'
    this.domNode.value = applyCasing(value || '', casing)

    if (oldValue !== this.domNode.value) {
      this.valueAssigned = true
      this.domNode.dispatchEvent(new Event('change', { bubbles: true }))
      this.domNode.dispatchEvent(new Event('input', { bubbles: true }))
    }

    this.validate()
  }

  set value(value: string) {
    this.set_value(value)
  }

  get_required(): boolean {
    return this.domNode.classList.contains('required')
  }

  get required(): boolean {
    return this.get_required()
  }

  set_required(value: boolean): void {
    this.updateRequiredState(value)
  }

  set required(value: boolean) {
    this.set_required(value)
  }

  protected updateRequiredState(isRequired: boolean) {
    if (isRequired) {
      this.domNode.classList.add('required')
      this.domNode.setAttribute('required', '')
      this.domNode.setAttribute('aria-required', 'true')
    } else {
      this.domNode.classList.remove('required')
      this.domNode.removeAttribute('required')
      this.domNode.removeAttribute('aria-required')
    }

    // The input is nested inside `tag-suggest-wrapper`, so its immediate
    // parent never contains the Serenity-rendered label. Look up the label
    // through the wrapper's parent (the original form container) and fall
    // back to the input's parent for callers that bypass the wrapper.
    const labelContainer = this.wrapperElement?.parentElement ?? this.domNode.parentElement
    const label = labelContainer?.querySelector('label')
    if (label) {
      const existingMarker = label.querySelector(`sup[${REQUIRED_MARKER_ATTR}]`)
      if (isRequired && !existingMarker) {
        const sup = document.createElement('sup')
        sup.setAttribute('title', 'this field is required')
        sup.setAttribute(REQUIRED_MARKER_ATTR, '')
        sup.textContent = '*'
        label.insertBefore(sup, label.firstChild)
      } else if (!isRequired) {
        existingMarker?.remove()
      }
    }

    this.validate()
  }

  protected updateReadOnlyState() {
    if (this._readOnly) {
      this.domNode.setAttribute('disabled', 'disabled')
      this.element.addClass('readonly')
    } else {
      this.domNode.removeAttribute('disabled')
      this.element.removeClass('readonly')
    }
  }

  /** Apply the "invalid" visual + a11y state. */
  protected markInvalid() {
    this.domNode.setAttribute('aria-invalid', 'true')
    this.domNode.classList.add('is-invalid', 'error')
  }

  /** Clear the "invalid" visual + a11y state. */
  protected markValid() {
    this.domNode.removeAttribute('aria-invalid')
    this.domNode.classList.remove('is-invalid', 'error')
  }

  protected validate(): boolean {
    const isRequired =
      this.domNode.hasAttribute('required') || this.domNode.classList.contains('required')
    const trimmed = this.domNode.value?.trim() ?? ''
    const isValid = !isRequired || trimmed.length > 0

    if (isValid) {
      this.markValid()
    } else {
      this.markInvalid()
    }
    return isValid
  }

  destroy() {
    document.removeEventListener('click', this.documentClickHandler)
    super.destroy()
  }
}
