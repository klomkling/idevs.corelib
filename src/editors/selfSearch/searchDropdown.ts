import type { ResultColumn } from './columnFormatters'
import type { SearchPresentationCallbacks, SearchPresentationOptions } from './searchModal'

/**
 * Dropdown presentation for IdevsSelfSearchButtonEditor. Positions an
 * absolute-anchored panel below the search input; click-outside dismisses;
 * arrow keys move into the table without leaving the combobox role on the
 * anchor.
 *
 * NOTE: ~40% of this controller's table/keyboard/sort logic is intentionally
 * duplicated with searchModal.ts. See the note in that file for rationale.
 */

export type SearchDropdownOptions = SearchPresentationOptions & {
  maxHeight?: string
  minWidth?: string
}

type SortState = { field: string; direction: 'asc' | 'desc' } | null
type StateKind = 'idle' | 'loading' | 'empty' | 'filtered-empty' | 'error' | 'results'

export class SearchDropdownController {
  private panel!: HTMLDivElement
  private searchInput!: HTMLInputElement
  private resultsContainer!: HTMLDivElement
  private statusRegion!: HTMLDivElement
  private tableEl: HTMLTableElement | null = null
  private items: Record<string, unknown>[] = []
  private filteredItems: Record<string, unknown>[] = []
  private focusIndex = -1
  private sortState: SortState = null
  private state: StateKind = 'idle'
  /** Controller-lifetime listeners. Drained only in destroy(). */
  private cleanups: Array<() => void> = []
  /**
   * Per-render listeners on table cells/rows/headers. Drained at the start
   * of every renderResults() to prevent unbounded accumulation across
   * search/sort/arrow-nav re-renders.
   */
  private rowCleanups: Array<() => void> = []
  private debounceTimer?: ReturnType<typeof setTimeout>
  private isDestroyed = false
  private isOpenFlag = false
  /**
   * Pending focus timer scheduled by open(). Tracked so close()/destroy()
   * can cancel it — prevents a fast open-then-close from focusing a hidden
   * panel after the user has already dismissed it.
   */
  private openFocusTimer?: ReturnType<typeof setTimeout>
  private readonly id: string

  constructor(
    private anchor: HTMLElement,
    private options: SearchDropdownOptions,
    private callbacks: SearchPresentationCallbacks,
  ) {
    this.id = `idevs-search-dropdown-${Math.random().toString(36).slice(2, 10)}`
    this.build()
    this.wireListeners()
  }

  open(initialQuery = ''): void {
    if (this.isDestroyed) return
    this.isOpenFlag = true
    // 'flex' (not 'block') so the panel's flexDirection:column + child
    // flex:1 properties take effect — without this, the results area
    // can't scroll within maxHeight and overflow:hidden clips content.
    this.panel.style.display = 'flex'
    this.anchor.setAttribute('aria-expanded', 'true')
    this.searchInput.value = initialQuery
    this.runSearch(initialQuery)
    this.position()
    // Tracked + guarded focus deferral. An immediate close (Escape, click-
    // outside, destroy) cancels the timer; the in-callback guard handles
    // the race where the timer is scheduled but hasn't fired yet.
    this.clearOpenFocusTimer()
    this.openFocusTimer = setTimeout(() => {
      this.openFocusTimer = undefined
      if (this.isDestroyed || !this.isOpenFlag) return
      this.searchInput.focus()
    }, 0)
  }

  close(): void {
    if (this.isDestroyed) return
    this.clearOpenFocusTimer()
    this.isOpenFlag = false
    this.panel.style.display = 'none'
    this.anchor.setAttribute('aria-expanded', 'false')
  }

  private clearOpenFocusTimer(): void {
    if (this.openFocusTimer !== undefined) {
      clearTimeout(this.openFocusTimer)
      this.openFocusTimer = undefined
    }
  }

  isOpen(): boolean {
    return this.isOpenFlag
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    this.clearDebounceTimer()
    this.clearOpenFocusTimer()
    this.drainRowCleanups()
    for (const cleanup of this.cleanups) {
      try {
        cleanup()
      } catch {
        /* teardown noise */
      }
    }
    this.cleanups = []
    this.panel.remove()
  }

  private drainRowCleanups(): void {
    for (const cleanup of this.rowCleanups) {
      try {
        cleanup()
      } catch {
        /* teardown noise */
      }
    }
    this.rowCleanups = []
  }

  // === DOM construction ===

