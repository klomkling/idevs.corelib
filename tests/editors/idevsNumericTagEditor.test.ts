import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IdevsNumericTagEditor,
  type IdevsNumericTagEditorOptions,
} from '../../src/editors/idevsNumericTagEditor'

const mountedEditors: IdevsNumericTagEditor[] = []

afterEach(() => {
  mountedEditors.splice(0).forEach(editor => editor.destroy())
  document.body.replaceChildren()
})

function mount(options: IdevsNumericTagEditorOptions = {}) {
  const input = document.createElement('input')
  input.type = 'text'
  document.body.appendChild(input)
  const editor = new IdevsNumericTagEditor({ element: input, ...options })
  mountedEditors.push(editor)
  return { editor, input }
}

type FormatFn = (v: unknown) => string
type ExtractFn = (v: string) => number | null

const asFormat = (e: IdevsNumericTagEditor): FormatFn =>
  (e as unknown as { formatDisplayText: FormatFn }).formatDisplayText.bind(e)

const asExtract = (e: IdevsNumericTagEditor): ExtractFn =>
  (e as unknown as { extractNumericValue: ExtractFn }).extractNumericValue.bind(e)

describe('IdevsNumericTagEditor — scaffold', () => {
  it('constructs without throwing and inherits IdevsTagEditor surface', () => {
    const { editor } = mount()
    expect(editor).toBeDefined()
    expect(typeof editor.get_value).toBe('function')
    expect(typeof editor.set_value).toBe('function')
    expect(typeof editor.destroy).toBe('function')
  })
})

describe('IdevsNumericTagEditor — formatDisplayText', () => {
  it('returns empty string for null / undefined / empty', () => {
    const { editor } = mount()
    expect(asFormat(editor)(null)).toBe('')
    expect(asFormat(editor)(undefined)).toBe('')
    expect(asFormat(editor)('')).toBe('')
  })

  it('renders a plain number when no prefix/suffix configured', () => {
    const { editor } = mount()
    expect(asFormat(editor)(42)).toBe('42')
  })

  it('applies prefix without space when addSpace=false', () => {
    const { editor } = mount({ prefix: '$' })
    expect(asFormat(editor)(42)).toBe('$42')
  })

  it('applies prefix with space when addSpace=true', () => {
    const { editor } = mount({ prefix: '$', addSpace: true })
    expect(asFormat(editor)(42)).toBe('$ 42')
  })

  it('applies suffix', () => {
    const { editor } = mount({ suffix: '%' })
    expect(asFormat(editor)(42)).toBe('42%')
  })

  it('applies both prefix and suffix with addSpace', () => {
    const { editor } = mount({ prefix: 'USD', suffix: 'only', addSpace: true })
    expect(asFormat(editor)(42)).toBe('USD 42 only')
  })

  it('uses specialValues when value matches', () => {
    const { editor } = mount({ prefix: '$', specialValues: { 0: 'Free', '-1': 'N/A' } })
    expect(asFormat(editor)(0)).toBe('Free')
    expect(asFormat(editor)(-1)).toBe('N/A')
    expect(asFormat(editor)(5)).toBe('$5')
  })
})

describe('IdevsNumericTagEditor — extractNumericValue', () => {
  it('strips prefix and parses the number', () => {
    const { editor } = mount({ prefix: '$' })
    expect(asExtract(editor)('$42')).toBe(42)
  })

  it('strips suffix and parses the number', () => {
    const { editor } = mount({ suffix: '%' })
    expect(asExtract(editor)('42%')).toBe(42)
  })

  it('returns null for unparseable input', () => {
    const { editor } = mount()
    expect(asExtract(editor)('not a number')).toBe(null)
  })

  it('returns null for empty input', () => {
    const { editor } = mount()
    expect(asExtract(editor)('')).toBe(null)
  })

  it('handles negative numbers', () => {
    const { editor } = mount({ prefix: '$' })
    expect(asExtract(editor)('$-5')).toBe(-5)
  })
})

describe('IdevsNumericTagEditor — formatDisplayValue', () => {
  it('reformats the input value and dispatches change/input exactly once if changed', () => {
    const { editor, input } = mount({ prefix: '$' })
    input.value = '42'
    const change = vi.fn()
    const inputEvt = vi.fn()
    input.addEventListener('change', change)
    input.addEventListener('input', inputEvt)

    editor.formatDisplayValue()

    expect(input.value).toBe('$42')
    expect(change).toHaveBeenCalledTimes(1)
    expect(inputEvt).toHaveBeenCalledTimes(1)
  })

  it('does NOT recurse when formatDisplayValue is re-entered via the change handler', () => {
    const { editor, input } = mount({ prefix: '$' })
    input.value = '42'
    input.addEventListener('change', () => editor.formatDisplayValue())
    expect(() => editor.formatDisplayValue()).not.toThrow()
  })

  it('does nothing when value is unchanged after reformat', () => {
    const { editor, input } = mount()
    input.value = '42'
    const change = vi.fn()
    input.addEventListener('change', change)
    editor.formatDisplayValue()
    expect(change).not.toHaveBeenCalled()
  })
})
