import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SearchDropdownController,
  type SearchDropdownOptions,
} from '../../../src/editors/selfSearch/searchDropdown'
import type { SearchPresentationCallbacks } from '../../../src/editors/selfSearch/searchModal'

const controllers: SearchDropdownController[] = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  controllers.splice(0).forEach(c => c.destroy())
  document.body.replaceChildren()
})

function mount(
  optsOverride: Partial<SearchDropdownOptions> = {},
  callbacksOverride: Partial<SearchPresentationCallbacks> = {},
) {
  const anchor = document.createElement('input')
  anchor.type = 'text'
  document.body.appendChild(anchor)

  const fetchResults = vi.fn(callbacksOverride.fetchResults ?? (() => Promise.resolve([] as Record<string, unknown>[])))
  const onSelect = vi.fn(callbacksOverride.onSelect ?? (() => {}))
  const onCancel = vi.fn(callbacksOverride.onCancel ?? (() => {}))

  const options: SearchDropdownOptions = {
    columns: [{ field: 'id', title: 'ID' }, { field: 'name', title: 'Name' }],
    ...optsOverride,
  }

  const controller = new SearchDropdownController(anchor, options, {
    fetchResults,
    onSelect,
    onCancel,
  })
  controllers.push(controller)
  return { controller, anchor, fetchResults, onSelect, onCancel }
}

describe('SearchDropdownController — DOM + ARIA', () => {
  it('sets aria-expanded=false + aria-controls on the anchor when constructed', () => {
    const { anchor } = mount()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    expect(anchor.getAttribute('aria-controls')).toMatch(/idevs-search-dropdown-/)
  })

  it('appends the panel to document.body (initially hidden)', () => {
    mount()
    const panel = document.querySelector('.idevs-search-dropdown-panel') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.style.display).toBe('none')
    expect(panel.parentElement).toBe(document.body)
  })
})

