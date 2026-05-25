import type { Editor, EditorOptions } from '@serenity-is/sleekgrid'
import type { EditorProps } from '@serenity-is/corelib'

/**
 * Shape required of the wrapped Serenity editor. Eliminates `(editor as any)`
 * casts that the PowerACC source relied on.
 */
export type SlickWrappedEditor = {
  domNode: HTMLElement
  value?: unknown
  destroy?: () => void
  props?: { grid?: { slickGrid: unknown } }
}

type SlickGridLike = {
  getActiveCell?: () => { row: number; cell: number } | null
  getDataItem?: (row: number) => Record<string, unknown> | undefined
  onCellChange?: {
    notify: (event: { row: number; cell: number; item: Record<string, unknown> }) => void
  }
}

/**
 * Abstract SleekGrid Editor wrapping a Serenity widget. Subclasses provide
 * `createEditor`; the base wires loadValue/serializeValue/applyValue/destroy,
 * tracks event listeners for cleanup, and exposes overridable hooks for
 * value-change and key-handling behavior.
 */
export abstract class SlickEditorBase<
  TEditor extends SlickWrappedEditor,
  P extends EditorOptions = EditorOptions,
> implements Editor {
  protected props: EditorProps<P>
  protected editor: TEditor
  protected field: string
  protected container: HTMLElement
  protected originalValue: unknown = null
  protected isDestroyed = false
  protected grid: SlickGridLike | null = null

  /** Tracked listener cleanups. Drained in destroy(). */
  protected eventCleanup: Array<() => void> = []

  protected constructor(props: EditorProps<P>) {
    this.props = props
    const field = props.column?.field
    if (!field) {
      throw new Error('SlickEditorBase requires props.column.field')
    }
    this.field = field
    if (!props.container) {
      throw new Error('SlickEditorBase requires props.container')
    }
    this.container = props.container

    this.editor = this.createEditor(props)
    this.appendToContainer(props)

    this.grid = (props.grid as SlickGridLike | undefined) ?? null

    // Defer event-handler setup until the DOM is committed.
    setTimeout(() => {
      if (!this.isDestroyed && this.editor) {
        this.setupEventHandlers()
        this.focusEditor()
      }
    }, 0)
  }

  protected abstract createEditor(props: EditorProps<P>): TEditor

  protected appendToContainer(props: EditorProps<P>): void {
    if (this.editor?.domNode && props.container) {
      props.container.appendChild(this.editor.domNode)
    }
  }

  protected getEditorValue(): unknown {
    if (this.isDestroyed || !this.editor) return null
    return this.editor.value
  }

  protected setEditorValue(value: unknown): void {
    if (this.isDestroyed || !this.editor) return
    this.editor.value = value ?? ''
  }

  protected focusEditor(): void {
    if (this.isDestroyed || !this.editor) return
    const inputElement = this.getInputElement()
    if (inputElement) {
      inputElement.focus()
    } else {
      this.editor.domNode.focus()
    }
  }

  protected destroyEditor(): void {
    if (this.editor && typeof this.editor.destroy === 'function') {
      this.editor.destroy()
    }
  }

  /**
   * Register a listener for cleanup. The base will remove it in destroy().
   */
  protected addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (this.isDestroyed) return
    target.addEventListener(type, listener, options)
    this.eventCleanup.push(() => {
      target.removeEventListener(type, listener, options)
    })
  }

  protected setupEventHandlers(): void {
    this.setupValueChangeHandler()
  }

  protected setupValueChangeHandler(): void {
    const inputElement = this.getInputElement()
    if (!inputElement) return

    this.addEventListener(inputElement, 'input', () => this.handleValueChange())
    this.addEventListener(inputElement, 'blur', () => {
      this.handleValueChange()
      this.commitValue()
    })
    this.addEventListener(inputElement, 'keydown', (e: Event) => {
      this.handleKeyDown(e as KeyboardEvent)
    })
  }

  protected handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.handleValueChange()
      this.commitValue()
    }
  }

  protected getInputElement(): HTMLInputElement | null {
    if (this.isDestroyed || !this.editor) return null
    return this.container.querySelector('input')
  }

  protected handleValueChange(): void {
    if (this.isDestroyed) return
    this.container.dispatchEvent(
      new CustomEvent('cellchange', {
        detail: { field: this.field, value: this.serializeValue() },
      }),
    )
  }

  protected commitValue(): void {
    if (this.isDestroyed) return
    const value = this.serializeValue()
    if (!this.grid) return

    const activeCell = this.grid.getActiveCell?.()
    if (!activeCell) return

    const item = this.grid.getDataItem?.(activeCell.row)
    if (!item) return

    item[this.field] = value
    this.grid.onCellChange?.notify({
      row: activeCell.row,
      cell: activeCell.cell,
      item,
    })
  }

  // === SleekGrid Editor interface ===

  loadValue(item: Record<string, unknown>): void {
    if (this.isDestroyed) return
    this.originalValue = item[this.field] ?? null
    this.setEditorValue(this.originalValue)
  }

  serializeValue(): unknown {
    if (this.isDestroyed || !this.editor) return null
    return this.getEditorValue()
  }

  applyValue(item: Record<string, unknown>, state: unknown): void {
    if (this.isDestroyed) return
    item[this.field] = state
  }

  isValueChanged(): boolean {
    if (this.isDestroyed || !this.editor) return false
    // Loose equality: gridded values can shift between string/number across
    // load and serialize (SleekGrid passes strings for numeric columns in
    // some paths). Mirrors source semantics; strict equality would
    // over-report changes for numeric/string interconversions.
    // eslint-disable-next-line eqeqeq
    return this.serializeValue() != this.originalValue
  }

  validate(): { valid: boolean; msg?: string } {
    return { valid: true }
  }

  focus(): void {
    if (this.isDestroyed || !this.editor) return
    requestAnimationFrame(() => {
      if (!this.isDestroyed && this.editor) {
        this.focusEditor()
      }
    })
  }

  destroy(): void {
    if (this.isDestroyed) return
    if (this.isValueChanged()) {
      this.handleValueChange()
      this.commitValue()
    }
    this.isDestroyed = true

    for (const cleanup of this.eventCleanup) {
      try {
        cleanup()
      } catch {
        /* teardown errors are not actionable */
      }
    }
    this.eventCleanup = []
    this.destroyEditor()
  }
}
