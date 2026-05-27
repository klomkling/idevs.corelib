import {
  DecimalEditor,
  Decorators,
  type EntityGrid,
  EnumEditor,
  Fluent,
  LookupEditor,
  ServiceLookupEditor,
  StringEditor,
  Widget,
  type WidgetProps,
} from '@serenity-is/corelib'

/**
 * Field-rendering panel — a Widget-derived container that materializes a
 * collection of editors (label + input pairs) into a flex-wrap layout.
 *
 * Replaces PowerACC's `CsiPanel`. Hardening vs source:
 *   - Label "required" marker built via DOM API + textContent + a typed
 *     sup element (the source assembled the label via a raw HTML-property
 *     write that would execute any HTML embedded in the caption).
 *   - `field.editor: new (...) => Widget<any>` narrowed to a typed
 *     constructor signature; `editorOptions` narrowed to
 *     `Record<string, unknown>`.
 *   - `(instance as any).set_readOnly` / `(instance as any).value = null`
 *     accessed via structural types.
 *   - CsiDateEditor special-case in the editor factory dropped — would
 *     have forced flatpickr resolution for any consumer of IdevsPanel.
 *     Consumers using IdevsDateEditor pass `format: 'd/m/Y'` explicitly.
 */

export type IdevsPanelOptions = {
  referenceElement: Fluent
  insertType: 'before' | 'after' | 'child'
  cssClass?: string | string[]
  options?: Record<string, unknown>
  grid?: EntityGrid<unknown>
}

type WidgetCtor = new (
  props: { element: Fluent } & Record<string, unknown>,
) => Widget<unknown>

export type IdevsPanelFieldOptions = {
  editor?: WidgetCtor
  editorOptions?: Record<string, unknown>
  editorInstance?: Widget<unknown>
  fieldName?: string
  originalFieldName?: string
  container?: Fluent
  caption?: string
  fieldCss?: string | string[]
  captionCss?: string | string[]
  inputCss?: string | string[]
  readonly?: boolean
  required?: boolean
  paramType?: 'equality' | 'criteria' | 'custom'
  paramGroup?: number
}

type ValueWritableEditor = { value?: unknown }
type ReadOnlyEditor = { set_readOnly?(value: boolean): void }

@Decorators.registerClass('Idevs.CoreLib.IdevsPanel')
export class IdevsPanel<P extends IdevsPanelOptions = IdevsPanelOptions> extends Widget<P> {
  private panelTitle = ''
  protected fields: IdevsPanelFieldOptions[] = []
  private dummyFields = 0
  protected panelContainer!: Fluent
  /** Floating title element — reference held so setTitle can update it. */
  private floatingTitleEl?: HTMLElement
  protected editorInstances: Record<string, Widget<unknown>> = {}

  static createPanel<P extends IdevsPanelOptions = IdevsPanelOptions>(
    options: P,
  ): InstanceType<typeof IdevsPanel> {
    return Widget.create({
      type: this,
      element: e => {
        if (options.insertType === 'before') {
          e.insertBefore(options.referenceElement)
        } else if (options.insertType === 'after') {
          e.insertAfter(options.referenceElement)
        } else {
          e.appendTo(options.referenceElement)
        }
      },
      options,
    }) as InstanceType<typeof IdevsPanel>
  }

  static override createDefaultElement(): HTMLElement {
    // CSS class matches the widget identity (s-IdevsPanel). The PowerACC
    // source used 's-CsiFilterPanel' here even though the class was
    // CsiPanel — a naming mismatch that would have broken selector-based
    // lookups against an s-IdevsPanel-style stylesheet.
    return Fluent('div')
      .class([
        'idevs-panel',
        's-IdevsPanel',
        'w-100',
        'd-flex',
        'flex-column',
        'flex-lg-row',
      ])
      .getNode()
  }

