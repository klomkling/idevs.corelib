import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProps } from '@serenity-is/corelib'
import type { EditorOptions } from '@serenity-is/sleekgrid'
import { SlickEditorBase } from '../../src/editors/slickEditorBase'
import { createEntityGridStub } from './_helpers/entityGridStub'

class FakeInnerEditor {
  public domNode: HTMLInputElement
  public _value: unknown = ''
  public destroyed = false
  public props = { grid: undefined as { slickGrid: unknown } | undefined }

  constructor() {
    this.domNode = document.createElement('input')
  }

  get value(): unknown {
    return this._value
  }

  set value(v: unknown) {
    this._value = v
    this.domNode.value = (v as string) ?? ''
  }

  destroy(): void {
    this.destroyed = true
  }
}

class TestableSlickEditor extends SlickEditorBase<FakeInnerEditor, EditorOptions> {
  static instances: TestableSlickEditor[] = []

  constructor(props: EditorProps<EditorOptions>) {
    super(props)
    TestableSlickEditor.instances.push(this)
  }

  protected createEditor(_props: EditorProps<EditorOptions>): FakeInnerEditor {
    return new FakeInnerEditor()
  }

  // Expose protected helpers for testing.
  callSetEditorValue(v: unknown): void {
    this.setEditorValue(v)
  }

  callAddEventListener(target: EventTarget, type: string, listener: EventListener): void {
    this.addEventListener(target, type, listener)
  }

  getInnerEditor(): FakeInnerEditor {
    return this.editor
  }
}

const mounted: TestableSlickEditor[] = []

function mount(opts: { field?: string; grid?: unknown } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const field = opts.field ?? 'foo'
  const props = {
    container,
    column: { field, sourceItem: { editorParams: {} } },
    grid: opts.grid,
  } as unknown as EditorProps<EditorOptions>
  const editor = new TestableSlickEditor(props)
  mounted.push(editor)
  return { editor, container }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  mounted.splice(0).forEach(e => {
    try {
      e.destroy()
    } catch {
      /* ignore re-destroy */
    }
  })
  document.body.replaceChildren()
  TestableSlickEditor.instances = []
})

describe('SlickEditorBase — lifecycle', () => {
  it('constructs and exposes the inner editor', () => {
    const { editor } = mount()
    expect(editor.getInnerEditor()).toBeDefined()
  })

  it('loadValue reads from item and stores originalValue', () => {
    const { editor } = mount()
    editor.loadValue({ foo: 'bar' })
    expect(editor.serializeValue()).toBe('bar')
    expect(editor.isValueChanged()).toBe(false)
  })

  it('isValueChanged detects mutation of the inner value', () => {
    const { editor } = mount()
    editor.loadValue({ foo: 'bar' })
    editor.callSetEditorValue('baz')
    expect(editor.isValueChanged()).toBe(true)
  })

  it('applyValue writes back to the item', () => {
    const { editor } = mount()
    const target: Record<string, unknown> = {}
    editor.applyValue(target, 'committed')
    expect(target.foo).toBe('committed')
  })

  it('validate returns valid:true by default', () => {
    const { editor } = mount()
    expect(editor.validate()).toEqual({ valid: true })
  })

  it('destroy calls inner editor destroy and isDestroyed gates subsequent calls', () => {
    const { editor } = mount()
    const inner = editor.getInnerEditor()
    editor.loadValue({ foo: 'bar' })
    editor.destroy()
    expect(inner.destroyed).toBe(true)
    expect(editor.serializeValue()).toBe(null)
    expect(editor.isValueChanged()).toBe(false)
  })

  it('destroy is idempotent', () => {
    const { editor } = mount()
    editor.destroy()
    expect(() => editor.destroy()).not.toThrow()
  })
})

describe('SlickEditorBase — listener cleanup', () => {
  it('addEventListener registers a removable listener', () => {
    const { editor } = mount()
    vi.advanceTimersByTime(1)

    const target = document.createElement('div')
    document.body.appendChild(target)
    const handler = vi.fn()
    editor.callAddEventListener(target, 'click', handler)

    target.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    editor.destroy()
    target.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('input event on the inner editor dispatches cellchange on the container', () => {
    const { editor, container } = mount()
    vi.advanceTimersByTime(1)
    const inner = editor.getInnerEditor()
    const cellChange = vi.fn()
    container.addEventListener('cellchange', cellChange)

    inner.domNode.dispatchEvent(new Event('input'))
    expect(cellChange).toHaveBeenCalledTimes(1)
  })

  it('Enter key triggers handleValueChange + commitValue', () => {
    const grid = createEntityGridStub({ items: [{ foo: 'bar' }] })
    const { editor } = mount({ grid: grid.slickGrid })
    editor.loadValue({ foo: 'old' })
    vi.advanceTimersByTime(1)
    editor.callSetEditorValue('new')

    const inner = editor.getInnerEditor()
    inner.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(grid.slickGrid.onCellChange.notify).toHaveBeenCalledTimes(1)
  })
})
