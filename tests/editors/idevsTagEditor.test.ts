import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __applyCasing,
  __tagItemToText,
  IdevsTagEditor,
} from '../../src/editors/idevsTagEditor'

afterEach(() => {
  document.body.replaceChildren()
})

function mountEditor(
  options: ConstructorParameters<typeof IdevsTagEditor>[0] = {},
): {
  editor: IdevsTagEditor
  input: HTMLInputElement
  wrapper: HTMLDivElement
} {
  const input = document.createElement('input')
  input.type = 'text'
  document.body.appendChild(input)
  const editor = new IdevsTagEditor({ element: input, ...options })
  const wrapper = input.parentElement as HTMLDivElement
  return { editor, input, wrapper }
}

describe('__tagItemToText', () => {
  it('returns the string as-is', () => {
    expect(__tagItemToText('hello')).toBe('hello')
  })

  it('stringifies numbers', () => {
    expect(__tagItemToText(42)).toBe('42')
  })

  it('prefers item.text over toString()', () => {
    expect(__tagItemToText({ text: 'pretty', toString: () => '[object Object]' })).toBe('pretty')
  })

  it('falls back to toString() when text is absent', () => {
    expect(__tagItemToText({ toString: () => 'fallback' })).toBe('fallback')
  })

  it('falls back to toString() when text is the empty string', () => {
    expect(__tagItemToText({ text: '', toString: () => 'fallback' })).toBe('fallback')
  })
})

describe('__applyCasing', () => {
  it('uppercases when casing is "upper"', () => {
    expect(__applyCasing('hello', 'upper')).toBe('HELLO')
  })

  it('lowercases when casing is "lower"', () => {
    expect(__applyCasing('HELLO', 'lower')).toBe('hello')
  })

  it('returns the value unchanged when casing is "none"', () => {
    expect(__applyCasing('MiXeD', 'none')).toBe('MiXeD')
  })
})

describe('IdevsTagEditor — construction & ARIA wiring', () => {
  it('wraps the input in a tag-suggest-wrapper container', () => {
    const { input, wrapper } = mountEditor()
    expect(wrapper.classList.contains('tag-suggest-wrapper')).toBe(true)
    expect(wrapper.contains(input)).toBe(true)
  })

  it('creates a listbox dropdown sibling of the input', () => {
    const { input, wrapper } = mountEditor()
    const dropdown = wrapper.querySelector('.tag-suggest-dropdown')
    expect(dropdown).not.toBeNull()
    expect(dropdown?.getAttribute('role')).toBe('listbox')
    expect(dropdown?.id).toMatch(/^tag-dropdown-/)
    expect(input.getAttribute('aria-controls')).toBe(dropdown?.id)
  })

  it('applies the combobox ARIA pattern on the input', () => {
    const { input } = mountEditor()
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
  })

  it('applies the placeholder option to the input', () => {
    const { input } = mountEditor({ placeholder: 'Search…' })
    expect(input.getAttribute('placeholder')).toBe('Search…')
  })
})

describe('IdevsTagEditor — items setter', () => {
  it('renders one role="option" per item with a unique id', () => {
    const { editor, wrapper } = mountEditor()
    editor.items = ['alpha', 'beta', 'gamma']

    const options = wrapper.querySelectorAll<HTMLElement>('[role="option"]')
    expect(options).toHaveLength(3)
    expect(options[0]?.textContent).toBe('alpha')
    expect(options[1]?.textContent).toBe('beta')
    expect(options[2]?.textContent).toBe('gamma')

    const ids = new Set(Array.from(options).map(o => o.id))
    expect(ids.size).toBe(3)
  })

  it('rerenders cleanly when items are reassigned (no stale duplicates)', () => {
    const { editor, wrapper } = mountEditor()
    editor.items = ['a', 'b', 'c']
    editor.items = ['x', 'y']

    const options = wrapper.querySelectorAll<HTMLElement>('[role="option"]')
    expect(options).toHaveLength(2)
    expect(Array.from(options).map(o => o.textContent)).toEqual(['x', 'y'])
  })

  it('applies valueCasing to rendered option text', () => {
    const { editor, wrapper } = mountEditor({ valueCasing: 'upper' })
    editor.items = ['hello', 'world']

    const labels = Array.from(
      wrapper.querySelectorAll<HTMLElement>('[role="option"]'),
    ).map(o => o.textContent)
    expect(labels).toEqual(['HELLO', 'WORLD'])
  })
})

