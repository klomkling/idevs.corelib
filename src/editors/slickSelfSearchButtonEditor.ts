import type { EditorOptions } from '@serenity-is/sleekgrid'
import type { EditorProps } from '@serenity-is/corelib'
import { SlickEditorBase } from './slickEditorBase'
import {
  IdevsSelfSearchButtonEditor,
  type IdevsSelfSearchButtonEditorOptions,
} from './idevsSelfSearchButtonEditor'

type DataSelectedDetail = Record<string, unknown> | null | undefined

type SlickNavGrid = {
  getEditorLock?: () => { commitCurrentEdit: () => boolean }
  getActiveCell?: () => { row: number; cell: number } | null
  navigateNext?: () => void
  editActiveCell?: () => void
}

/**
 * SleekGrid column adapter wrapping IdevsSelfSearchButtonEditor. Same shape
 * as SlickSearchButtonEditor but with the SelfSearch's "only navigate when
 * event.detail is truthy" guard preserved from the PowerACC source — needed
 * because SelfSearch dialogs can fire dataSelected with falsy detail in
 * certain dismiss paths.
 */
export class SlickSelfSearchButtonEditor<P extends EditorOptions = EditorOptions>
  extends SlickEditorBase<IdevsSelfSearchButtonEditor, P> {
  constructor(props: EditorProps<P>) {
    super(props)
  }

  protected createEditor(props: EditorProps<P>): IdevsSelfSearchButtonEditor {
    const params = ((props.column as { sourceItem?: { editorParams?: unknown } } | undefined)
      ?.sourceItem?.editorParams ?? {}) as IdevsSelfSearchButtonEditorOptions
    const opts: IdevsSelfSearchButtonEditorOptions = { ...params }

    if (!props.container) {
      throw new Error('SlickSelfSearchButtonEditor requires props.container')
    }
    const wrapper = document.createElement('div')
    props.container.appendChild(wrapper)

    return new IdevsSelfSearchButtonEditor({
      ...opts,
      element: wrapper,
    } as unknown as ConstructorParameters<typeof IdevsSelfSearchButtonEditor>[0])
  }

  protected override appendToContainer(props: EditorProps<P>): void {
    if (!props.container) return
    props.container.appendChild(this.editor.domNode)
    this.setupDataSelectionHandler()
  }

  protected override getInputElement(): HTMLInputElement | null {
    if (!this.editor) return null
    const container = this.editor.domNode.parentElement
    if (!container) return null
    return container.querySelector('input.editor') as HTMLInputElement | null
  }

  protected override handleValueChange(): void {
    // Intentionally does NOT call this.editor.set_value(inputElement.value).
    // The inner IdevsSelfSearchButtonEditor's own input handler already
    // wrote the canonical (raw) value to its hidden domNode via set_value —
    // including masked-pattern extraction. Writing the display input's
    // FORMATTED value back through set_value here would overwrite the raw
    // value with the formatted one (e.g., '12345678' → '1234-5678'),
    // corrupting the stored id. We just need to dispatch the grid's
    // cellchange event via super.
    super.handleValueChange()
  }

  private setupDataSelectionHandler(): void {
    // Inner editor already handles set_value + onDataSelected + subscribers.
    // We only do grid-side commit + navigate. Source guard: only navigate
    // when event.detail is truthy (selection actually happened) so that
    // cancel paths don't move the active cell.
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