  private build(): void {
    this.panel = document.createElement('div')
    this.panel.id = this.id
    this.panel.className = 'idevs-search-dropdown-panel'
    Object.assign(this.panel.style, {
      display: 'none', // toggled to 'flex' on open() (matches flexDirection)
      position: 'absolute',
      zIndex: '1040',
      backgroundColor: '#fff',
      border: '1px solid #ced4da',
      borderRadius: '4px',
      boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
      maxHeight: this.options.maxHeight ?? '320px',
      // minWidth deliberately NOT set here — position() is the single source
      // of truth (it computes width based on the anchor or honors
      // options.minWidth). Setting a default here would be overwritten on
      // every open() and never visible to the user.
      overflow: 'hidden',
      flexDirection: 'column',
    })

    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'form-control idevs-search-dropdown-input'
    this.searchInput.placeholder = this.options.searchPlaceholder ?? 'Search...'
    this.searchInput.setAttribute('aria-controls', `${this.id}-results`)
    Object.assign(this.searchInput.style, { margin: '0.4rem', padding: '0.3rem 0.5rem' })

    this.resultsContainer = document.createElement('div')
    this.resultsContainer.id = `${this.id}-results`
    this.resultsContainer.className = 'idevs-search-dropdown-results'
    Object.assign(this.resultsContainer.style, { flex: '1', overflowY: 'auto' })

    this.statusRegion = document.createElement('div')
    this.statusRegion.setAttribute('role', 'status')
    this.statusRegion.setAttribute('aria-live', 'polite')
    this.statusRegion.className = 'idevs-search-dropdown-status'
    Object.assign(this.statusRegion.style, {
      padding: '0.5rem',
      textAlign: 'center',
      color: '#666',
      fontSize: '0.875rem',
    })

    this.panel.append(this.searchInput, this.resultsContainer, this.statusRegion)
    document.body.appendChild(this.panel)

    // ARIA on anchor
    this.anchor.setAttribute('aria-expanded', 'false')
    this.anchor.setAttribute('aria-controls', this.id)
  }

  private wireListeners(): void {
    this.bind(this.searchInput, 'input', () => this.handleSearchInput())
    this.bind(this.searchInput, 'keydown', e => this.handleSearchKeydown(e as KeyboardEvent))

    const onDocumentClick = (e: MouseEvent) => {
      if (!this.isOpenFlag) return
      const target = e.target as Node | null
      if (!target) return
      if (this.panel.contains(target) || this.anchor === target || this.anchor.contains(target)) {
        return
      }
      this.callbacks.onCancel()
      this.close()
    }
    this.bind(document, 'mousedown', onDocumentClick as EventListener)

    const onWindowResize = () => {
      if (this.isOpenFlag) this.position()
    }
    this.bind(window, 'resize', onWindowResize)
  }

