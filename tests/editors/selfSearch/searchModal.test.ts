import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SearchModalController,
  type SearchPresentationCallbacks,
  type SearchPresentationOptions,
} from '../../../src/editors/selfSearch/searchModal'

const controllers: SearchModalController[] = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  controllers.splice(0).forEach(c => c.destroy())
  document.body.replaceChildren()
})

function mount(
  optsOverride: Partial<SearchPresentationOptions> = {},
  callbacksOverride: Partial<SearchPresentationCallbacks> = {},
): {
  controller: SearchModalController
  fetchResults: ReturnType<typeof vi.fn>
  onSelect: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
} {
  const fetchResults = vi.fn(callbacksOverride.fetchResults ?? (() => Promise.resolve([] as Record<string, unknown>[])))
  const onSelect = vi.fn(callbacksOverride.onSelect ?? (() => {}))
  const onCancel = vi.fn(callbacksOverride.onCancel ?? (() => {}))

  const options: SearchPresentationOptions = {
    columns: [{ field: 'id', title: 'ID' }, { field: 'name', title: 'Name' }],
    ...optsOverride,
  }

  const controller = new SearchModalController(document.body, options, {
    fetchResults,
    onSelect,
    onCancel,
  })
  controllers.push(controller)
  return { controller, fetchResults, onSelect, onCancel }
}

