import {
  Decorators,
  EntityDialog,
  Fluent,
  Widget,
  type WidgetProps,
} from '@serenity-is/corelib'

/**
 * Inline dialog wrapper — embeds another `EntityDialog` subclass into a
 * non-modal container, optionally hiding the toolbar and adding custom
 * buttons / empty field slots.
 *
 * Replaces PowerACC's `CsiInlineDialog`. Hardening vs source:
 *   - `style: Partial<CSSStyleDeclaration> | string` → object only (the
 *     string variant in the source allowed arbitrary CSS injection).
 *   - `any` entity types → `TEntity` generic throughout.
 *   - Narrowed `(this.dialog as any).validateForm()` / `form[fieldName]`
 *     access via structural types.
 */

export type IdevsCustomButton = {
  id: string
  text: string
  columnCssClass?: string
  cssClass?: string
  /** Object form only — the source allowed a raw CSS string (XSS-adjacent). */
  style?: Partial<CSSStyleDeclaration>
  click?: (e: Event) => void
  afterField?: string
}

export type IdevsEmptyField = {
  columnCssClass?: string
  cssClass?: string
  style?: Partial<CSSStyleDeclaration>
  afterField?: string
}

export type IdevsInlineDialogCallbacks<TEntity> = {
  onSave?: (entity: TEntity, response: unknown) => void | Promise<void>
  onLoad?: (entity: TEntity | unknown) => void | Promise<void>
  onValidate?: (entity: TEntity) => boolean | Promise<boolean>
  onFormChange?: (entity: TEntity, fieldName?: string) => void | Promise<void>
  onCustomAction?: (actionName: string, data?: unknown) => void | Promise<void>
}

export type IdevsInlineDialogOptions<TEntity> = {
  dialogType: new (options?: unknown) => EntityDialog<TEntity, unknown>
  dialogOptions?: unknown
  hideToolbar?: boolean
  customButtons?: (IdevsCustomButton | IdevsCustomButton[])[]
  emptyFields?: IdevsEmptyField[]
  callbacks?: IdevsInlineDialogCallbacks<TEntity>
}

type DialogInternals<TEntity> = EntityDialog<TEntity, unknown> & {
  validateForm(): boolean
  save(callback: (response: unknown) => void): void
  form: Record<string, { element: Fluent; value: unknown }>
  arrange?: () => void
}

@Decorators.registerClass('Idevs.CoreLib.IdevsInlineDialog')
export class IdevsInlineDialog<TEntity = Record<string, unknown>> extends Widget<
  IdevsInlineDialogOptions<TEntity>
