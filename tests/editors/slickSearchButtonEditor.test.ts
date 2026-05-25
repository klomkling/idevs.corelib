import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProps } from '@serenity-is/corelib'
import type { EditorOptions } from '@serenity-is/sleekgrid'
import { SlickSearchButtonEditor } from '../../src/editors/slickSearchButtonEditor'
import { installSearchDialogStub } from './_helpers/searchDialogStub'
import { createEntityGridStub } from './_helpers/entityGridStub'

const mounted: SlickSearchButtonEditor[] = []
let uninstallDialog: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  uninstallDialog = installSearchDialogStub()
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
  uninstallDialog?.()
})

function mountSlick(opts: { items?: Record<string, unknown>[] } = {}) {
  const grid = createEntityGridStub({ items: opts.items ?? [{ foo: 'bar' }] })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const props = {
    container,
    column: {
      field: 'foo',
      sourceItem: {
        editorParams: {
          searchDialogType: 'SearchDialogStub',
          idColumnName: 'id',
        },
      },
    },
    grid: grid.slickGrid,
  } as unknown as EditorProps<EditorOptions>
  const editor = new SlickSearchButtonEditor(props)
  mounted.push(editor)
  return { editor, container, grid }
}

function getInner(editor: SlickSearchButtonEditor) {
  return (editor as unknown as { editor: { domNode: HTMLInputElement } }).editor
}

describe('SlickSearchButtonEditor', () => {
  it('constructs and creates the underlying IdevsSearchButtonEditor', () => {
    const { editor } = mountSlick()
    vi.advanceTimersByTime(1)
    expect(getInner(editor)).toBeDefined()
  })

  it('listens for dataSelected and commits the value to the grid', () => {
    const { editor, grid } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)

    inner.domNode.dispatchEvent(
      new CustomEvent('dataSelected', { detail: { id: '42', name: 'Acme' } }),
    )
    vi.advanceTimersByTime(10)

    expect(grid.slickGrid.getEditorLock).toHaveBeenCalled()
    expect(grid.slickGrid.navigateNext).toHaveBeenCalled()
    expect(grid.slickGrid.editActiveCell).toHaveBeenCalled()
  })

  it('writes the idColumnName value through set_value chokepoint', () => {
    const { editor } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)
    inner.domNode.dispatchEvent(
      new CustomEvent('dataSelected', { detail: { id: '42', name: 'Acme' } }),
    )
    expect(inner.domNode.value).toBe('42')
  })

  it('ignores dataSelected with falsy detail', () => {
    const { editor, grid } = mountSlick()
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)
    inner.domNode.dispatchEvent(new CustomEvent('dataSelected', { detail: null }))
    expect(grid.slickGrid.getEditorLock).not.toHaveBeenCalled()
  })

  it('invokes onDataSelected callback exactly once (via inner editor, not double-fired by wrapper)', () => {
    // Regression: previously both the inner editor and the Slick wrapper
    // attached dataSelected listeners that called onDataSelected, causing
    // double-invocation. The wrapper now only handles commit + navigate.
    const onDataSelected = vi.fn()
    const grid = createEntityGridStub({ items: [{ foo: 'bar' }] })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const props = {
      container,
      column: {
        field: 'foo',
        sourceItem: {
          editorParams: {
            searchDialogType: 'SearchDialogStub',
            idColumnName: 'id',
            onDataSelected,
          },
        },
      },
      grid: grid.slickGrid,
    } as unknown as EditorProps<EditorOptions>
    const editor = new SlickSearchButtonEditor(props)
    mounted.push(editor)
    vi.advanceTimersByTime(1)
    const inner = getInner(editor)
    inner.domNode.dispatchEvent(
      new CustomEvent('dataSelected', { detail: { id: '7', name: 'Beta' } }),
    )
    expect(onDataSelected).toHaveBeenCalledTimes(1)
  })

  it('serializeValue returns the current inner editor value', () => {
    const { editor } = mountSlick({ items: [{ foo: '42' }] })
    vi.advanceTimersByTime(1)
    editor.loadValue({ foo: '42' })
    expect(editor.serializeValue()).toBe('42')
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
    const grid = createEntityGridStub({ items: [{ foo: 'bar' }] })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const props = {
      container,
      column: {
        field: 'foo',
        sourceItem: {
          editorParams: {
            searchDialogType: 'SearchDialogStub',
            idColumnName: 'id',
            maskedPattern: '0000-0000',
          },
        },
      },
      grid: grid.slickGrid,
    } as unknown as EditorProps<EditorOptions>
    const editor = new SlickSearchButtonEditor(props)
    mounted.push(editor)
    vi.advanceTimersByTime(1)

    const inner = getInner(editor)
    const displayInput = inner.domNode.parentElement!.querySelector<HTMLInputElement>(
      'input.editor',
    )!

    displayInput.value = '12345678'
    displayInput.dispatchEvent(new Event('input'))

    expect(displayInput.value).toBe('1234-5678')
    expect(inner.domNode.value).toBe('12345678')
  })
})