  get title(): string {
    return this.panelTitle
  }
  setTitle(value: string): void {
    this.panelTitle = value
    // Update the rendered floating title too — without this the visible
    // text would never refresh after construction. The element is created
    // via the deferred createFloatingTitle setTimeout(0); if setTitle is
    // called BEFORE that fires, the deferred render reads the latest
    // panelTitle value naturally.
    if (this.floatingTitleEl) this.floatingTitleEl.textContent = value
  }

  getFields(): IdevsPanelFieldOptions[] {
    return this.fields
  }
  /**
   * Set the field list and re-render. Called as the public replacement
   * for the old PowerACC `Fields = [...]` setter; consumers expect the
   * new field list to materialize without further action.
   */
  setFields(value: IdevsPanelFieldOptions[]): void {
    this.fields = value
    // Fire-and-forget — renderPanel returns a Promise<Fluent> but the
    // current implementation is synchronous. The promise interface exists
    // for future async hooks.
    if (this.panelContainer) void this.renderPanel()
  }

  /**
   * Public render entry point — re-renders the panel with the current
   * field list. Consumers needing to refresh the panel after mutating
   * `getFields()` directly can call this.
   */
  public render(): Promise<Fluent> {
    return this.renderPanel()
  }

  constructor(props: WidgetProps<P>) {
    super(props)
    this.buildInterface()
  }

  private buildInterface(): void {
    const container = Fluent('div').class(['category', 'col-12', 'pt-2']).appendTo(this.element)
    const wrapper = Fluent('div')
      .class([
        'flex-fill',
        'd-flex',
        'border',
        'rounded',
        'position-relative',
        'px-1',
        'py-2',
      ])
      .appendTo(container)
    this.panelContainer = Fluent('div')
      .class(['idevs-panel-criteria', 'flex-fill', 'd-flex', 'flex-wrap'])
      .appendTo(wrapper)
    this.createFloatingTitle(wrapper)
  }

  /** Overlays the panel title as a floating label on the top border. */
  private createFloatingTitle(wrapper: Fluent): void {
    setTimeout(() => {
      const titleEl = Fluent('div')
        .class(['position-absolute', 'px-3'])
        .style(css => {
          css.left = '1rem'
          css.top = '-0.75rem'
          css.backgroundColor = 'white'
        })
        .text(this.panelTitle)
        .appendTo(wrapper)
        .getNode()
      // Cache the element so setTitle can update its text after creation.
      this.floatingTitleEl = titleEl as HTMLElement
    }, 0)
  }

  /** Render the registered fields into the panel container. */
  protected async renderPanel(): Promise<Fluent> {
    // Destroy any editor instances from a prior render before emptying the
    // DOM — otherwise we'd orphan their event handlers and any internal
    // state, AND a stale getEditor() / setFieldValue() call could still
    // mutate the dead editor. Reset the registry too.
    this.destroyEditorInstances()
    this.panelContainer.empty()
    this.fields.forEach(field => {
      field.container = this.panelContainer
      this.addFieldToContainer(field)
      this.instantiateEditor(field)
    })
    return this.panelContainer
  }

  private destroyEditorInstances(): void {
    for (const key of Object.keys(this.editorInstances)) {
      try {
        this.editorInstances[key].destroy()
      } catch {
        /* swallow teardown errors */
      }
    }
    this.editorInstances = {}
    // Also clear the editorInstance back-reference on each field so dead
    // pointers aren't held in user-owned field configs.
    this.fields.forEach(f => {
      f.editorInstance = undefined
    })
  }

  override destroy(): void {
    this.destroyEditorInstances()
    super.destroy()
  }