> {
  private dialog!: DialogInternals<TEntity>

  static override createDefaultElement(): HTMLElement {
    return Fluent('div')
      .class(['idevs-inline-dialog', 's-IdevsInlineDialog', 'w-100', 'h-100', 'p-3'])
      .getNode()
  }

  constructor(props: WidgetProps<IdevsInlineDialogOptions<TEntity>>) {
    super(props)
    this.initializeDialog()
  }

  override destroy(): void {
    // Tear down the embedded dialog before our own destroy chain — its
    // form change listeners hold references back through `this`, so
    // disposing it first ensures no listener fires during teardown.
    if (this.dialog) {
      try {
        this.dialog.destroy()
      } catch {
        /* swallow — teardown errors are noise */
      }
    }
    super.destroy()
  }

  public async callPageCallback<K extends keyof IdevsInlineDialogCallbacks<TEntity>>(
    callbackName: K,
    ...args: Parameters<NonNullable<IdevsInlineDialogCallbacks<TEntity>[K]>>
  ): Promise<ReturnType<NonNullable<IdevsInlineDialogCallbacks<TEntity>[K]>> | undefined> {
    const callback = this.options.callbacks?.[callbackName] as
      | ((...a: unknown[]) => unknown)
      | undefined
    if (!callback) return undefined
    return (await callback(...args)) as ReturnType<
      NonNullable<IdevsInlineDialogCallbacks<TEntity>[K]>
    >
  }

  public clearDialogForm(): void {
    this.dialog.dialogClose()
    this.loadNew()
  }

  public async saveDialogForm(): Promise<unknown> {
    // Refactored from `new Promise(async (resolve, reject) => ...)` which
    // ESLint flags as no-async-promise-executor — async errors inside the
    // executor are not awaited by the promise. Now using direct
    // async/await + a leaf Promise for the save() callback.
    const customValidation = await this.callPageCallback('onValidate', this.getEntity())
    if (customValidation === false) {
      throw new Error('Custom validation failed')
    }
    if (!this.dialog.validateForm()) {
      throw new Error('Form validation failed')
    }
    return new Promise<unknown>((resolve, reject) => {
      this.dialog.save(response => {
        if (!response) {
          reject(new Error('Save operation failed'))
          return
        }
        // Best-effort onSave callback; settles the outer Promise regardless
        // of whether the callback resolves, rejects, or throws. Without the
        // .catch leg, an onSave that throws would leave saveDialogForm
        // pending forever AND emit an unhandledrejection.
        this.callPageCallback('onSave', this.getEntity(), response)
          .then(() => resolve(response))
          .catch(() => resolve(response))
      })
    })
  }

  private initializeDialog(): void {
    const DialogType = this.options.dialogType
    this.dialog = new DialogType({
      element: document.createElement('div'),
      ...(this.options.dialogOptions as Record<string, unknown>),
    }) as DialogInternals<TEntity>

    const dialogElement = this.dialog.element.getNode()
    this.removeModalBehavior(dialogElement)

    if (this.options.hideToolbar) {
      const toolbar = dialogElement.querySelector<HTMLElement>('.s-Toolbar')
      if (toolbar) toolbar.style.display = 'none'
    }

    this.element.append(dialogElement)
    this.overrideModalMethods()
    this.setupFormChangeListener()

    void this.loadNew()

    if (this.options.emptyFields && this.options.emptyFields.length > 0) {
      setTimeout(() => this.addEmptyFields(), 100)
    }
    if (this.options.customButtons && this.options.customButtons.length > 0) {
      setTimeout(() => this.addCustomButtons(), 100)
    }
  }

  private setupFormChangeListener(): void {
    const form = this.dialog.element.findFirst('.s-Form')
    if (!form[0]) return

    form.findAll('.field[data-itemname]').forEach(input => {
      const fieldName = input.getAttribute('data-itemname')
      if (!fieldName) return
      const formInput = this.dialog.form[fieldName]
      if (!formInput) return
      formInput.element.on('change', async () => {
        const entity = this.getEntity()
        await this.callPageCallback('onFormChange', entity, fieldName)
      })
    })
  }

  private addEmptyFields(): void {
    if (!this.options.emptyFields) return
    this.options.emptyFields.forEach(field => {
      const newField = Fluent('div').class(['field', 'col-12', field.columnCssClass ?? ''])
      if (field.style) Object.assign(newField.getNode().style, field.style)

      const fields = this.dialog.element.findAll('.s-Form .field')
      const lastField = fields[fields.length - 1]
      const afterField = field.afterField
        ? fields.find(f => f.classList.contains(field.afterField!))
        : null
      const target = afterField ?? lastField
      target?.insertAdjacentElement('afterend', newField.getNode())
    })
  }

  private addCustomButtons(): void {
    if (!this.options.customButtons) return
    this.options.customButtons.forEach(buttonOrArray => {
      const buttons = Array.isArray(buttonOrArray) ? buttonOrArray : [buttonOrArray]
      const newField = Fluent('div').class([
        'field',
        'col-12',
        buttons[0].columnCssClass ?? '',
      ])

      buttons.forEach(button => {
        const buttonElement = Fluent('button')
          .class(['btn', button.cssClass ?? ''])
          .text(button.text)
          .on('click', button.click ?? (() => {}))
        // Object form only — string variant from source removed (XSS-adjacent).
        if (button.style) Object.assign(buttonElement.getNode().style, button.style)
        buttonElement.appendTo(newField)
      })

      const fields = this.dialog.element.findAll('.s-Form .field')
      const lastField = fields[fields.length - 1]
      const afterField = buttons[0].afterField
        ? fields.find(f => f.classList.contains(buttons[0].afterField!))
        : null
      const target = afterField ?? lastField
      target?.insertAdjacentElement('afterend', newField.getNode())
    })
  }

  private removeModalBehavior(dialogElement: HTMLElement): void {
    dialogElement.classList.remove('modal', 'fade')
    dialogElement.removeAttribute('tabindex')
    dialogElement.removeAttribute('aria-labelledby')
    dialogElement.removeAttribute('aria-hidden')
    dialogElement.removeAttribute('role')
  }

  private overrideModalMethods(): void {
    // Suppress modal lifecycle on the embedded dialog — we're rendering it
    // inline, not as a popup. The dialog's own open/close behavior would
    // try to mount/unmount the modal scaffolding we just stripped.
    this.dialog.dialogOpen = () => {}
    this.dialog.dialogClose = () => {}
    if (this.dialog.arrange) this.dialog.arrange = () => {}
  }

  public async loadEntity(entity: TEntity): Promise<void> {
    this.dialog.loadEntityAndOpenDialog(entity)
    await this.callPageCallback('onLoad', entity)
  }

  public async loadById(id: string | number): Promise<void> {
    this.dialog.loadByIdAndOpenDialog(id as never)
    await this.callPageCallback('onLoad', this.getEntity())
  }

  public async loadNew(): Promise<void> {
    this.dialog.loadNewAndOpenDialog()
    // Pass the (typically empty) current entity, not the Fluent element —
    // consumers expect an entity-shaped argument matching loadEntity()
    // and loadById(). Source passed `this.dialog.element` here, which
    // surfaced a DOM wrapper to onLoad and broke any code that read
    // entity fields off the argument.
    await this.callPageCallback('onLoad', this.getEntity())
  }

  public async triggerCustomAction(actionName: string, data?: unknown): Promise<unknown> {
    return this.callPageCallback('onCustomAction', actionName, data)
  }

  public getEntity(): TEntity {
    if (this.dialog.entity && Object.keys(this.dialog.entity as Record<string, unknown>).length > 0) {
      return this.dialog.entity
    }
    const form = this.dialog.element.findFirst('.s-Form')
    if (!form[0]) return {} as TEntity

    const entity = {} as Record<string, unknown>
    form.findAll('.field[data-itemname]').forEach(input => {
      const fieldName = input.getAttribute('data-itemname')
      if (!fieldName) return
      const formInput = this.dialog.form[fieldName]
      if (!formInput) return
      entity[fieldName] = formInput.value
    })
    return entity as TEntity
  }

  public validateForm(): boolean {
    return this.dialog.validateForm()
  }
}