describe('SearchModalController — DOM + ARIA', () => {
  it('builds the modal with role=dialog + aria-labelledby + aria-modal=false initially', () => {
    mount()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('false')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('uses the provided title or falls back to "Search Results"', () => {
    mount()
    const title = document.querySelector('h3')
    expect(title?.textContent).toBe('Search Results')

    mount({ title: 'Find Customer' })
    const titles = document.querySelectorAll('h3')
    expect(titles[1]?.textContent).toBe('Find Customer')
  })

  it('starts hidden (display:none)', () => {
    mount()
    const overlay = document.querySelector('.idevs-search-modal-overlay') as HTMLElement
    expect(overlay.style.display).toBe('none')
  })
})

describe('SearchModalController — open/close lifecycle', () => {
  it('open() makes the overlay visible and sets aria-modal=true', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open('foo')

    const overlay = document.querySelector('.idevs-search-modal-overlay') as HTMLElement
    expect(overlay.style.display).toBe('flex')
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')

    // search input populated with the initial query
    const searchInput = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    expect(searchInput.value).toBe('foo')
  })

  it('close() restores focus to the invoker and hides the modal', () => {
    const invoker = document.createElement('button')
    document.body.appendChild(invoker)
    invoker.focus()

    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    vi.advanceTimersByTime(1) // flush the setTimeout in open

    controller.close()
    const overlay = document.querySelector('.idevs-search-modal-overlay') as HTMLElement
    expect(overlay.style.display).toBe('none')
    expect(document.activeElement).toBe(invoker)
  })

  it('destroy is idempotent', () => {
    const { controller } = mount()
    controller.destroy()
    expect(() => controller.destroy()).not.toThrow()
  })

  it('destroy removes the Cancel button click listener (no orphan invocation)', async () => {
    const { controller, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    const cancelBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
      .find(b => b.textContent === 'Cancel')
    expect(cancelBtn).toBeDefined()

    controller.destroy()
    // Removed from DOM, but if the click listener were still wired to a
    // retained closure, dispatching would fire onCancel again. Verify it
    // does NOT after destroy.
    onCancel.mockClear()
    cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('SearchModalController — search + filter', () => {
  it('fetchResults is invoked on open with the initial query', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([{ id: '1', name: 'A' }])
    controller.open('hello')
    await vi.runAllTimersAsync()
    expect(fetchResults).toHaveBeenCalledWith('hello')
  })

  it('renders results in a role=grid table with one row per item', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    const grid = document.querySelector('[role="grid"]')
    expect(grid).not.toBeNull()
    const rows = grid?.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
  })

  it('renders an empty state when results are empty', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()
    const status = document.querySelector('.idevs-search-modal-status')
    expect(status?.textContent).toBe('No results found.')
  })

  it('renders an error state when fetchResults rejects', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockRejectedValue(new Error('network'))
    controller.open()
    await vi.runAllTimersAsync()
    const status = document.querySelector('.idevs-search-modal-status')
    expect(status?.textContent).toBe('Search failed. Please try again.')
  })

  it('caps results at maxResults', async () => {
    const { controller, fetchResults } = mount({ maxResults: 2 })
    fetchResults.mockResolvedValue([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ])
    controller.open()
    await vi.runAllTimersAsync()
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('debounces input changes by searchDebounceMs', async () => {
    const { controller, fetchResults } = mount({ searchDebounceMs: 200 })
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()
    fetchResults.mockClear()

    const input = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    input.value = 'fo'
    input.dispatchEvent(new Event('input'))
    input.value = 'foo'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(100)
    expect(fetchResults).not.toHaveBeenCalled()
    vi.advanceTimersByTime(101)
    await vi.runAllTimersAsync()
    expect(fetchResults).toHaveBeenCalledTimes(1)
    expect(fetchResults).toHaveBeenCalledWith('foo')
  })
})

describe('SearchModalController — selection', () => {
  it('clicking a row invokes onSelect with the row item', async () => {
    const { controller, fetchResults, onSelect } = mount()
    fetchResults.mockResolvedValue([{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }])
    controller.open()
    await vi.runAllTimersAsync()

    const rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    rows[1].click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({ id: '2', name: 'Beta' })
  })

  it('ArrowDown + Enter on search input selects the first row', async () => {
    const { controller, fetchResults, onSelect } = mount()
    fetchResults.mockResolvedValue([{ id: '7', name: 'Seven' }])
    controller.open()
    await vi.runAllTimersAsync()

    const input = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onSelect).toHaveBeenCalledWith({ id: '7', name: 'Seven' })
  })

  it('Escape in search input fires onCancel and closes', async () => {
    const { controller, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    const input = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    const overlay = document.querySelector('.idevs-search-modal-overlay') as HTMLElement
    expect(overlay.style.display).toBe('none')
  })
})

describe('SearchModalController — sorting', () => {
  it('clicking a header with enableSorting toggles asc/desc/none', async () => {
    const { controller, fetchResults } = mount({ enableSorting: true })
    fetchResults.mockResolvedValue([
      { id: '2', name: 'B' },
      { id: '1', name: 'A' },
      { id: '3', name: 'C' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    const firstHeader = () => document.querySelectorAll<HTMLTableCellElement>('thead th')[0]

    firstHeader().click()
    let rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].textContent).toContain('1')
    expect(rows[2].textContent).toContain('3')
    expect(firstHeader().getAttribute('aria-sort')).toBe('ascending')

    firstHeader().click() // toggle to desc
    rows = document.querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('3')
    expect(firstHeader().getAttribute('aria-sort')).toBe('descending')

    firstHeader().click() // toggle off
    expect(firstHeader().getAttribute('aria-sort')).toBe('none')
  })

  it('header is not clickable when enableSorting is false', async () => {
    const { controller, fetchResults } = mount({ enableSorting: false })
    fetchResults.mockResolvedValue([{ id: '2', name: 'B' }, { id: '1', name: 'A' }])
    controller.open()
    await vi.runAllTimersAsync()

    const header = document.querySelector<HTMLTableCellElement>('thead th')!
    header.click()
    const rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    // Order unchanged (no sort applied)
    expect(rows[0].textContent).toContain('2')
  })
})

describe('SearchModalController — deferred-focus cancellation', () => {
  it('open()+close() before the focus timer fires does NOT steal focus from the invoker', () => {
    // Set up a focusable invoker, focus it, open the modal (which captures
    // the invoker), then close immediately — both BEFORE the setTimeout(0)
    // focus on the search input runs. Without the fix, the timer would
    // fire after close() and steal focus back from the invoker.
    const invoker = document.createElement('button')
    document.body.appendChild(invoker)
    invoker.focus()

    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    // close() runs while the open-focus timer is still pending
    controller.close()

    // Now flush the timer. With the bug, this would focus the search input.
    vi.advanceTimersByTime(1)

    const searchInput = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    expect(document.activeElement).not.toBe(searchInput)
  })

  it('destroy() cancels the pending open-focus timer', () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    controller.destroy()
    expect(() => vi.advanceTimersByTime(1)).not.toThrow()
  })
})

describe('SearchModalController — async race guard', () => {
  it('discards stale fetchResults when the user has typed a newer query', async () => {
    // Two fetches in flight. The OLDER one resolves AFTER the NEWER one.
    // Without the race guard, the older results would overwrite the newer.
    let resolveOld: (v: Record<string, unknown>[]) => void = () => {}
    let resolveNew: (v: Record<string, unknown>[]) => void = () => {}
    let callCount = 0

    const { controller } = mount({ searchDebounceMs: 0 }, {
      fetchResults: () => {
        callCount++
        return new Promise<Record<string, unknown>[]>(resolve => {
          if (callCount === 1) resolveOld = resolve
          else resolveNew = resolve
        })
      },
    })
    controller.open('old')

    const input = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    // Type a new query while the old fetch is in flight
    input.value = 'new'
    input.dispatchEvent(new Event('input'))
    await vi.runAllTimersAsync() // flush debounce → second fetch issued

    // Resolve newer first → should apply
    resolveNew([{ id: 'NEW', name: 'New result' }])
    await vi.runAllTimersAsync()
    let cells = document.querySelectorAll<HTMLTableCellElement>('tbody td')
    expect(Array.from(cells).some(c => c.textContent === 'NEW')).toBe(true)

    // Resolve older → should be DISCARDED (input.value is still 'new')
    resolveOld([{ id: 'OLD', name: 'Old result' }])
    await vi.runAllTimersAsync()
    cells = document.querySelectorAll<HTMLTableCellElement>('tbody td')
    expect(Array.from(cells).some(c => c.textContent === 'NEW')).toBe(true)
    expect(Array.from(cells).some(c => c.textContent === 'OLD')).toBe(false)
  })
})

describe('SearchModalController — keyboard nav highlight cleanup', () => {
  it('ArrowUp from row 0 clears the row highlight after returning to search input', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }])
    controller.open()
    await vi.runAllTimersAsync()

    // ArrowDown from search input puts focus on row 0 (highlighted).
    const searchInput = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))

    let rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].classList.contains('idevs-row-focused')).toBe(true)

    // ArrowUp from row 0 returns focus to search input AND clears highlight.
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))

    rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].classList.contains('idevs-row-focused')).toBe(false)
  })
})

