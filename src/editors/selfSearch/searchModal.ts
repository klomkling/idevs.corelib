import type { ResultColumn } from './columnFormatters'

/**
 * Built-in modal presentation for IdevsSelfSearchButtonEditor. Renders a
 * full-screen overlay with a results grid; supports keyboard navigation
 * (ArrowUp/Down/Enter/Escape), debounced server-side search via
 * fetchResults, sort, loading/error/empty states, and WAI-ARIA dialog
 * semantics (role="dialog" + aria-modal + aria-labelledby).
 *
 * Note: search is server-driven — the typed query is forwarded to the
 * caller's fetchResults callback. There is no client-side filter on top
 * of the returned results (only maxResults truncation + optional sort).
 *
 * Focus behavior: on open, focus moves to the search input; on close (via
 * Escape, click-outside, or selection), focus returns to whatever element
 * was active when open() was called. NOTE: this is focus RESTORATION, not
 * a full focus trap — Tab/Shift+Tab are not intercepted, so keyboard users
 * pressing Tab past the last focusable element can exit the dialog into the
 * page underneath. A proper focus trap is a planned follow-up; until then,
 * Escape provides a reliable dismiss path.
 *
 * The controller communicates with the parent editor via constructor-injected
 * callbacks — no direct back-reference. Owns its own DOM and listener
 * lifecycle; `destroy()` removes all listeners and detaches the modal.
 *
 * NOTE: ~40% of this controller's table/keyboard/sort/state logic is
 * effectively duplicated in searchDropdown.ts. Intentional for now —
 * premature extraction risks an abstraction that fits neither cleanly.
 * Track in a follow-up issue: "selfSearch: extract shared resultsTable base".
 */

export type SearchPresentationCallbacks = {
  onSelect: (item: Record<string, unknown>) => void
  onCancel: () => void
  fetchResults: (searchText: string) => Promise<Record<string, unknown>[]>
}

export type SearchPresentationOptions = {
  columns: ResultColumn[]
  maxResults?: number
  enableSorting?: boolean
  showCount?: boolean
  searchPlaceholder?: string
  searchDebounceMs?: number
  title?: string
}

type SortState = { field: string; direction: 'asc' | 'desc' } | null

type StateKind = 'idle' | 'loading' | 'empty' | 'error' | 'results'

export class SearchModalController {
  private root!: HTMLDivElement
  private dialogEl!: HTMLDivElement
  private searchInput!: HTMLInputElement
  private resultsContainer!: HTMLDivElement
  private statusRegion!: HTMLDivElement
  private titleEl!: HTMLHeadingElement
  private closeBtn!: HTMLButtonElement
  private tableEl: HTMLTableElement | null = null
  private items: Record<string, unknown>[] = []
  private filteredItems: Record<string, unknown>[] = []
  private focusIndex = -1
  private sortState: SortState = null
  private state: StateKind = 'idle'
  private invokerElement: HTMLElement | null = null
  /**
   * Pending focus timer scheduled by open(). Tracked so close()/destroy()
   * can cancel it — without cancellation, a fast open-then-close sequence
   * would let the deferred focus fire AFTER close()'s focus restoration,
   * stealing focus back from the invoker.
   */
  private openFocusTimer?: ReturnType<typeof setTimeout>
  /** Controller-lifetime listeners. Drained only in destroy(). */
  private cleanups: Array<() => void> = []
  /**
   * Per-render listeners attached to table cells/rows/headers. Drained at
   * the start of every renderResults() so the cleanup array doesn't grow
   * unbounded as the user sorts, filters, or navigates rows.
   */
  private rowCleanups: Array<() => void> = []
  private debounceTimer?: ReturnType<typeof setTimeout>
  private isDestroyed = false
  private readonly id: string
  private readonly titleId: string

  constructor(
    private parent: HTMLElement,
    private options: SearchPresentationOptions,
    private callbacks: SearchPresentationCallbacks,
  ) {
    this.id = `idevs-search-modal-${Math.random().toString(36).slice(2, 10)}`
    this.titleId = `${this.id}-title`
    this.build()
  }

