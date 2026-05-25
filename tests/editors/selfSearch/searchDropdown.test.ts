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
  it('open() shows the panel and toggles aria-expanded=true on the anchor', () => {
    const { controller, anchor, fetchResults } = mount()
    fetchResults.mockResolvedValue([])
    controller.open()
    const panel = document.querySelector('.idevs-search-dropdown-panel') as HTMLElement
    expect(panel.style.display).toBe('block')
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
