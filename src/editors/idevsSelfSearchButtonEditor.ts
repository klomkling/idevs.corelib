import {
  Decorators,
  EditorWidget,
  Fluent,
  IReadOnly,
  IStringValue,
  serviceCall,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'
import { applyMaskedPattern, extractRawValue } from './shared/maskedPattern'
import { findLabelFor, setRequiredMarker } from './shared/requiredMarker'
import { createValidationObserver, type ValidationClassSync } from './shared/validationObserver'
import {
  parseResultColumns,
  type ResultColumn,
  type CustomFormatterMap,
} from './selfSearch/columnFormatters'
import { SearchModalController } from './selfSearch/searchModal'
import { SearchDropdownController } from './selfSearch/searchDropdown'
import type { SearchPresentationCallbacks } from './selfSearch/searchModal'

export type IdevsSelfSearchPresentation = 'modal' | 'dropdown'

export type IdevsSelfSearchButtonEditorOptions = {
  // Identity
  grid?: unknown
  idColumnName?: string
  textColumnName?: string

  // Display
  canClear?: boolean
  displayTemplate?: string
  maskedPattern?: string

  // Behavior
  enableEnterKeySearch?: boolean
  enableButtonClickSearch?: boolean
  minSearchLength?: number
  clearSearchOnReopen?: boolean

  // Service-based search
  service?: string
  serviceSearchMethod?: string // default: "List"
  serviceParams?: Record<string, unknown>
  searchTextParam?: string // default: "searchText"
  filtersParam?: string // default: "filters"

  // Presentation
  presentation?: IdevsSelfSearchPresentation // default: 'modal'
  resultColumns?: ResultColumn[] | string
  columnFormatters?: CustomFormatterMap
  maxResultsToShow?: number
  builtInDialogTitle?: string
  showResultsCount?: boolean
  enableColumnSorting?: boolean
  searchPlaceholder?: string
  searchDebounceMs?: number

  // Callbacks
  onDataSelected?: (data: unknown) => void
  onBlur?: (value: string | null) => void
  getSearchValue?: () => string
  getFilters?: () => Record<string, unknown>
  getCriteria?: () => unknown[]

  // Dropdown-specific
  dropdownMaxHeight?: string
  dropdownMinWidth?: string
}

export type SelfSearchSubscriberCallback = (data: unknown) => void

type ServiceListResponse = { Entities?: Record<string, unknown>[] }

const DEFAULT_DISPLAY_TEMPLATE = '{id} - {value}'
const DEFAULT_PLACEHOLDER = 'Enter some value and click search button'
const VALIDATION_CLASSES = ['error', 'invalid', 'validation-error'] as const

/**
 * "Self-hosted" search button editor — fetches results via Serenity
 * `serviceCall` and renders them in an in-editor modal or dropdown,
 * eliminating the need for a separately-registered Serenity search dialog.
 *
 * Same hardening posture as IdevsSearchButtonEditor: single-chokepoint
 * value writes, XSS-safe required marker, ARIA combobox on display input,
 * MutationObserver-based validation-class sync, idempotent destroy.
 */
@Decorators.registerEditor('Idevs.CoreLib.IdevsSelfSearchButtonEditor', [IReadOnly, IStringValue])
export class IdevsSelfSearchButtonEditor<
  P extends IdevsSelfSearchButtonEditorOptions = IdevsSelfSearchButtonEditorOptions,
> extends EditorWidget<P> implements IReadOnly, IStringValue {
  protected displayInput!: HTMLInputElement
  protected searchButton!: HTMLButtonElement
  protected clearButton?: HTMLAnchorElement
  protected wrapperElement!: HTMLElement
  protected isReadonly = false
  protected isDestroyed = false
  protected subscribers: SelfSearchSubscriberCallback[] = []
  protected filters: Record<string, unknown> = {}
  protected criteria: unknown[] = []
  protected validationObserver?: ValidationClassSync
  protected presentation!: SearchModalController | SearchDropdownController

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
    this.createPresentation()
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
      this.domNode.hasAttribute('required') || this.domNode.classList.contains('required')
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
    this.presentation?.destroy()
    super.destroy()
  }

  // === Public API ===

  setFilterKeys(filters: Record<string, unknown>): void {
    this.filters = { ...filters }
  }

  setCriteriaKeys(criteria: unknown[]): void {
    this.criteria = [...criteria]
  }

  setFilterValue(key: string, value: unknown): void {
    this.filters = { ...this.filters, [key]: value }
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

  subscribe(callback: SelfSearchSubscriberCallback): void {
    if (this.isDestroyed) return
    this.subscribers.push(callback)
  }

  // === Initialization ===

  protected validateRequiredProps(): void {
    if (!this.props.service) {
      throw new Error('IdevsSelfSearchButtonEditor requires options.service')
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
      .addClass('self-search-button-editor')
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
      .attr('aria-haspopup', this.props.presentation === 'dropdown' ? 'listbox' : 'dialog')
      .attr('aria-expanded', 'false')
      .addClass('editor form-control')
      .style(css => {
        css.flexGrow = '1'
        css.minWidth = '10ch'
        if (this.props.canClear !== false) css.paddingRight = '1.75rem'
      })
      .appendTo(container)
      .getNode() as HTMLInputElement
  }

  protected createButtons(container: HTMLElement): void {
    this.searchButton = Fluent('button')
      .attr('type', 'button')
      .attr('aria-label', 'Search')
      .addClass('btn btn-primary search-btn')
      .style(css => {
        css.minWidth = '2.5rem'
        css.fontSize = '1.4rem'
      })
      .text('🔍')
      .getNode() as HTMLButtonElement
    container.appendChild(this.searchButton)

    if (this.props.canClear !== false) {
      this.clearButton = Fluent('a')
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
      container.appendChild(this.clearButton)
    }
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
    this.displayInput.addEventListener('blur', () => this.handleDisplayInputBlur())
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

  protected handleDisplayInputBlur(): void {
    if (this.props.onBlur) {
      this.props.onBlur(this.get_value() || null)
    }
  }

  protected handleSearchButtonClick(event: MouseEvent): void {
    event.preventDefault()
    if (this.isReadonly) return
    // Default true; explicit false disables button-triggered search (e.g.,
    // when consumers wire search via Enter key only, or use the button for
    // a custom interaction).
    if (this.props.enableButtonClickSearch === false) return
    this.performSearch()
  }

  protected handleClearButtonClick(event: MouseEvent): void {
    event.preventDefault()
    if (this.isReadonly) return
    this.performClear()
  }

  // === State management ===

  protected updateReadonlyState(): void {
    this.displayInput.readOnly = this.isReadonly
    this.displayInput.classList.toggle('readonly', this.isReadonly)
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

  // === Presentation ===

  protected createPresentation(): void {
    const columns = parseResultColumns(
      this.props.resultColumns,
      {
        idColumnName: this.props.idColumnName,
        textColumnName: this.props.textColumnName,
        maskedPattern: this.props.maskedPattern,
      },
      this.props.columnFormatters,
    )

    const presentationOptions = {
      columns,
      maxResults: this.props.maxResultsToShow,
      enableSorting: this.props.enableColumnSorting ?? true,
      showCount: this.props.showResultsCount ?? false,
      searchPlaceholder: this.props.searchPlaceholder,
      searchDebounceMs: this.props.searchDebounceMs,
    }

    const callbacks: SearchPresentationCallbacks = {
      onSelect: item => this.handleSelection(item),
      onCancel: () => {
        // Reset combobox aria state (the modal controller doesn't touch the
        // displayInput; the dropdown controller already toggles aria-expanded
        // on the anchor, which IS the displayInput — both reach the right
        // outcome via this single assignment).
        this.displayInput.setAttribute('aria-expanded', 'false')
        // Focus restoration:
        //  - modal: SearchModalController.close() already returned focus to
        //    the element that opened the dialog (typically the search
        //    button). We MUST NOT call displayInput.focus() here or we'd
        //    override that restoration.
        //  - dropdown: the anchor IS displayInput; the controller doesn't
        //    track an invoker, so we focus it explicitly.
        if (this.props.presentation === 'dropdown') {
          this.displayInput.focus()
        }
      },
      fetchResults: query => this.fetchResults(query),
    }

    if (this.props.presentation === 'dropdown') {
      this.presentation = new SearchDropdownController(
        this.displayInput,
        {
          ...presentationOptions,
          maxHeight: this.props.dropdownMaxHeight,
          minWidth: this.props.dropdownMinWidth,
        },
        callbacks,
      )
    } else {
      this.presentation = new SearchModalController(
        document.body,
        { ...presentationOptions, title: this.props.builtInDialogTitle },
        callbacks,
      )
    }
  }

  // === Search execution ===

  protected performSearch(): void {
    if (this.isDestroyed) return

    const searchValue = this.props.getSearchValue
      ? this.props.getSearchValue()
      : this.displayInput.value

    const min = this.props.minSearchLength ?? 0
    if (min > 0 && searchValue.length < min) return

    const initialQuery =
      this.props.clearSearchOnReopen ? '' : searchValue
    this.presentation.open(initialQuery)
    this.displayInput.setAttribute('aria-expanded', 'true')
  }

  protected performClear(): void {
    this.displayInput.value = ''
    this.set_value(null)
  }

  protected async fetchResults(searchText: string): Promise<Record<string, unknown>[]> {
    if (this.isDestroyed || !this.props.service) return []

    const method = this.props.serviceSearchMethod ?? 'List'
    const searchTextParam = this.props.searchTextParam ?? 'searchText'
    const filtersParam = this.props.filtersParam ?? 'filters'

    const filters = this.props.getFilters ? this.props.getFilters() : this.filters
    const criteria = this.props.getCriteria ? this.props.getCriteria() : this.criteria

    const request: Record<string, unknown> = {
      ...(this.props.serviceParams ?? {}),
      [searchTextParam]: searchText,
      [filtersParam]: filters,
    }
    if (criteria && criteria.length > 0) request.Criteria = criteria

    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      try {
        serviceCall({
          service: `${this.props.service}/${method}`,
          request,
          onSuccess: response => {
            const list = response as unknown as ServiceListResponse
            resolve(list.Entities ?? [])
          },
          onError: (errorResponse: unknown) => {
            // Preserve the Serenity error object as `cause` so callers and
            // tests can inspect it. The wrapping Error keeps the call-site
            // stack and gives a stable message; consumers wanting the raw
            // service payload can read `(err as Error & { cause: unknown }).cause`.
            // Note: assigning `.cause` post-construction (rather than via the
            // ES2022 `new Error(msg, { cause })` form) for portability across
            // TS lib targets.
            const wrapper = new Error(
              `IdevsSelfSearchButtonEditor service call failed: ${this.props.service}/${method}`,
            ) as Error & { cause?: unknown }
            wrapper.cause = errorResponse
            reject(wrapper)
          },
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  // === Selection ===

  protected handleSelection(data: Record<string, unknown>): void {
    if (this.isDestroyed) return
    const idCol = this.props.idColumnName
    if (!idCol) {
      this.displayInput.setAttribute('aria-expanded', 'false')
      this.focusDisplayInputIfDropdown()
      return
    }
    const id = data[idCol]
    this.set_value(id != null ? String(id) : null)
    if (typeof this.props.textColumnName === 'string') {
      const text = data[this.props.textColumnName]
      if (text != null) this.displayInput.value = String(text)
    }
    this.displayInput.setAttribute('aria-expanded', 'false')
    this.focusDisplayInputIfDropdown()

    // Dispatch dataSelected CustomEvent on the domNode (for Slick wrapper +
    // any direct listeners) BEFORE invoking the configured callback so that
    // a single firing reaches both surfaces.
    this.domNode.dispatchEvent(new CustomEvent('dataSelected', { detail: data }))

    if (this.props.onDataSelected) this.props.onDataSelected(data)
    for (const sub of this.subscribers) sub(data)
  }

  /**
   * Focus the display input ONLY for the dropdown presentation. For modal,
   * the SearchModalController's close() already restored focus to the
   * invoker (typically the search button) — overriding that with
   * displayInput.focus() would land focus in the wrong place for keyboard
   * users.
   */
  private focusDisplayInputIfDropdown(): void {
    if (this.props.presentation === 'dropdown') {
      this.displayInput.focus()
    }
  }
}
