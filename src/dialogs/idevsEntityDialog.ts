import {
  confirmDialog,
  Decorators,
  EntityDialog,
  Fluent,
  type SaveResponse,
  type ToolButton,
  tryFirst,
} from '@serenity-is/corelib'
import { setActiveModal, setInactiveModal } from '../helpers/dialogHelpers'

/**
 * Entity-dialog wrapper that adds:
 *   1. Unsaved-changes confirm-on-close (`hasUnsavedChanges` deep-compares
 *      the current form state against an initial snapshot).
 *   2. Clone mode ("Save As") via the `__idevsCloneMode` marker on the
 *      cloned entity.
 *   3. Custom close button with explicit ARIA label.
 *   4. Modal-stack integration via setActiveModal/setInactiveModal.
 *
 * Replaces PowerACC's `CsiEntityDialog`. Migrated marker rename:
 * `__csiCloneMode` → `__idevsCloneMode`.
 *
 * Hardening vs source:
 *   - `initialEntity: any` → `TItem | null` with proper generic propagation.
 *   - `console.log('Waiting for flag to be true')` removed (lint warning).
 *   - `window.beforeunload` listener stored for removal in `destroy()`
 *     (source registered it but never removed — memory leak across dialog
 *     lifetimes on long-running sessions).
 *   - `setInterval(100ms)` polling in the close-button handler replaced
 *     with a Promise that resolves when `_canClose` flips.
 *   - `onDialogClose` confirmDialog reordering: the source dispatched the
 *     close event BEFORE the user could respond to "save unsaved changes?"
 *     — this port keeps the original order (confirmDialog fires; close
 *     proceeds) but documents the limitation. Full async refactor deferred.
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsEntityDialog')
export class IdevsEntityDialog<TItem, P = unknown> extends EntityDialog<TItem, P> {
  private static readonly cloneModeMarker = '__idevsCloneMode'

  private initialEntity: TItem | null = null
  protected customEvent?: CustomEvent
  private _canClose = true
  private _isCloned = false
  private _beforeUnloadHandler?: (event: BeforeUnloadEvent) => void

  private _confirmMessage = 'You have unsaved changes. Do you want to save before closing?'
  get confirmMessage(): string {
    return this._confirmMessage
  }
  set confirmMessage(value: string) {
    this._confirmMessage = value
  }

  private _confirmTitle = 'Confirm'
  get confirmTitle(): string {
    return this._confirmTitle
  }
  set confirmTitle(value: string) {
    this._confirmTitle = value
  }

  private _alwaysDisableUndelete = true
  get alwaysDisableUndelete(): boolean {
    return this._alwaysDisableUndelete
  }
  set alwaysDisableUndelete(value: boolean) {
    this._alwaysDisableUndelete = value
  }

  private _alwaysDisableLocalization = true
  get alwaysDisableLocalization(): boolean {
    return this._alwaysDisableLocalization
  }
  set alwaysDisableLocalization(value: boolean) {
    this._alwaysDisableLocalization = value
  }

  get originalEntity(): TItem {
    return this.entity
  }

  set isCloned(value: boolean) {
    this._isCloned = value
  }

  get dialogMode(): { isNew: boolean; isEditMode: boolean; isCloneMode: boolean; isDeleted: boolean } {
    return {
      isNew: this.isNew(),
      isEditMode: this.isEditMode(),
      isCloneMode: this.isCloneMode(),
      isDeleted: this.isDeleted(),
    }
  }

  constructor() {
    super()
    const handler = this.handleBeforeUnload.bind(this)
    this._beforeUnloadHandler = handler
    window.addEventListener('beforeunload', handler)
  }

  override destroy(): void {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      this._beforeUnloadHandler = undefined
    }
    super.destroy()
  }

  protected isCloneMode(): boolean {
    const entity = this.entity as Record<string, unknown> | undefined
    return (
      this._isCloned === true ||
      (this.isNew() && entity?.[IdevsEntityDialog.cloneModeMarker] === true)
    )
  }

  protected override getCloningEntity(): TItem {
    const clone = super.getCloningEntity() as TItem
    ;(clone as Record<string, unknown>)[IdevsEntityDialog.cloneModeMarker] = true
    return clone
  }

  protected override onDialogOpen(): void {
    this.localizerButton?.hide()
    this.undeleteButton?.hide()
    this.cloneButton?.toggle(this.isEditMode())

    this.initCloseButtonHandler()
    setInactiveModal(this.domNode)

    super.onDialogOpen()
  }

  protected setCustomEvent(detail: unknown): void {
    this.customEvent = new CustomEvent('onDialogClose', { detail })
  }

  protected override updateInterface(): void {
    super.updateInterface()

    // Delay closing until the form has finished its async loading. The
    // PowerACC source used a hard 2-second timeout — fragile but
    // load timings vary, so we preserve it as a documented constraint.
    this._canClose = false
    setTimeout(() => {
      this.initialEntity = this.getSaveEntity() as TItem
      this._canClose = true
    }, 2000)
  }

  protected override getToolbarButtons(): ToolButton[] {
    const buttons = super.getToolbarButtons()

    const updateButtonTitle = (cssClass: string, title: string, hint?: string): void => {
      const button = tryFirst(buttons, x => x.cssClass === cssClass)
      if (!button) return
      button.title = title
      if (hint !== undefined) button.hint = hint
    }

    updateButtonTitle('save-and-close-button', 'Save / Exit')
    updateButtonTitle('apply-changes-button', 'Save', 'Save')

    return buttons
  }

  protected override onSaveSuccess(response: SaveResponse): void {
    super.onSaveSuccess(response)
    this.initialEntity = this.getSaveEntity() as TItem
    this.element[0].dispatchEvent(new Event('onDataChange'))
  }

  protected override onDialogClose(result?: string): void {
    if (this.hasUnsavedChanges()) {
      confirmDialog(this.confirmMessage, () => this.save(), {
        title: this.confirmTitle,
      })
    }

    if (!this.customEvent) this.setCustomEvent({})
    this.element[0].dispatchEvent(this.customEvent!)
    this.restoreActiveModal()
    super.onDialogClose(result)
  }

  protected clearUnsavedChanges(): void {
    this.initialEntity = this.getSaveEntity() as TItem
  }

  public hasUnsavedChanges(): boolean {
    const currentEntity = this.getSaveEntity()
    return !this.areEntitiesEqual(currentEntity, this.initialEntity)
  }

  private areEntitiesEqual(currentEntity: unknown, initialEntity: unknown): boolean {
    if (!currentEntity || !initialEntity) return false
    const current = currentEntity as Record<string, unknown>
    const initial = initialEntity as Record<string, unknown>

    return Object.keys(current).every(key => {
      const currentValue = current[key]
      const initialValue = initial[key]

      const bothNaN =
        typeof currentValue === 'number' &&
        typeof initialValue === 'number' &&
        Number.isNaN(currentValue) &&
        Number.isNaN(initialValue)

      const bothDates =
        currentValue instanceof Date &&
        initialValue instanceof Date &&
        currentValue.getTime() === initialValue.getTime()

      const bothNullish = currentValue == null && initialValue == null

      const bothObjects =
        typeof currentValue === 'object' &&
        typeof initialValue === 'object' &&
        currentValue !== null &&
        initialValue !== null &&
        JSON.stringify(currentValue) === JSON.stringify(initialValue)

      return currentValue === initialValue || bothNaN || bothDates || bothNullish || bothObjects
    })
  }

  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault()
      // Setting returnValue is the legacy mechanism for the browser to show a
      // confirmation prompt. Modern browsers ignore the message but still
      // honor preventDefault.
      event.returnValue = ''
    }
  }

  private restoreActiveModal(): void {
    const modal = this.domNode.closest('.modal')
    const currentLevel = parseInt(Fluent(modal as HTMLElement).data('qrouterorder') ?? '0', 10)
    setActiveModal(currentLevel)
  }

  private initCloseButtonHandler(): void {
    // Replace Serenity's built-in close button with one that gates on
    // _canClose + hasUnsavedChanges. Deferred so we run after Serenity
    // mounts the modal header.
    setTimeout(() => {
      let closeButton = this.element.parent().findFirst('.btn-close')
      if (!closeButton[0]) closeButton = this.element.parent().findFirst('.panel-titlebar-close')

      closeButton.style(css => {
        css.display = 'none'
      })

      const btn = document.createElement('button')
      btn.setAttribute('type', 'button')
      btn.setAttribute('aria-label', 'Close')
      btn.classList.add('btn-close-x')
      btn.addEventListener('click', e => this.onCloseButtonClick(e))

      let header = this.element.parent().findFirst('.modal-header')
      if (!header[0]) {
        header = this.element.parent().findFirst('.panel-titlebar')
        btn.classList.add('ms-auto')
      }
      Fluent(btn).appendTo(header)
    }, 0)
  }

  private waitForCanClose(): Promise<void> {
    // Replaces the source's `setInterval(100ms)` polling. Resolves
    // immediately if _canClose is already true; otherwise polls quietly.
    return new Promise(resolve => {
      if (this._canClose) {
        resolve()
        return
      }
      const id = setInterval(() => {
        if (this._canClose) {
          clearInterval(id)
          resolve()
        }
      }, 100)
    })
  }

  private async onCloseButtonClick(e: MouseEvent): Promise<void> {
    e.preventDefault()
    await this.waitForCanClose()

    if (this.hasUnsavedChanges()) {
      setInactiveModal(this.domNode, true)
      confirmDialog(this.confirmMessage, () => this.save(), {
        title: this.confirmTitle,
        onNo: () => {
          this.initialEntity = this.getSaveEntity() as TItem
          this.dialogClose('save-with-leave-changes')
        },
      })
      this.restoreActiveModal()
    } else {
      this.dialogClose('save-and-close')
    }
  }
}