describe('SearchModalController — per-render listener cleanup', () => {
  it('rowCleanups does not grow unbounded across re-renders', async () => {
    const { controller, fetchResults } = mount({ enableSorting: true })
    fetchResults.mockResolvedValue([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    // Internal access — verify the per-render array is drained on each render.
    const internal = controller as unknown as { rowCleanups: Array<() => void> }
    const initialSize = internal.rowCleanups.length

    // 3 rows + 2 headers (enableSorting) = 5 cleanups expected after first render.
    expect(initialSize).toBeGreaterThan(0)

    // Trigger 5 re-renders via sort toggles.
    for (let i = 0; i < 5; i++) {
      const header = document.querySelectorAll<HTMLTableCellElement>('thead th')[0]
      header.click()
    }

    // Should remain bounded (one render's worth), not 6× larger.
    expect(internal.rowCleanups.length).toBe(initialSize)
  })
})

describe('SearchModalController — count display', () => {
  it('shows result count in status when showCount is true', async () => {
    const { controller, fetchResults } = mount({ showCount: true })
    fetchResults.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }])
    controller.open()
    await vi.runAllTimersAsync()
    expect(document.querySelector('.idevs-search-modal-status')?.textContent).toBe('2 result(s)')
  })

  it('omits count when showCount is false', async () => {
    const { controller, fetchResults } = mount({ showCount: false })
    fetchResults.mockResolvedValue([{ id: '1', name: 'A' }])
    controller.open()
    await vi.runAllTimersAsync()
    expect(document.querySelector('.idevs-search-modal-status')?.textContent).toBe('')
  })
})
