import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdevsDateEditor } from '../../src/editors/idevsDateEditor'

type FlatpickrOptions = {
  dateFormat?: string
  altInput?: boolean
  disable?: Array<(d: Date) => boolean>
  onReady?: (selectedDates: Date[], dateStr: string, instance: FlatpickrStub) => void
  onClose?: (selectedDates: Date[], dateStr: string, instance: FlatpickrStub) => void
  onChange?: (selectedDates: Date[], dateStr: string, instance: FlatpickrStub) => void
}

type FlatpickrStub = {
  input: HTMLInputElement
  altInput?: HTMLInputElement
  config: FlatpickrOptions & { dateFormat: string }
  calendarContainer: HTMLDivElement
  selectedDates: Date[]
  isOpen: boolean
  parseDate: (value: string, format: string) => Date | undefined
  setDate: (value: string, triggerChange: boolean, format?: string) => void
  clear: (triggerChange: boolean) => void
  set: (key: string, value: unknown) => void
  open: () => void
  close: () => void
  destroy: () => void
}

type InputWithFlatpickr = HTMLInputElement & { _flatpickr?: FlatpickrStub }

const mountedEditors: IdevsDateEditor[] = []

const parseDate = (value: string, format: string): Date | undefined => {
  if (!value) return undefined

  if (format === 'Y-m-d') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return undefined
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  if (format === 'd/m/Y') {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!match) return undefined
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  }

  return undefined
}

const waitForMutation = () => new Promise(resolve => setTimeout(resolve, 0))

function installFlatpickrStub() {
  const flatpickr = vi.fn((input: HTMLInputElement, options: FlatpickrOptions = {}) => {
    const instance: FlatpickrStub = {
      input,
      altInput: options.altInput ? document.createElement('input') : undefined,
      config: {
        ...options,
        dateFormat: options.dateFormat ?? 'Y-m-d',
      },
      calendarContainer: document.createElement('div'),
      selectedDates: [],
      isOpen: false,
      parseDate,
      setDate: (value: string, triggerChange: boolean) => {
        instance.input.value = value
        const parsed = parseDate(value, instance.config.dateFormat)
        instance.selectedDates = parsed ? [parsed] : []
        if (triggerChange) {
          instance.config.onChange?.(instance.selectedDates, instance.input.value, instance)
        }
      },
      clear: (triggerChange: boolean) => {
        instance.input.value = ''
        instance.selectedDates = []
        if (triggerChange) {
          instance.config.onChange?.(instance.selectedDates, instance.input.value, instance)
        }
      },
      set: (key: string, value: unknown) => {
        ;(instance.config as Record<string, unknown>)[key] = value
      },
      open: () => {
        instance.isOpen = true
      },
      close: () => {
        instance.isOpen = false
        instance.config.onClose?.(instance.selectedDates, instance.input.value, instance)
      },
      destroy: () => {
        delete (input as InputWithFlatpickr)._flatpickr
      },
    }

    ;(input as InputWithFlatpickr)._flatpickr = instance
    instance.config.onReady?.(instance.selectedDates, instance.input.value, instance)

    return instance
  })

  ;(globalThis as unknown as { flatpickr?: unknown }).flatpickr = flatpickr
}

function mountEditor(options: ConstructorParameters<typeof IdevsDateEditor>[0] = {}) {
  installFlatpickrStub()

  const input = document.createElement('input')
  input.type = 'text'
  document.body.appendChild(input)

  const editor = new IdevsDateEditor({ element: input, ...options })
  mountedEditors.push(editor)

  const fp = (input as InputWithFlatpickr)._flatpickr!
  return { editor, input, fp }
}

afterEach(() => {
  mountedEditors.splice(0).forEach(editor => editor.destroy())
  document.body.replaceChildren()
  ;(globalThis as unknown as { flatpickr?: unknown }).flatpickr = undefined
})

describe('IdevsDateEditor smoke tests', () => {
  it('set_value/get_value round-trips an ISO date and emits change exactly once on change', () => {
    const { editor, input } = mountEditor()
    const onChange = vi.fn()
    input.addEventListener('change', onChange)

    editor.set_value('2026-05-25')
    expect(editor.get_value()).toBe('2026-05-25')
    expect(onChange).toHaveBeenCalledTimes(1)

    editor.set_value('2026-05-25')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disable predicate keeps only the exact selected date enabled when read-only', () => {
    const { editor, input, fp } = mountEditor()
    editor.set_value('2026-05-25')
    input.classList.add('readonly')

    const disable = fp.config.disable?.[0]
    expect(disable).toBeTypeOf('function')
    expect(disable?.(new Date(2026, 4, 25))).toBe(false)
    expect(disable?.(new Date(2026, 5, 25))).toBe(true)
  })

  it('syncs validation classes from the input to the flatpickr altInput', async () => {
    const { input, fp } = mountEditor()
    expect(fp.altInput).toBeDefined()

    input.classList.add('error')
    await waitForMutation()
    expect(fp.altInput?.classList.contains('error')).toBe(true)

    input.classList.remove('error')
    await waitForMutation()
    expect(fp.altInput?.classList.contains('error')).toBe(false)
  })

  it('destroy() disconnects the class observer and detaches keyboard handlers', async () => {
    // Regression guard: an earlier autofix introduced a second `destroy()`
    // override that only detached keyboard handlers, leaving the original
    // one in place — TS2393 (Duplicate function implementation) broke CI
    // typecheck. The merged destroy() must perform ALL cleanup:
    //   1. disconnect the MutationObserver
    //   2. detach the keyboard handler attached in attachKeyboardHandlers
    //   3. remove the Fluent validationerror listener
    //   4. delegate to super.destroy()
    const { editor, input, fp } = mountEditor()
    const altInput = fp.altInput
    expect(altInput).toBeDefined()

    editor.destroy()
    // Avoid the afterEach double-destroy.
    const idx = mountedEditors.indexOf(editor)
    if (idx >= 0) mountedEditors.splice(idx, 1)

    // (1) Class observer disconnected: post-destroy class mutations on the
    // original input must NOT propagate to the altInput.
    altInput!.classList.remove('error', 'invalid', 'validation-error')
    input.classList.add('error')
    await waitForMutation()
    expect(altInput!.classList.contains('error')).toBe(false)

    // (2) Keyboard handler detached: dispatching ArrowDown on the target
    // must NOT trigger the handler that calls fp.open().
    fp.isOpen = false
    altInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(fp.isOpen).toBe(false)
  })
})
