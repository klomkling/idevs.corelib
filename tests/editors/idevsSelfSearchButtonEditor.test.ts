import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock serviceCall from @serenity-is/corelib BEFORE importing the editor.
// We capture the most-recent options so tests can drive success/error.
type ServiceCallOpts = {
  service: string
  request?: Record<string, unknown>
  onSuccess?: (response: { Entities?: Record<string, unknown>[] }) => void
  onError?: (err: unknown) => void
}
const serviceCallStub = vi.fn<(opts: ServiceCallOpts) => void>()

vi.mock('@serenity-is/corelib', async importOriginal => {
  const actual = await importOriginal<typeof import('@serenity-is/corelib')>()
  return {
    ...actual,
    serviceCall: (opts: ServiceCallOpts) => serviceCallStub(opts),
  }
})

const { IdevsSelfSearchButtonEditor } = await import(
  '../../src/editors/idevsSelfSearchButtonEditor'
)
type Editor = InstanceType<typeof IdevsSelfSearchButtonEditor>

type Options = ConstructorParameters<typeof IdevsSelfSearchButtonEditor>[0]

const mountedEditors: Editor[] = []

beforeEach(() => {
  vi.useFakeTimers()
  serviceCallStub.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  mountedEditors.splice(0).forEach(e => {
    try {
      e.destroy()
    } catch {
      /* ignore */
    }
  })
  document.body.replaceChildren()
})

function mount(optsOverride: Partial<Options> = {}) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const editor = new IdevsSelfSearchButtonEditor({
    element: input,
    service: 'TestModule/Customer',
    idColumnName: 'CustomerId',
    textColumnName: 'CustomerName',
    ...optsOverride,
  } as Options)
  mountedEditors.push(editor)
  return { editor, input }
}

describe('IdevsSelfSearchButtonEditor — scaffold', () => {
  it('throws when service option is missing', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(
      () => new IdevsSelfSearchButtonEditor({ element: input } as Options),
    ).toThrow(/service/i)
  })

  it('constructs without throwing when service is provided', () => {
    expect(() => mount()).not.toThrow()
  })

  it('exposes the Serenity contract', () => {
    const { editor } = mount()
    expect(typeof editor.get_value).toBe('function')
    expect(typeof editor.set_value).toBe('function')
    expect(typeof editor.get_readOnly).toBe('function')
    expect(typeof editor.set_readOnly).toBe('function')
    expect(typeof editor.get_required).toBe('function')
    expect(typeof editor.set_required).toBe('function')
    expect(typeof editor.destroy).toBe('function')
  })

  it('renders a container with display input + search button', () => {
    const { input } = mount()
    const container = input.parentElement
    expect(container?.classList.contains('self-search-button-editor')).toBe(true)
    expect(container?.querySelector('input.editor')).not.toBeNull()
    expect(container?.querySelector('button.search-btn')).not.toBeNull()
  })
})

describe('IdevsSelfSearchButtonEditor — value contract', () => {
  it('set_value dispatches change exactly once when value changes', () => {
    const { editor, input } = mount()
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('42')
    expect(input.value).toBe('42')
    expect(change).toHaveBeenCalledTimes(1)
  })

  it('set_value does not dispatch when value is unchanged', () => {
    const { editor, input } = mount()
    editor.set_value('42')
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('42')
    expect(change).not.toHaveBeenCalled()
  })

  it('set_value(null) clears domNode', () => {
    const { editor, input } = mount()
    editor.set_value('42')
    editor.set_value(null)
    expect(input.value).toBe('')
    expect(editor.get_value()).toBe('')
  })
})

