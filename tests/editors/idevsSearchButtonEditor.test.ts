import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IdevsSearchButtonEditor,
  type IdevsSearchButtonEditorOptions,
} from '../../src/editors/idevsSearchButtonEditor'
import { SearchDialogStub, installSearchDialogStub } from './_helpers/searchDialogStub'

const mountedEditors: IdevsSearchButtonEditor[] = []
let uninstallDialog: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  uninstallDialog = installSearchDialogStub()
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
  uninstallDialog?.()
})

function mount(opts: IdevsSearchButtonEditorOptions = {}) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const editor = new IdevsSearchButtonEditor({
    element: input,
    searchDialogType: 'SearchDialogStub',
    ...opts,
  })
  mountedEditors.push(editor)
  return { editor, input }
}

function mountWithForm(opts: IdevsSearchButtonEditorOptions = {}) {
  const form = document.createElement('form')
  const label = document.createElement('label')
  label.textContent = 'Customer'
  const input = document.createElement('input')
  form.append(label, input)
  document.body.appendChild(form)
  const editor = new IdevsSearchButtonEditor({
    element: input,
    searchDialogType: 'SearchDialogStub',
    ...opts,
  })
  mountedEditors.push(editor)
  return { editor, input, label, form }
}

describe('IdevsSearchButtonEditor — scaffold', () => {
  it('constructs without throwing when searchDialogType is provided', () => {
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

  it('throws when searchDialogType is missing', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(
      () => new IdevsSearchButtonEditor({ element: input } as IdevsSearchButtonEditorOptions),
    ).toThrow(/searchDialogType/i)
  })
})

describe('IdevsSearchButtonEditor — value contract', () => {
  it('get_value returns empty string when domNode is empty', () => {
    const { editor } = mount()
    expect(editor.get_value()).toBe('')
  })

  it('set_value updates domNode and dispatches change once when value changes', () => {
    const { editor, input } = mount()
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('42')
    expect(input.value).toBe('42')
    expect(editor.get_value()).toBe('42')
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

  it('set_value(null) clears the domNode and dispatches change', () => {
    const { editor, input } = mount()
    editor.set_value('42')
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value(null)
    expect(input.value).toBe('')
    expect(editor.get_value()).toBe('')
    expect(change).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsSearchButtonEditor — rendering', () => {
  it('wraps the hidden input in a container and inserts the display input', () => {
    const { input } = mount()
    const container = input.parentElement
    expect(container?.classList.contains('search-button-editor')).toBe(true)

    const display = container?.querySelector<HTMLInputElement>('input.editor')
    expect(display).not.toBeNull()
    expect(display?.type).toBe('text')
  })

  it('inserts a search button into the container', () => {
    const { input } = mount()
    expect(input.parentElement?.querySelector('button.search-btn')).not.toBeNull()
  })

  it('inserts a clear button when canClear is undefined or true', () => {
    const { input: a } = mount()
    expect(a.parentElement?.querySelector('a.clear-btn')).not.toBeNull()
    const { input: b } = mount({ canClear: true })
    expect(b.parentElement?.querySelector('a.clear-btn')).not.toBeNull()
  })

  it('omits the clear button when canClear is false', () => {
    const { input } = mount({ canClear: false })
    expect(input.parentElement?.querySelector('a.clear-btn')).toBeNull()
  })

  it('moves the original domNode inside the search-button-editor container', () => {
    const { input } = mount()
    expect(input.parentElement?.classList.contains('search-button-editor')).toBe(true)
  })

  it('createDefaultElement returns an input with d-none class', () => {
    const el = IdevsSearchButtonEditor.createDefaultElement()
    expect(el.classList.contains('d-none')).toBe(true)
    expect(el.tagName).toBe('INPUT')
  })

  it('sets WAI-ARIA combobox attributes on the display input', () => {
    const { input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    expect(display.getAttribute('role')).toBe('combobox')
    expect(display.getAttribute('aria-autocomplete')).toBe('list')
    expect(display.getAttribute('aria-haspopup')).toBe('dialog')
    expect(display.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('IdevsSearchButtonEditor — display input integration', () => {
  it('typing in displayInput updates domNode via set_value chokepoint', () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    display.value = '42'
    display.dispatchEvent(new Event('input'))
    expect(editor.get_value()).toBe('42')
  })

  it('applies maskedPattern formatting on input', () => {
    const { input } = mount({ maskedPattern: '0000-0000' })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    display.value = '12345678'
    display.dispatchEvent(new Event('input'))
    expect(display.value).toBe('1234-5678')
    expect(input.value).toBe('12345678')
  })

  it('Enter triggers search-button click when enableEnterKeySearch is true', () => {
    const { input } = mount({ enableEnterKeySearch: true })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    const clickSpy = vi.fn()
    searchBtn.addEventListener('click', clickSpy)
    display.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsSearchButtonEditor — search button + dialog', () => {
  it('clicking the search button instantiates the dialog and calls dialogOpen', () => {
    const { input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    display.value = 'foo'

    const dialogOpenSpy = vi.fn()
    const originalOpen = SearchDialogStub.prototype.dialogOpen
    SearchDialogStub.prototype.dialogOpen = dialogOpenSpy

    searchBtn.click()

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1)

    SearchDialogStub.prototype.dialogOpen = originalOpen
  })

  it('dialog receives the current displayInput value as SearchValue', () => {
    const { input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    display.value = 'acme'
    searchBtn.click()
    expect(SearchDialogStub.lastInstance?.SearchValue).toBe('acme')
  })

  it('dialog receives filterKeys and criteriaKeys set on the editor', () => {
    const { editor, input } = mount()
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    editor.setFilterKeys({ region: 'EU' })
    editor.setCriteriaKeys(['active'])
    searchBtn.click()
    expect(SearchDialogStub.lastInstance?.FilterKeys).toEqual({ region: 'EU' })
    expect(SearchDialogStub.lastInstance?.CriteriaKeys).toEqual(['active'])
  })

  it('blocks search when input length is below minSearchLength', () => {
    const { input } = mount({ minSearchLength: 3 })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    display.value = 'ab'
    searchBtn.click()
    expect(SearchDialogStub.lastInstance).toBeNull()
  })
})

describe('IdevsSearchButtonEditor — readOnly state', () => {
  it('set_readOnly(true) disables the display input and the search button', () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    editor.set_readOnly(true)
    expect(display.readOnly).toBe(true)
    expect(display.classList.contains('readonly')).toBe(true)
    expect(searchBtn.hasAttribute('disabled')).toBe(true)
  })

  it('set_readOnly(false) re-enables the display input and search button', () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    editor.set_readOnly(true)
    editor.set_readOnly(false)
    expect(display.readOnly).toBe(false)
    expect(display.classList.contains('readonly')).toBe(false)
    expect(searchBtn.hasAttribute('disabled')).toBe(false)
  })

  it('get_readOnly reflects the current state', () => {
    const { editor } = mount()
    expect(editor.get_readOnly()).toBe(false)
    editor.set_readOnly(true)
    expect(editor.get_readOnly()).toBe(true)
  })
})

describe('IdevsSearchButtonEditor — required state', () => {
  it('set_required(true) inserts the required marker on the sibling label', () => {
    const { editor, label } = mountWithForm()
    editor.set_required(true)
    const sup = label.querySelector('sup[data-idevs-required-marker]')
    expect(sup).not.toBeNull()
    expect(sup?.textContent).toBe('*')
  })

  it('set_required(false) removes the marker', () => {
    const { editor, label } = mountWithForm()
    editor.set_required(true)
    editor.set_required(false)
    expect(label.querySelector('sup[data-idevs-required-marker]')).toBeNull()
  })

  it('syncs error classes from domNode to displayInput via the MutationObserver', async () => {
    const { input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!

    input.classList.add('error')
    vi.useRealTimers() // allow MutationObserver microtask to flush
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(display.classList.contains('error')).toBe(true)
    vi.useFakeTimers()
  })
})

describe('IdevsSearchButtonEditor — preSearch flow', () => {
  it('auto-selects when preSearch returns exactly one result', async () => {
    const { editor, input } = mount({ idColumnName: 'id', textColumnName: 'name' })
    editor.preSearch(() => Promise.resolve([{ id: '42', name: 'Acme' }]))

    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    display.value = 'acme'
    searchBtn.click()

    vi.useRealTimers()
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.useFakeTimers()

    expect(editor.get_value()).toBe('42')
    expect(display.value).toBe('Acme')
    expect(SearchDialogStub.lastInstance).toBeNull()
  })

  it('opens dialog with preItems when preSearch returns multiple results', async () => {
    const { editor, input } = mount()
    const items = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    editor.preSearch(() => Promise.resolve(items))

    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    searchBtn.click()

    vi.useRealTimers()
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.useFakeTimers()

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(SearchDialogStub.lastInstance?.preItems).toEqual(items)
  })

  it('opens dialog with no preItems when preSearch returns empty', async () => {
    const { editor, input } = mount()
    editor.preSearch(() => Promise.resolve([]))

    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    searchBtn.click()

    vi.useRealTimers()
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.useFakeTimers()

    expect(SearchDialogStub.lastInstance).not.toBeNull()
    expect(SearchDialogStub.lastInstance?.preItems).toBeUndefined()
  })
})

describe('IdevsSearchButtonEditor — setDisplayText / clearDisplayText', () => {
  it('setDisplayText with a template renders the formatted display', () => {
    const { editor, input } = mount({ displayTemplate: '{id} — {value}' })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    editor.setDisplayText('42', 'Acme')
    expect(display.value).toBe('42 — Acme')
  })

  it('setDisplayText uses default template when none configured', () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    editor.setDisplayText('42', 'Acme')
    expect(display.value).toBe('42 - Acme')
  })

  it('clearDisplayText empties the display input', () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    editor.setDisplayText('42', 'Acme')
    editor.clearDisplayText()
    expect(display.value).toBe('')
  })
})

describe('IdevsSearchButtonEditor — selection + subscribers', () => {
  it('handleSelection routes through set_value with idColumnName', () => {
    const { editor, input } = mount({ idColumnName: 'id', textColumnName: 'name' })
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!

    const editorAny = editor as unknown as { handleSelection: (d: unknown) => void }
    editorAny.handleSelection({ id: '7', name: 'Alpha' })

    expect(editor.get_value()).toBe('7')
    expect(display.value).toBe('Alpha')
  })

  it('invokes onDataSelected and subscribers on selection', () => {
    const onDataSelected = vi.fn()
    const sub = vi.fn()
    const { editor } = mount({ idColumnName: 'id', onDataSelected })
    editor.subscribe(sub)

    const editorAny = editor as unknown as { handleSelection: (d: unknown) => void }
    editorAny.handleSelection({ id: '1' })

    expect(onDataSelected).toHaveBeenCalledTimes(1)
    expect(sub).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsSearchButtonEditor — onPreSearch from options', () => {
  it('wires options.onPreSearch as the preSearchCallback (no preSearch() call needed)', async () => {
    const callback = vi.fn(() => Promise.resolve([{ id: '9', name: 'FromOpts' }]))
    const { editor, input } = mount({
      idColumnName: 'id',
      textColumnName: 'name',
      onPreSearch: callback,
    })
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    display.value = 'foo'
    searchBtn.click()
    expect(callback).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.useFakeTimers()

    // Single-result auto-select still fires (proves the wiring worked end-to-end)
    expect(editor.get_value()).toBe('9')
  })
})

describe('IdevsSearchButtonEditor — dataSelected listener (no leak)', () => {
  it('handleSelection fires exactly once per selection even after multiple openDialog calls', () => {
    const onDataSelected = vi.fn()
    const { input } = mount({ idColumnName: 'id', onDataSelected })
    const searchBtn = input.parentElement!.querySelector<HTMLButtonElement>('button.search-btn')!

    // Open the dialog three times — previously this leaked one listener per call.
    searchBtn.click()
    searchBtn.click()
    searchBtn.click()

    // Now fire dataSelected ONCE. The leak would cause N invocations.
    input.dispatchEvent(new CustomEvent('dataSelected', { detail: { id: '42' } }))

    expect(onDataSelected).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsSearchButtonEditor — destroy', () => {
  it('destroy is idempotent', () => {
    const { editor } = mount()
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)
    expect(() => editor.destroy()).not.toThrow()
  })

  it('destroy stops the validation observer (post-destroy class changes do NOT sync)', async () => {
    const { editor, input } = mount()
    const display = input.parentElement!.querySelector<HTMLInputElement>('input.editor')!
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)

    display.classList.remove('error')
    input.classList.add('error')

    vi.useRealTimers()
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.useFakeTimers()

    expect(display.classList.contains('error')).toBe(false)
  })

  it('destroy clears subscribers (post-destroy handleSelection does not invoke them)', () => {
    const { editor } = mount({ idColumnName: 'id' })
    const sub = vi.fn()
    editor.subscribe(sub)
    editor.destroy()
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)

    const editorAny = editor as unknown as { handleSelection: (d: unknown) => void }
    editorAny.handleSelection({ id: '1' })
    expect(sub).not.toHaveBeenCalled()
  })
})
