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

  it('invokes onDataSelected callback when configured', () => {
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
})