describe('IdevsSelfSearchButtonEditor — presentation switch', () => {
  it('defaults to modal presentation (no aria-expanded=true on dropdown anchor)', () => {
    const { input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    expect(display.getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('uses dropdown presentation when configured', () => {
    const { input } = mount({ presentation: 'dropdown' })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    expect(display.getAttribute('aria-haspopup')).toBe('listbox')
    expect(display.getAttribute('aria-expanded')).toBe('false')
    // Dropdown panel should be appended to body
    expect(document.querySelector('.idevs-search-dropdown-panel')).not.toBeNull()
  })

  it('search button click opens the modal presentation', async () => {
    const { input } = mount({ presentation: 'modal' })
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    serviceCallStub.mockImplementation(opts => {
      opts.onSuccess?.({ Entities: [] })
    })
    searchBtn.click()
    await vi.runAllTimersAsync()
    const overlay = document.querySelector('.idevs-search-modal-overlay') as HTMLElement
    expect(overlay.style.display).toBe('flex')
  })
})

describe('IdevsSelfSearchButtonEditor — service fetch', () => {
  it('performs serviceCall with searchText + filters + criteria', async () => {
    const { editor, input } = mount({
      service: 'Foo/Bar',
      serviceSearchMethod: 'List',
    })
    editor.setFilterKeys({ region: 'EU' })
    editor.setCriteriaKeys(['active'])

    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    display.value = 'acme'
    serviceCallStub.mockImplementation(opts => opts.onSuccess?.({ Entities: [] }))

    searchBtn.click()
    await vi.runAllTimersAsync()

    expect(serviceCallStub).toHaveBeenCalledTimes(1)
    const call = serviceCallStub.mock.calls[0][0]
    expect(call.service).toBe('Foo/Bar/List')
    expect(call.request?.searchText).toBe('acme')
    expect(call.request?.filters).toEqual({ region: 'EU' })
    expect(call.request?.Criteria).toEqual(['active'])
  })

  it('uses configured searchTextParam + filtersParam names', async () => {
    const { input } = mount({
      service: 'Foo/Bar',
      searchTextParam: 'q',
      filtersParam: 'where',
    })
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    serviceCallStub.mockImplementation(opts => opts.onSuccess?.({ Entities: [] }))
    searchBtn.click()
    await vi.runAllTimersAsync()
    const call = serviceCallStub.mock.calls[0][0]
    expect(call.request).toHaveProperty('q')
    expect(call.request).toHaveProperty('where')
  })

  it('blocks search when input is below minSearchLength', () => {
    const { input } = mount({ minSearchLength: 3 })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    display.value = 'ab'
    input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!.click()
    expect(serviceCallStub).not.toHaveBeenCalled()
  })
})

describe('IdevsSelfSearchButtonEditor — selection', () => {
  it('selecting a row sets value via chokepoint and updates displayInput', async () => {
    const { editor, input } = mount()
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!

    serviceCallStub.mockImplementation(opts =>
      opts.onSuccess?.({
        Entities: [{ CustomerId: '42', CustomerName: 'Acme' }],
      }),
    )

    searchBtn.click()
    await vi.runAllTimersAsync()

    document.querySelector<HTMLTableRowElement>('tbody tr')!.click()
    expect(editor.get_value()).toBe('42')
    expect(display.value).toBe('Acme')
  })

  it('fires dataSelected CustomEvent on the domNode with the selected item', async () => {
    const { input } = mount()
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    const detailSpy = vi.fn()
    input.addEventListener('dataSelected', e => detailSpy((e as CustomEvent).detail))

    serviceCallStub.mockImplementation(opts =>
      opts.onSuccess?.({
        Entities: [{ CustomerId: '7', CustomerName: 'Beta' }],
      }),
    )

    searchBtn.click()
    await vi.runAllTimersAsync()
    document.querySelector<HTMLTableRowElement>('tbody tr')!.click()

    expect(detailSpy).toHaveBeenCalledTimes(1)
    expect(detailSpy).toHaveBeenCalledWith({ CustomerId: '7', CustomerName: 'Beta' })
  })

  it('invokes onDataSelected and subscribers on selection', async () => {
    const onDataSelected = vi.fn()
    const sub = vi.fn()
    const { editor, input } = mount({ onDataSelected })
    editor.subscribe(sub)
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!

    serviceCallStub.mockImplementation(opts =>
      opts.onSuccess?.({ Entities: [{ CustomerId: '1', CustomerName: 'A' }] }),
    )
    searchBtn.click()
    await vi.runAllTimersAsync()
    document.querySelector<HTMLTableRowElement>('tbody tr')!.click()

    expect(onDataSelected).toHaveBeenCalledTimes(1)
    expect(sub).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsSelfSearchButtonEditor — clearSearchOnReopen', () => {
  it('passes empty initial query to the presentation when clearSearchOnReopen=true', async () => {
    const { input } = mount({ clearSearchOnReopen: true })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    display.value = 'previous query'

    serviceCallStub.mockImplementation(opts => opts.onSuccess?.({ Entities: [] }))
    searchBtn.click()
    await vi.runAllTimersAsync()

    const modalInput = document.querySelector<HTMLInputElement>('.idevs-search-modal-input')!
    expect(modalInput.value).toBe('')
  })
})

describe('IdevsSelfSearchButtonEditor — destroy', () => {
  it('destroy tears down the presentation controller', () => {
    const { editor } = mount({ presentation: 'modal' })
    expect(document.querySelector('.idevs-search-modal-overlay')).not.toBeNull()
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)
    expect(document.querySelector('.idevs-search-modal-overlay')).toBeNull()
  })

  it('destroy is idempotent', () => {
    const { editor } = mount()
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)
    expect(() => editor.destroy()).not.toThrow()
  })
})