  open(initialQuery = ''): void {
    if (this.isDestroyed) return
    this.invokerElement = document.activeElement as HTMLElement | null
    this.root.style.display = 'flex'
    this.dialogEl.setAttribute('aria-modal', 'true')
    this.searchInput.value = initialQuery
    this.runSearch(initialQuery)
    // Focus the search box once the dialog is visible. Stored for
    // cancellation so an immediate close() doesn't let this timer fire
    // afterward and steal focus from the restored invoker.
    this.clearOpenFocusTimer()
    this.openFocusTimer = setTimeout(() => {
      this.openFocusTimer = undefined
      if (this.isDestroyed) return
      // Guard against open-then-close races: the dialog must still be
      // visible by the time we focus its input.
      if (this.root.style.display === 'none') return
      this.searchInput.focus()
    }, 0)
  }

  close(): void {
    if (this.isDestroyed) return
    this.clearOpenFocusTimer()
    this.root.style.display = 'none'
    this.dialogEl.setAttribute('aria-modal', 'false')
    // Return focus to the element that opened us.
    this.invokerElement?.focus()
    this.invokerElement = null
  }

  private clearOpenFocusTimer(): void {
    if (this.openFocusTimer !== undefined) {
      clearTimeout(this.openFocusTimer)
      this.openFocusTimer = undefined
    }
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
        /* teardown noise is not actionable */
      }
    }
    this.cleanups = []
    this.root.remove()
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
    this.root = document.createElement('div')
    this.root.className = 'idevs-search-modal-overlay'
    this.root.setAttribute('role', 'presentation')
    Object.assign(this.root.style, {
      display: 'none',
      position: 'fixed',
      inset: '0',
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '4rem',
      zIndex: '1050',
    })

    this.dialogEl = document.createElement('div')
    this.dialogEl.setAttribute('role', 'dialog')
    this.dialogEl.setAttribute('aria-modal', 'false')
    this.dialogEl.setAttribute('aria-labelledby', this.titleId)
    this.dialogEl.id = this.id
    this.dialogEl.className = 'idevs-search-modal-dialog'
    Object.assign(this.dialogEl.style, {
      backgroundColor: '#fff',
      borderRadius: '6px',
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    })

    this.buildHeader()
    this.buildBody()
    this.buildFooter()

    this.root.appendChild(this.dialogEl)
    this.parent.appendChild(this.root)

    this.wireListeners()
  }

  private buildHeader(): void {
    const header = document.createElement('div')
    header.className = 'idevs-search-modal-header'
    Object.assign(header.style, {
      padding: '0.75rem 1rem',
      borderBottom: '1px solid #dee2e6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    })

    this.titleEl = document.createElement('h3')
    this.titleEl.id = this.titleId
    this.titleEl.textContent = this.options.title ?? 'Search Results'
    Object.assign(this.titleEl.style, { margin: '0', fontSize: '1.1rem' })

    this.closeBtn = document.createElement('button')
    this.closeBtn.type = 'button'
    this.closeBtn.setAttribute('aria-label', 'Close')
    this.closeBtn.className = 'idevs-search-modal-close'
    this.closeBtn.textContent = '✕'
    Object.assign(this.closeBtn.style, {
      border: 'none',
      background: 'transparent',
      fontSize: '1.2rem',
      cursor: 'pointer',
    })

    header.append(this.titleEl, this.closeBtn)
    this.dialogEl.appendChild(header)
  }

  private buildBody(): void {
    const body = document.createElement('div')
    body.className = 'idevs-search-modal-body'
    Object.assign(body.style, {
      padding: '0.75rem 1rem',
      flex: '1',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      overflow: 'hidden',
    })

    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'form-control idevs-search-modal-input'
    this.searchInput.placeholder = this.options.searchPlaceholder ?? 'Search results...'
    this.searchInput.setAttribute('aria-controls', `${this.id}-results`)

    this.resultsContainer = document.createElement('div')
    this.resultsContainer.id = `${this.id}-results`
    this.resultsContainer.className = 'idevs-search-modal-results'
    Object.assign(this.resultsContainer.style, { flex: '1', overflowY: 'auto' })

    this.statusRegion = document.createElement('div')
    this.statusRegion.setAttribute('role', 'status')
    this.statusRegion.setAttribute('aria-live', 'polite')
    this.statusRegion.className = 'idevs-search-modal-status'
    Object.assign(this.statusRegion.style, {
      padding: '0.5rem',
      textAlign: 'center',
      color: '#666',
    })

    body.append(this.searchInput, this.resultsContainer, this.statusRegion)
    this.dialogEl.appendChild(body)
  }

  private buildFooter(): void {
    const footer = document.createElement('div')
    footer.className = 'idevs-search-modal-footer'
    Object.assign(footer.style, {
      padding: '0.5rem 1rem',
      borderTop: '1px solid #dee2e6',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '0.5rem',
    })

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'btn btn-secondary'
    cancelBtn.textContent = 'Cancel'
    // Use bind() so the listener is tracked in cleanups and removed in
    // destroy() — keeps the controller's "destroy removes all listeners"
    // contract honest and prevents retaining the closure after teardown.
    this.bind(cancelBtn, 'click', () => this.handleCancel())

    footer.appendChild(cancelBtn)
    this.dialogEl.appendChild(footer)
  }

  private wireListeners(): void {
    this.bind(this.closeBtn, 'click', () => this.handleCancel())
    this.bind(this.searchInput, 'input', () => this.handleSearchInput())
    this.bind(this.searchInput, 'keydown', e => this.handleSearchKeydown(e as KeyboardEvent))
    // Click outside the dialog cancels (per common modal UX).
    this.bind(this.root, 'mousedown', e => {
      if (e.target === this.root) this.handleCancel()
    })
  }

  private bind(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler)
    this.cleanups.push(() => target.removeEventListener(type, handler))
  }

  // === Search / state ===

  private handleSearchInput(): void {
    this.clearDebounceTimer()
    const delay = this.options.searchDebounceMs ?? 300
    this.debounceTimer = setTimeout(() => {
      this.runSearch(this.searchInput.value)
    }, delay)
  }

  private handleSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.handleCancel()
        break
      case 'ArrowDown':
        event.preventDefault()
        if (this.filteredItems.length > 0) {
          // focusResultsRow already calls renderResults internally — no
          // need for a separate inline render here.
          this.focusResultsRow(0)
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
      // Async race guard: discard stale results when the user has typed a
      // newer query while this fetch was in flight. Without this, an
      // earlier-but-slower fetch could overwrite a later-but-faster one.
      if (this.searchInput.value !== query) return
      this.items = results
      this.applyFilter()
    } catch {
      if (this.isDestroyed) return
      // Same race guard for errors — don't flash an error from a stale
      // request after a newer query is already pending/applied.
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
      // Single empty state — no client-side filtering exists, so the only
      // way to get here is items.length === 0 OR maxResults === 0. Either
      // way "No results found." is accurate from the user's perspective.
      this.setState('empty', 'No results found.')
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
    // Detach per-render listeners from the PREVIOUS render before building
    // a fresh table — without this, every sort / filter / focus change
    // leaked cleanups into the unbounded array.
    this.drainRowCleanups()
    this.resultsContainer.replaceChildren()
    const table = document.createElement('table')
    table.setAttribute('role', 'grid')
    table.className = 'table table-hover idevs-search-modal-table'
    Object.assign(table.style, { width: '100%', borderCollapse: 'collapse' })

    table.appendChild(this.renderTableHeader())
    table.appendChild(this.renderTableBody())

    this.resultsContainer.appendChild(table)
    this.tableEl = table
  }

  private renderTableHeader(): HTMLTableSectionElement {
    const thead = document.createElement('thead')
    const row = document.createElement('tr')

      const th = document.createElement('th')
      th.setAttribute('role', 'columnheader')
      Object.assign(th.style, {
        padding: '0.4rem 0.6rem',
        borderBottom: '2px solid #dee2e6',
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
        Object.assign(td.style, { padding: '0.4rem 0.6rem', borderBottom: '1px solid #f0f0f0' })
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
        if (index < this.filteredItems.length - 1) this.focusResultsRow(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (index > 0) {
          this.focusResultsRow(index - 1)
        } else {
          // Returning to search input from the first row. Reset focus state
          // AND re-render so the .idevs-row-focused class + background-color
          // are cleared (otherwise the row stays visually highlighted even
          // though keyboard focus has moved to the search input).
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
        this.handleCancel()
        break
    }
  }

  private focusResultsRow(index: number): void {
    this.focusIndex = index
    this.renderResults()
    const rows = this.tableEl?.querySelectorAll<HTMLTableRowElement>('tbody tr')
    rows?.[index]?.focus()
  }

  private toggleSort(field: string): void {
    if (this.sortState?.field === field) {
      this.sortState =
        this.sortState.direction === 'asc' ? { field, direction: 'desc' } : null
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

  private handleCancel(): void {
    this.close()
    this.callbacks.onCancel()
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
  }
}