describe('IdevsTagEditor — set_value & valueCasing contract', () => {
  it('writes the value to the underlying input', () => {
    const { editor, input } = mountEditor()
    editor.set_value('hello')
    expect(input.value).toBe('hello')
    expect(editor.get_value()).toBe('hello')
  })

  it('applies valueCasing="upper" to programmatic writes', () => {
    const { editor, input } = mountEditor({ valueCasing: 'upper' })
    editor.set_value('hello')
    expect(input.value).toBe('HELLO')
  })

  it('applies valueCasing="lower" to programmatic writes', () => {
    const { editor, input } = mountEditor({ valueCasing: 'lower' })
    editor.set_value('HELLO')
    expect(input.value).toBe('hello')
  })

  it('coerces null/undefined to the empty string', () => {
    const { editor, input } = mountEditor()
    editor.set_value(null as unknown as string)
    expect(input.value).toBe('')
    expect(editor.get_value()).toBe('')
  })

  it('dispatches change + input exactly once when the value actually changes', () => {
    const { editor, input } = mountEditor()
    const change = vi.fn()
    const inputEvt = vi.fn()
    input.addEventListener('change', change)
    input.addEventListener('input', inputEvt)

    editor.set_value('first')
    expect(change).toHaveBeenCalledOnce()
    expect(inputEvt).toHaveBeenCalledOnce()
  })

  it('does not re-dispatch when set_value is called with the same value', () => {
    const { editor, input } = mountEditor()
    editor.set_value('first')

    const change = vi.fn()
    input.addEventListener('change', change)
    editor.set_value('first')
    expect(change).not.toHaveBeenCalled()
  })
})

describe('IdevsTagEditor — selectItem routes through set_value', () => {
  it('honors valueCasing when selecting an object item with text', () => {
    const { editor, input, wrapper } = mountEditor({ valueCasing: 'upper' })
    editor.items = [{ text: 'apple' }, { text: 'banana' }]

    const apple = wrapper.querySelector<HTMLElement>('[role="option"]')!
    const change = vi.fn()
    input.addEventListener('change', change)

    apple.click()

    expect(input.value).toBe('APPLE')
    expect(change).toHaveBeenCalledOnce()
  })
})

describe('IdevsTagEditor — required state & validation', () => {
  it('set_required(true) adds the required attribute and aria-required', () => {
    const { editor, input } = mountEditor()
    editor.set_required(true)
    expect(input.hasAttribute('required')).toBe(true)
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.classList.contains('required')).toBe(true)
  })

  it('set_required(false) removes the required attribute and aria-required', () => {
    const { editor, input } = mountEditor()
    editor.set_required(true)
    editor.set_required(false)
    expect(input.hasAttribute('required')).toBe(false)
    expect(input.hasAttribute('aria-required')).toBe(false)
    expect(input.classList.contains('required')).toBe(false)
  })

  it('inserts a * marker on the sibling label when set_required(true)', () => {
    const label = document.createElement('label')
    label.textContent = 'Tag'
    const container = document.createElement('div')
    container.appendChild(label)
    document.body.appendChild(container)

    const input = document.createElement('input')
    container.appendChild(input)

    const editor = new IdevsTagEditor({ element: input })
    editor.set_required(true)

    const marker = label.querySelector('sup[data-idevs-required-marker]')
    expect(marker).not.toBeNull()
    expect(marker?.textContent).toBe('*')

    editor.set_required(false)
    expect(label.querySelector('sup[data-idevs-required-marker]')).toBeNull()
  })

  it('aria-invalid reflects validation state, not requiredness', () => {
    const { editor, input } = mountEditor()
    editor.set_required(true)
    // empty + required → invalid
    expect(input.getAttribute('aria-invalid')).toBe('true')

    editor.set_value('something')
    // required + value → valid
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('validate() returns true when not required', () => {
    const { editor } = mountEditor()
    expect(editor['validate']()).toBe(true)
  })
})

describe('IdevsTagEditor — destroy cleanup', () => {
  it('removes the document click listener on destroy', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { editor } = mountEditor()
    editor.destroy()

    const callsForClick = removeSpy.mock.calls.filter(([type]) => type === 'click')
    expect(callsForClick.length).toBeGreaterThanOrEqual(1)
    removeSpy.mockRestore()
  })
})
