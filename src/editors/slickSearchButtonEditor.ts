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

  private setupDataSelectionHandler(props: EditorProps<P>): void {
    const opts = ((props.column as { sourceItem?: { editorParams?: unknown } } | undefined)?.sourceItem?.editorParams ??
      {}) as IdevsSearchButtonEditorOptions

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DataSelectedDetail>).detail
      if (!detail) return

      const idCol = opts.idColumnName
      if (idCol && idCol in detail) {
        this.editor.set_value(String(detail[idCol]))
      }
      opts.onDataSelected?.(detail)

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
