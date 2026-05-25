import type { EditorOptions } from '@serenity-is/sleekgrid'
import type { EditorProps } from '@serenity-is/corelib'
import { SlickEditorBase } from './slickEditorBase'
import {
  IdevsSearchButtonEditor,
  type IdevsSearchButtonEditorOptions,
} from './idevsSearchButtonEditor'

type DataSelectedDetail = Record<string, unknown> | null | undefined

type SlickNavGrid = {
  getEditorLock?: () => { commitCurrentEdit: () => boolean }
  getActiveCell?: () => { row: number; cell: number } | null
  navigateNext?: () => void
  editActiveCell?: () => void
}

/**
 * SleekGrid column adapter wrapping IdevsSearchButtonEditor. Listens for the
 * `dataSelected` CustomEvent the parent editor dispatches on selection, then
 * commits the cell and advances to the next column.
 */
export class SlickSearchButtonEditor<P extends EditorOptions = EditorOptions>
  extends SlickEditorBase<IdevsSearchButtonEditor, P> {
  constructor(props: EditorProps<P>) {
    super(props)
  }

  protected createEditor(props: EditorProps<P>): IdevsSearchButtonEditor {
    const params = ((props.column as { sourceItem?: { editorParams?: unknown } } | undefined)?.sourceItem?.editorParams ??
      {}) as IdevsSearchButtonEditorOptions
    const opts: IdevsSearchButtonEditorOptions = { ...params }

    if (!props.container) {
      throw new Error('SlickSearchButtonEditor requires props.container')
    }
    const wrapper = document.createElement('div')
    props.container.appendChild(wrapper)

    return new IdevsSearchButtonEditor({
      ...opts,
      element: wrapper,
    } as unknown as ConstructorParameters<typeof IdevsSearchButtonEditor>[0])
  }

  protected override appendToContainer(props: EditorProps<P>): void {
    if (!props.container) return
    props.container.appendChild(this.editor.domNode)
    this.setupDataSelectionHandler(props)
  }

  protected override getInputElement(): HTMLInputElement | null {
    if (!this.editor) return null
    const container = this.editor.domNode.parentElement
    if (!container) return null
    return container.querySelector('input.editor') as HTMLInputElement | null
  }

  protected override handleValueChange(): void {
    const inputElement = this.getInputElement()
    if (!inputElement) return
    // Route through set_value to preserve the parent editor's chokepoint.
    this.editor.set_value(inputElement.value)
    super.handleValueChange()
  }

  private setupDataSelectionHandler(_props: EditorProps<P>): void {
    // The inner IdevsSearchButtonEditor already listens for `dataSelected` on
    // its own domNode and handles set_value + onDataSelected + subscribers
    // (single-chokepoint discipline). Because the inner listener was attached
    // first (during the inner editor's constructor, before this wrapper's
    // appendToContainer runs), it fires BEFORE this wrapper's listener — so
    // by the time we commit, the canonical value is already set. This wrapper
    // is only responsible for grid-side behavior: commit + navigate.
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DataSelectedDetail>).detail
      if (!detail) return

      const slickGrid = this.grid as SlickNavGrid | null
      if (!slickGrid) return
      slickGrid.getEditorLock?.().commitCurrentEdit()

      setTimeout(() => {
        const cell = slickGrid.getActiveCell?.()
        if (cell) {
          slickGrid.navigateNext?.()
          slickGrid.editActiveCell?.()
        }
      }, 0)
    }

    this.addEventListener(this.editor.domNode, 'dataSelected', handler)
  }
}