describe('SearchDropdownController — open/close lifecycle', () => {
  it('open() shows the panel with display=flex and toggles aria-expanded=true on the anchor', () => {
    const { controller, anchor, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    const panel = document.querySelector('.idevs-search-dropdown-panel') as HTMLElement
    // 'flex' so the panel's flexDirection:column + child flex:1 take effect.
    expect(panel.style.display).toBe('flex')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    expect(controller.isOpen()).toBe(true)
  })

  it('close() hides the panel and resets aria-expanded', () => {
    const { controller, anchor, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    controller.close()
    const panel = document.querySelector('.idevs-search-dropdown-panel') as HTMLElement
    expect(panel.style.display).toBe('none')
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    expect(controller.isOpen()).toBe(false)
  })

  it('destroy is idempotent', () => {
    const { controller } = mount()
    controller.destroy()
    expect(() => controller.destroy()).not.toThrow()
  })

  it('destroy clears aria-controls + aria-expanded from the anchor', () => {
    const { controller, anchor } = mount()
    // Pre-conditions from constructor wiring.
    expect(anchor.getAttribute('aria-controls')).toMatch(/idevs-search-dropdown-/)
    expect(anchor.getAttribute('aria-expanded')).toBe('false')

    controller.destroy()

    // After destroy: stale attrs would point to a non-existent panel.
    expect(anchor.getAttribute('aria-controls')).toBeNull()
    expect(anchor.getAttribute('aria-expanded')).toBeNull()
  })

  it('destroy does NOT clobber aria-controls if a different controller re-bound the anchor', () => {
    // Defensive guard: only clear when the attribute still matches OUR id.
    const { controller, anchor } = mount()
    anchor.setAttribute('aria-controls', 'something-else')
    controller.destroy()
    expect(anchor.getAttribute('aria-controls')).toBe('something-else')
  })
})

describe('SearchDropdownController — click outside', () => {
  it('dismisses when clicking outside the panel and the anchor', async () => {
    const { controller, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(controller.isOpen()).toBe(false)
  })

  it('does NOT dismiss when clicking inside the panel', async () => {
    const { controller, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    const input = document.querySelector<HTMLInputElement>('.idevs-search-dropdown-input')!
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(onCancel).not.toHaveBeenCalled()
    expect(controller.isOpen()).toBe(true)
  })

  it('does NOT dismiss when clicking on the anchor', async () => {
    const { controller, anchor, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(controller.isOpen()).toBe(true)
  })
})

describe('SearchDropdownController — search + selection', () => {
  it('renders results in a role=grid table with combobox semantics', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    const grid = document.querySelector('[role="grid"]')
    expect(grid).not.toBeNull()
    expect(grid?.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('clicking a row invokes onSelect and closes the dropdown', async () => {
    const { controller, fetchResults, onSelect } = mount()
    fetchResults.mockResolvedValue([{ id: '5', name: 'Five' }])
    controller.open()
    await vi.runAllTimersAsync()

    document.querySelector<HTMLTableRowElement>('tbody tr')!.click()
    expect(onSelect).toHaveBeenCalledWith({ id: '5', name: 'Five' })
    expect(controller.isOpen()).toBe(false)
  })

  it('Escape in search input fires onCancel and closes', async () => {
    const { controller, fetchResults, onCancel } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()

    const input = document.querySelector<HTMLInputElement>('.idevs-search-dropdown-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(controller.isOpen()).toBe(false)
  })

  it('shows empty state when no results', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    await vi.runAllTimersAsync()
    expect(document.querySelector('.idevs-search-dropdown-status')?.textContent).toBe('No results found.')
  })

  it('shows error state when fetchResults rejects', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockRejectedValue(new Error('boom'))
    controller.open()
    await vi.runAllTimersAsync()
    expect(document.querySelector('.idevs-search-dropdown-status')?.textContent).toBe('Search failed. Please try again.')
  })
})

describe('SearchDropdownController — deferred-focus cancellation', () => {
  it('open()+close() before the focus timer fires does NOT focus the hidden panel', () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    controller.close()

    // Flush the deferred focus timer scheduled in open().
    vi.advanceTimersByTime(1)

    const searchInput = document.querySelector<HTMLInputElement>('.idevs-search-dropdown-input')!
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

describe('SearchDropdownController — async race guard', () => {
  it('discards stale fetchResults when the user has typed a newer query', async () => {
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

    const input = document.querySelector<HTMLInputElement>('.idevs-search-dropdown-input')!
    input.value = 'new'
    input.dispatchEvent(new Event('input'))
    await vi.runAllTimersAsync()

    resolveNew([{ id: 'NEW', name: 'New result' }])
    await vi.runAllTimersAsync()
    let cells = document.querySelectorAll<HTMLTableCellElement>('tbody td')
    expect(Array.from(cells).some(c => c.textContent === 'NEW')).toBe(true)

    resolveOld([{ id: 'OLD', name: 'Old result' }])
    await vi.runAllTimersAsync()
    cells = document.querySelectorAll<HTMLTableCellElement>('tbody td')
    expect(Array.from(cells).some(c => c.textContent === 'NEW')).toBe(true)
    expect(Array.from(cells).some(c => c.textContent === 'OLD')).toBe(false)
  })
})

describe('SearchDropdownController — keyboard nav highlight cleanup', () => {
  it('ArrowUp from row 0 clears the row highlight after returning to search input', async () => {
    const { controller, fetchResults } = mount()
    fetchResults.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }])
    controller.open()
    await vi.runAllTimersAsync()

    const searchInput = document.querySelector<HTMLInputElement>('.idevs-search-dropdown-input')!
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))

    let rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].classList.contains('idevs-row-focused')).toBe(true)

    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))

    rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].classList.contains('idevs-row-focused')).toBe(false)
  })
})

describe('SearchDropdownController — per-render listener cleanup', () => {
  it('rowCleanups does not grow unbounded across re-renders', async () => {
    const { controller, fetchResults } = mount({ enableSorting: true })
    fetchResults.mockResolvedValue([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    const internal = controller as unknown as { rowCleanups: Array<() => void> }
    const initialSize = internal.rowCleanups.length
    expect(initialSize).toBeGreaterThan(0)

    for (let i = 0; i < 5; i++) {
      const header = document.querySelectorAll<HTMLTableCellElement>('thead th')[0]
      header.click()
    }
    expect(internal.rowCleanups.length).toBe(initialSize)
  })
})

describe('SearchDropdownController — sorting', () => {
  it('clicking a header toggles asc/desc/none when enableSorting=true', async () => {
    const { controller, fetchResults } = mount({ enableSorting: true })
    fetchResults.mockResolvedValue([
      { id: '2', name: 'B' },
      { id: '1', name: 'A' },
    ])
    controller.open()
    await vi.runAllTimersAsync()

    const firstHeader = () => document.querySelectorAll<HTMLTableCellElement>('thead th')[0]
    firstHeader().click()
    expect(firstHeader().getAttribute('aria-sort')).toBe('ascending')
    firstHeader().click()
    expect(firstHeader().getAttribute('aria-sort')).toBe('descending')
    firstHeader().click()
    expect(firstHeader().getAttribute('aria-sort')).toBe('none')
  })
})