  private addFieldToContainer(field: IdevsPanelFieldOptions): Fluent {
    let frameCss: string[] = []
    if (field.fieldCss) {
      frameCss = Array.isArray(field.fieldCss) ? field.fieldCss.slice() : [field.fieldCss]
    }

    let inputCss: string[] = ['w-100']
    if (field.inputCss) {
      inputCss = inputCss.concat(Array.isArray(field.inputCss) ? field.inputCss : [field.inputCss])
    }
    if (field.required) inputCss.push('required')

    const frame = Fluent('div')
      .class(['field', 'py-1', field.fieldName ?? '', ...frameCss])
      .appendTo(field.container!)

    if (field.caption) {
      const labelCss = ['caption'].concat(
        field.captionCss
          ? Array.isArray(field.captionCss)
            ? field.captionCss
            : [field.captionCss]
          : [],
      )
      const label = Fluent('label')
        .attr('for', this.idPrefix + (field.fieldName ?? ''))
        .class(labelCss)
        .appendTo(frame)

      const labelEl = label[0] as HTMLElement
      // XSS-safe label markup: required marker via DOM API + textContent.
      // PowerACC source assembled the label via a raw HTML-property write
      // that would execute any HTML embedded in the caption.
      if (field.required) {
        const sup = document.createElement('sup')
        sup.setAttribute('title', 'this field is required')
        sup.textContent = '*'
        labelEl.appendChild(sup)
      }
      const captionTextNode = document.createTextNode(field.caption)
      labelEl.appendChild(captionTextNode)

      if (field.required) {
        // Serenity's addValidationRule expects (uniqueName, rule) where the
        // rule returns a string ('' for valid; non-empty message for invalid).
        this.addValidationRule(this.idPrefix + (field.fieldName ?? ''), () => {
          const nextEl = labelEl.nextElementSibling as HTMLInputElement | null
          return nextEl?.value ? '' : 'This field is required'
        })
      }
    }

    const input = field.fieldName
      ? Fluent('input')
          .attr('id', this.idPrefix + field.fieldName)
          .class(inputCss)
          .appendTo(frame)
      : Fluent('div')
          .attr('id', `${this.idPrefix}_dummy${++this.dummyFields}`)
          .class(inputCss)
          .appendTo(frame)

    if (field.readonly) {
      input.attr('readonly', 'readonly').addClass('readonly')
    }

    return input
  }

  private instantiateEditor(field: IdevsPanelFieldOptions): void {
    if (!field.editor || !field.fieldName) return

    const inputFluent = field.container?.findFirst(`#${this.idPrefix}${field.fieldName}`)
    if (!inputFluent || !inputFluent[0]) return

    const baseOpts = { element: inputFluent, ...(field.editorOptions ?? {}) }

    // All editor constructors matching the standard `(props: { element, ... })`
    // shape are instantiated directly — covers Serenity's built-ins
    // (StringEditor, DecimalEditor, EnumEditor, LookupEditor,
    // ServiceLookupEditor) and the Idevs editor family (IdevsTagEditor,
    // IdevsNumericTagEditor, IdevsSearchButtonEditor,
    // IdevsSelfSearchButtonEditor, IdevsDateEditor) without explicit
    // imports — keeps IdevsPanel from depending on the IdevsDateEditor
    // subpath that requires flatpickr.
    const editorClasses = [
      StringEditor,
      DecimalEditor,
      EnumEditor,
      LookupEditor,
      ServiceLookupEditor,
    ]
    const isSupportedBuiltIn = editorClasses.some(
      ctor => ctor === (field.editor as unknown),
    )
    if (!isSupportedBuiltIn && typeof field.editor !== 'function') return

    const instance = new field.editor(baseOpts as ConstructorParameters<typeof field.editor>[0])
    this.editorInstances[field.fieldName] = instance
    field.editorInstance = instance

    if (field.readonly) {
      const readOnlyEditor = instance as ReadOnlyEditor
      readOnlyEditor.set_readOnly?.(true)
    }
  }

  protected getEditor(fieldName: string): Widget<unknown> | undefined {
    return this.editorInstances[fieldName]
  }

  protected clearAllEditorValues(): void {
    Object.values(this.editorInstances).forEach(instance => {
      const editor = instance as ValueWritableEditor
      if (editor.value !== undefined) editor.value = null
    })
  }

  public setFieldValue(fieldName: string, value: unknown): void {
    const editor = this.editorInstances[fieldName] as ValueWritableEditor | undefined
    if (editor) editor.value = value
  }
}
