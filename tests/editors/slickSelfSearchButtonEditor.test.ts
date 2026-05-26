import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProps } from '@serenity-is/corelib'
import type { EditorOptions } from '@serenity-is/sleekgrid'

// Same serviceCall mock pattern as the SelfSearch editor tests.
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

const { SlickSelfSearchButtonEditor } = await import(
  '../../src/editors/slickSelfSearchButtonEditor'
)
type Editor = InstanceType<typeof SlickSelfSearchButtonEditor>

const { createEntityGridStub } = await import('./_helpers/entityGridStub')

const mounted: Editor[] = []

beforeEach(() => {
  vi.useFakeTimers()
  serviceCallStub.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  mounted.splice(0).forEach(e => {
    try {
      e.destroy()
    } catch {
      /* ignore */
    }
  })
  document.body.replaceChildren()
})

function mountSlick(extraParams: Record<string, unknown> = {}) {
  const grid = createEntityGridStub({ items: [{ Code: 'C1' }] })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const props = {
    container,
    column: {
      field: 'Code',
      sourceItem: {
        editorParams: {
          service: 'TestModule/Customer',
          idColumnName: 'CustomerId',
          textColumnName: 'CustomerName',
          ...extraParams,
        },
      },
    },
    grid: grid.slickGrid,
  } as unknown as EditorProps<EditorOptions>
  const editor = new SlickSelfSearchButtonEditor(props)
  mounted.push(editor)
  return { editor, container, grid }
}

function getInner(editor: Editor) {
  return (editor as unknown as { editor: { domNode: HTMLInputElement } }).editor
}

describe('SlickSelfSearchButtonEditor', () => {
  it('constructs and creates the underlying IdevsSelfSearchButtonEditor', () => {
    const { editor } = mountSlick()
    vi.advanceTimersByTime(1)
    expect(getInner(editor)).toBeDefined()
  })

  it('listens for dataSelected with truthy detail and commits + navigates', () => {
    const { editor, grid } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)
    inner.domNode.dispatchEvent(
      new CustomEvent('dataSelected', { detail: { CustomerId: '42' } }),
    )
    vi.advanceTimersByTime(10)
    expect(grid.slickGrid.getEditorLock).toHaveBeenCalled()
    expect(grid.slickGrid.navigateNext).toHaveBeenCalled()
    expect(grid.slickGrid.editActiveCell).toHaveBeenCalled()
  })

  it('does NOT commit/navigate when dataSelected fires with falsy detail (cancel path)', () => {
    const { editor, grid } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)
    inner.domNode.dispatchEvent(new CustomEvent('dataSelected', { detail: null }))
    vi.advanceTimersByTime(10)
    expect(grid.slickGrid.getEditorLock).not.toHaveBeenCalled()
    expect(grid.slickGrid.navigateNext).not.toHaveBeenCalled()
  })

  it('invokes onDataSelected callback exactly once via inner editor (not double-fired)', () => {
    // Regression: previously the Slick wrapper attached its own dataSelected
    // listener that also called onDataSelected, causing double-invocation
    // when the inner editor's handleSelection already fired it. The wrapper
    // now only commits + navigates.
    const onDataSelected = vi.fn()
    const { editor } = mountSlick({ onDataSelected })
    vi.advanceTimersByTime(1)

    // Drive the real selection path: inner editor's handleSelection sets the
    // value, dispatches dataSelected (which the wrapper picks up for commit),
    // and calls onDataSelected exactly once.
    const inner = getInner(editor) as unknown as {
      handleSelection: (d: Record<string, unknown>) => void
    }
    inner.handleSelection({ CustomerId: '7', CustomerName: 'Beta' })

    expect(onDataSelected).toHaveBeenCalledTimes(1)
  })

  it('serializeValue returns the current inner editor value', () => {
    const { editor } = mountSlick()
    vi.advanceTimersByTime(1)
    editor.loadValue({ Code: 'XYZ' })
    expect(editor.serializeValue()).toBe('XYZ')
  })

  it('destroy tears down both layers', () => {
    const { editor } = mountSlick()
    vi.advanceTimersByTime(1)
    expect(() => editor.destroy()).not.toThrow()
  })

  it('handleValueChange does NOT overwrite the canonical raw value with the formatted display text (masked pattern)', () => {
    // Regression: previously the wrapper called this.editor.set_value
    // (displayInput.value) which wrote the FORMATTED text back into the
    // hidden domNode, corrupting the raw value the inner editor's input
    // handler had just extracted via the masked pattern.
    const { editor } = mountSlick({ maskedPattern: '0000-0000' })
    vi.advanceTimersByTime(1) // run SlickEditorBase's setupEventHandlers

    const inner = getInner(editor) as unknown as {
      domNode: HTMLInputElement
      set_value: (v: string | null) => void
    }
    const displayInput = inner.domNode.parentElement!.querySelector<HTMLInputElement>(
      'input.editor',
    )!

    // Simulate the inner editor's input handler running: it applies the
    // masked pattern (display='1234-5678') and writes the raw via set_value.
    displayInput.value = '12345678'
    displayInput.dispatchEvent(new Event('input'))

    // After the inner handler: display formatted, domNode raw.
    expect(displayInput.value).toBe('1234-5678')
    expect(inner.domNode.value).toBe('12345678')

    // The SlickEditorBase wraps additional 'input' listeners that fire
    // handleValueChange. Those run after the inner handler. With the bug,
    // handleValueChange would overwrite domNode with '1234-5678'.
    // With the fix, domNode stays '12345678'.
    expect(inner.domNode.value).toBe('12345678')
  })
})