  private bind(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler)
    this.cleanups.push(() => target.removeEventListener(type, handler))
  }

  private position(): void {
    const rect = this.anchor.getBoundingClientRect()
    const top = rect.bottom + window.scrollY + 4
    const left = rect.left + window.scrollX
    Object.assign(this.panel.style, {
      top: `${top}px`,
      left: `${left}px`,
      minWidth: this.options.minWidth ?? `${rect.width}px`,
    })
  }

  // === Search / state ===

  private handleSearchInput(): void {
    this.clearDebounceTimer()
    const delay = this.options.searchDebounceMs ?? 300
    this.debounceTimer = setTimeout(() => this.runSearch(this.searchInput.value), delay)
  }

  private handleSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.callbacks.onCancel()
        this.close()
        break
      case 'ArrowDown':
        event.preventDefault()
        if (this.filteredItems.length > 0) {
          // focusRow already calls renderResults internally — drop the
          // redundant inline render that doubled the table rebuild cost.
          this.focusRow(0)
        }
        break
      case 'Enter':
        event.preventDefault()
        if (this.focusIndex >= 0 && this.filteredItems[this.focusIndex]) {
          this.handleSelect(this.filteredItems[this.focusIndex])
        }
        break
    }
  }

  private async runSearch(query: string): Promise<void> {
    if (this.isDestroyed) return
    this.setState('loading', 'Loading...')
    try {
      const results = await this.callbacks.fetchResults(query)
      if (this.isDestroyed) return
      // Async race guard: see equivalent comment in searchModal.ts.
      if (this.searchInput.value !== query) return
      this.items = results
      this.applyFilter()
    } catch {
      if (this.isDestroyed) return
      if (this.searchInput.value !== query) return
      this.setState('error', 'Search failed. Please try again.')
    }
  }

  private applyFilter(): void {
    const max = this.options.maxResults
    const filtered = max !== undefined && this.items.length > max ? this.items.slice(0, max) : this.items
    this.filteredItems = this.sortState ? this.sortItems(filtered, this.sortState) : filtered
    this.focusIndex = -1
    if (this.filteredItems.length === 0) {
      this.setState(this.items.length === 0 ? 'empty' : 'filtered-empty', this.items.length === 0 ? 'No results found.' : 'No matches.')
      this.resultsContainer.replaceChildren()
      return
    }
    this.setState('results', this.options.showCount ? `${this.filteredItems.length} result(s)` : '')
    this.renderResults()
  }

  private setState(state: StateKind, message: string): void {
    this.state = state
    this.statusRegion.textContent = message
  }

  // === Table rendering ===

  private renderResults(): void {
    // Detach per-render listeners from the PREVIOUS render before rebuilding
    // — without this, every sort / filter / focus change leaked cleanups.
    this.drainRowCleanups()
    this.resultsContainer.replaceChildren()
    const table = document.createElement('table')
    table.setAttribute('role', 'grid')
    table.className = 'table idevs-search-dropdown-table'
    Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' })

    table.appendChild(this.renderTableHeader())
    table.appendChild(this.renderTableBody())
    this.resultsContainer.appendChild(table)
    this.tableEl = table
  }

  private renderTableHeader(): HTMLTableSectionElement {
    const thead = document.createElement('thead')
    const row = document.createElement('tr')
    for (const col of this.options.columns) {
      const th = document.createElement('th')
      Object.assign(th.style, {
        padding: '0.3rem 0.5rem',
        borderBottom: '1px solid #dee2e6',
        textAlign: 'left',
        cursor: this.options.enableSorting ? 'pointer' : 'default',
      })
      if (col.width) th.style.width = col.width

      const direction = this.sortState?.field === col.field ? this.sortState.direction : 'none'
      th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none')

      const arrow = direction === 'asc' ? ' ▲' : direction === 'desc' ? ' ▼' : ''
      th.textContent = col.title + arrow

      if (this.options.enableSorting) {
        const onClick = () => this.toggleSort(col.field)
        th.addEventListener('click', onClick)
        this.rowCleanups.push(() => th.removeEventListener('click', onClick))
      }

      row.appendChild(th)
    }
    thead.appendChild(row)
    return thead
  }

  private renderTableBody(): HTMLTableSectionElement {
    const tbody = document.createElement('tbody')
    this.filteredItems.forEach((item, index) => {
      const tr = document.createElement('tr')
      tr.setAttribute('role', 'row')
      tr.setAttribute('tabindex', '-1')
      if (index === this.focusIndex) tr.classList.add('idevs-row-focused')
      Object.assign(tr.style, {
        cursor: 'pointer',
        backgroundColor: index === this.focusIndex ? '#e7f1ff' : '',
      })

      for (const col of this.options.columns) {
        const td = document.createElement('td')
        td.setAttribute('role', 'gridcell')
        Object.assign(td.style, { padding: '0.3rem 0.5rem', borderBottom: '1px solid #f0f0f0' })
        const raw = item[col.field]
        const text = col.formatter ? col.formatter(raw, item) : raw != null ? String(raw) : ''
        td.textContent = text
        tr.appendChild(td)
      }

      const onClick = () => this.handleSelect(item)
      tr.addEventListener('click', onClick)
      const onKey = (e: KeyboardEvent) => this.handleRowKeydown(e, index)
      tr.addEventListener('keydown', onKey)
      this.rowCleanups.push(() => {
        tr.removeEventListener('click', onClick)
        tr.removeEventListener('keydown', onKey)
      })

      tbody.appendChild(tr)
    })
    return tbody
  }

  private handleRowKeydown(event: KeyboardEvent, index: number): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (index < this.filteredItems.length - 1) this.focusRow(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (index > 0) {
          this.focusRow(index - 1)
        } else {
          // Returning to search input from row 0. Reset focus state AND
          // re-render to clear the .idevs-row-focused highlight (otherwise
          // the row stays visually selected even though focus has moved).
          this.focusIndex = -1
          this.renderResults()
          this.searchInput.focus()
        }
        break
      case 'Enter':
        event.preventDefault()
        this.handleSelect(this.filteredItems[index])
        break
      case 'Escape':
        event.preventDefault()
        this.callbacks.onCancel()
        this.close()
        break
    }
  }

  private focusRow(index: number): void {
    this.focusIndex = index
    this.renderResults()
    const rows = this.tableEl?.querySelectorAll<HTMLTableRowElement>('tbody tr')
    rows?.[index]?.focus()
  }

  private toggleSort(field: string): void {
    if (this.sortState?.field === field) {
      this.sortState = this.sortState.direction === 'asc' ? { field, direction: 'desc' } : null
    } else {
      this.sortState = { field, direction: 'asc' }
    }
    this.applyFilter()
  }

  private sortItems(items: Record<string, unknown>[], sort: SortState): Record<string, unknown>[] {
    if (!sort) return items
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      const av = a[sort.field]
      const bv = b[sort.field]
      if (av == null && bv == null) return 0
      if (av == null) return -direction
      if (bv == null) return direction
      if (av < bv) return -direction
      if (av > bv) return direction
      return 0
    })
  }

  private handleSelect(item: Record<string, unknown>): void {
    this.close()
    this.callbacks.onSelect(item)
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
  }
}

// Re-export the shared types so consumers only need this module.
export type { ResultColumn }
