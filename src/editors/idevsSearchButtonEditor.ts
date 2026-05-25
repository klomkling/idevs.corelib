import {
  Decorators,
  EditorWidget,
  Fluent,
  IReadOnly,
  IStringValue,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'
import { applyMaskedPattern, extractRawValue } from './shared/maskedPattern'
import { findLabelFor, setRequiredMarker } from './shared/requiredMarker'
import { createValidationObserver, type ValidationClassSync } from './shared/validationObserver'

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

type DialogShape = {
  dialogOpen(): void
  FilterKeys?: Record<string, unknown>
  CriteriaKeys?: unknown[]
  SearchValue?: string
  DialogSize?: string
  DialogType?: string
  DialogPermission?: string
  preItems?: unknown[]
}

const DEFAULT_DISPLAY_TEMPLATE = '{id} - {value}'
const DEFAULT_PLACEHOLDER = 'Enter some value and click search button'
const VALIDATION_CLASSES = ['error', 'invalid', 'validation-error'] as const

/**
 * Hidden-input + display-input + search/clear-buttons editor that opens a
 * Serenity dialog to look up an entity. The canonical value is stored on the
 * hidden `domNode`; the visible `displayInput` shows the formatted text. All
 * writes route through `set_value()` (single chokepoint).
 */
@Decorators.registerEditor('Idevs.CoreLib.IdevsSearchButtonEditor', [IReadOnly, IStringValue])
export class IdevsSearchButtonEditor<
  P extends IdevsSearchButtonEditorOptions = IdevsSearchButtonEditorOptions,
> extends EditorWidget<P> implements IReadOnly, IStringValue {
  protected displayInput!: HTMLInputElement
  protected searchButton!: HTMLButtonElement
  protected clearButton?: HTMLAnchorElement
  protected wrapperElement!: HTMLElement
  protected isReadonly = false
  protected isDestroyed = false
  protected subscribers: SubscriberCallback[] = []
  protected preSearchCallback?: PreSearchCallback
  protected filters: Record<string, unknown> = {}
  protected criteria: unknown[] = []
  protected validationObserver?: ValidationClassSync

  declare readonly domNode: HTMLInputElement

  static override createDefaultElement(): HTMLInputElement {
    return Fluent('input').attr('type', 'text').addClass('d-none').getNode() as HTMLInputElement
  }

  constructor(props: EditorProps<P>) {
    super(props)
    this.validateRequiredProps()
    this.renderUI()
    this.setupEventListeners()
    this.startValidationObserver()
  }

  // === Serenity contract ===

  get_value(): string {
    return this.domNode.value ?? ''
  }

  get value(): string {
    return this.get_value()
  }

  set_value(value: string | null | undefined): void {
    const newValue = value ?? ''
    if (this.domNode.value === newValue) return
    this.domNode.value = newValue
    Fluent.trigger(this.domNode, 'change')
  }

  set value(value: string | null | undefined) {
    this.set_value(value)
  }

  get_readOnly(): boolean {
    return this.isReadonly
  }

  set_readOnly(value: boolean): void {
    if (this.isReadonly === value) return
    this.isReadonly = value
    this.updateReadonlyState()
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
      this.displayInput?.setAttribute('aria-required', 'true')
    } else {
      this.domNode.classList.remove('required')
      this.domNode.removeAttribute('required')
      this.displayInput?.removeAttribute('aria-required')
    }
    const label = findLabelFor(this.domNode)
    if (label) setRequiredMarker(label, value)
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    this.validationObserver?.stop()
    this.validationObserver = undefined
    this.subscribers = []
    super.destroy()
  }

  // === Public API ===

  setFilterKeys(filters: Record<string, unknown>): void {
    this.filters = { ...filters }
  }

  setCriteriaKeys(criteria: unknown[]): void {
    this.criteria = [...criteria]
  }

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

  subscribe(callback: SubscriberCallback): void {
    if (this.isDestroyed) return
    this.subscribers.push(callback)
  }

  preSearch(callback: PreSearchCallback): void {
    this.preSearchCallback = callback
  }

  // === Initialization ===

  protected validateRequiredProps(): void {
    if (!this.props.searchDialogType) {
      throw new Error('IdevsSearchButtonEditor requires options.searchDialogType')
    }
  }

  protected renderUI(): void {
    this.wrapperElement = this.createContainer()
    this.createDisplayInput(this.wrapperElement)
    this.createButtons(this.wrapperElement)
    this.insertIntoDOM(this.wrapperElement)
  }

  protected createContainer(): HTMLElement {
    return Fluent('div')
      .addClass('search-button-editor')
      .style(css => {
        css.display = 'flex'
        css.position = 'relative'
        css.width = '100%'
      })
      .getNode() as HTMLElement
  }

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
      .attr('aria-label', 'Search')
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

  // === Event wiring ===

  protected setupEventListeners(): void {
    this.displayInput.addEventListener('keydown', e => this.handleDisplayInputKeydown(e))
    this.displayInput.addEventListener('input', e => this.handleDisplayInputChange(e))
    this.displayInput.addEventListener('paste', e => this.handleDisplayInputPaste(e))
    this.searchButton.addEventListener('click', e => this.handleSearchButtonClick(e))
    if (this.clearButton) {
      this.clearButton.addEventListener('click', e => this.handleClearButtonClick(e))
    }
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
    setTimeout(() => {
      if (this.isDestroyed) return
      this.handleDisplayInputChange(event)
    }, 0)
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

  // === State management ===

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

  protected startValidationObserver(): void {
    this.validationObserver = createValidationObserver({
      source: this.domNode,
      target: this.displayInput,
      classes: VALIDATION_CLASSES,
    })
    this.validationObserver.start()
    this.validationObserver.syncOnce()
  }

  // === Search execution ===

  protected performSearch(): void {
    const searchValue = this.props.getSearchValue
      ? this.props.getSearchValue()
      : this.displayInput.value

    const min = this.props.minSearchLength ?? 0
    if (min > 0 && searchValue.length < min) {
      return
    }

    if (this.preSearchCallback) {
      this.executePreSearch(searchValue)
    } else {
      this.openDialog(searchValue, undefined)
    }
  }

  protected performClear(): void {
    this.displayInput.value = ''
    this.set_value(null)
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

  protected openDialog(searchValue: string, preItems?: unknown[]): void {
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
    if (preItems !== undefined) dialog.preItems = preItems

    const selectionHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      this.handleSelection(detail)
    }
    this.domNode.addEventListener('dataSelected', selectionHandler as EventListener)

    dialog.dialogOpen()
  }

  protected resolveDialogClass(): (new (opts: Record<string, unknown>) => DialogShape) | null {
    const typeName = this.props.searchDialogType
    if (!typeName) return null
    const globalAny = globalThis as unknown as Record<string, unknown>
    const ctor = globalAny[typeName]
    if (typeof ctor !== 'function') return null
    return ctor as new (opts: Record<string, unknown>) => DialogShape
  }

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
}
