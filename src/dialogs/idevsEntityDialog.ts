import {
  confirmDialog,
  Decorators,
  EntityDialog,
  Fluent,
  type SaveResponse,
  type ToolButton,
  tryFirst,
  type WidgetProps,
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
  private _initialSnapshotTimer?: ReturnType<typeof setTimeout>
  private _canClosePollId?: ReturnType<typeof setInterval>
  private _isDestroyed = false
  /**
   * Tracks whether the user has already responded to the unsaved-changes
   * confirm prompt for the current close attempt. Without this, calling
   * super.onDialogClose() while the prompt is still pending would close
   * the dialog out from under the user.
   */
  private _userConfirmedClose = false

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

  constructor(props?: WidgetProps<P>) {
    // Forward props to Serenity's EntityDialog so caller-supplied options
    // (element, dialog-specific settings) take effect. The PowerACC source
    // dropped this argument, ignoring any consumer options — a real bug
    // that breaks any non-default instantiation.
    super(props as WidgetProps<P>)
    const handler = this.handleBeforeUnload.bind(this)
    this._beforeUnloadHandler = handler
    window.addEventListener('beforeunload', handler)
  }

  override destroy(): void {
    this._isDestroyed = true
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      this._beforeUnloadHandler = undefined
    }
    if (this._initialSnapshotTimer !== undefined) {
      clearTimeout(this._initialSnapshotTimer)
      this._initialSnapshotTimer = undefined
    }
    if (this._canClosePollId !== undefined) {
      clearInterval(this._canClosePollId)
      this._canClosePollId = undefined
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

    // Take an IMMEDIATE snapshot so hasUnsavedChanges always has a baseline
    // to compare against. Without this, the 2-second delay opened a window
    // where the user could type AND close (Esc/backdrop) without seeing
    // a confirm prompt — Esc/backdrop paths invoke hasUnsavedChanges
    // directly without waiting on _canClose like the custom close button.
    this.initialEntity = this.getSaveEntity() as TItem
    this._canClose = false

    // Schedule a re-snapshot at +2s to cover async load paths that
    // populate the form after updateInterface returns. The re-snapshot
    // overwrites the immediate one — IF the user typed during the first
    // 2 seconds, their edits become part of the new baseline (this is a
    // known limitation; consumers needing dirty-tracking on async forms
    // should override updateInterface and snapshot when their load
    // promise resolves).
    // Timer handle stored so destroy() can cancel it.
    if (this._initialSnapshotTimer !== undefined) {
      clearTimeout(this._initialSnapshotTimer)
    }
    this._initialSnapshotTimer = setTimeout(() => {
      this._initialSnapshotTimer = undefined
      if (this._isDestroyed) return
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
    // Dispatch both casings to bridge the PowerACC source bug: source's
    // IdevsEntityDialog dispatched onDataChange (camelCase) but
    // OffCanvasPanel listened for ondatachange (lowercase). Keeping both
    // makes either spelling work for downstream consumers during migration.
    this.element[0].dispatchEvent(new Event('onDataChange'))
    this.element[0].dispatchEvent(new Event('ondatachange'))
  }

  protected override onDialogClose(result?: string): void {
    // If the user hasn't yet responded to a confirm prompt AND there are
    // unsaved changes, show the prompt and BLOCK the close. The dialog
    // remains open until the user resolves the prompt (which then routes
    // through save() or dialogClose with the confirmed flag set).
    //
    // Without this gate, the source's behavior was: confirmDialog fires
    // async, but dispatch + super.onDialogClose runs synchronously — the
    // dialog closes out from under the user. The Esc/backdrop paths still
    // bypassed the gated close-button handler.
    if (!this._userConfirmedClose && this.hasUnsavedChanges()) {
      confirmDialog(
        this.confirmMessage,
        () => {
          // User chose "yes, save". Save runs; on success we close the
          // dialog. Without the success callback driving dialogClose,
          // the user's action ("save and close") would degrade into a
          // bare save while the dialog stays open.
          this._userConfirmedClose = true
          this.save(() => {
            this.dialogClose(result ?? 'save-and-close')
          })
        },
        {
          title: this.confirmTitle,
          onNo: () => {
            // User chose "no, discard" — clear the snapshot so the close
            // proceeds without re-prompting, then trigger close.
            this._userConfirmedClose = true
            this.initialEntity = this.getSaveEntity() as TItem
            this.dialogClose(result ?? 'discarded-unsaved-changes')
          },
        },
      )
      // Block the close — the prompt's button handler will re-trigger
      // dialogClose with _userConfirmedClose = true.
      return
    }

    // No unsaved changes, or the user already confirmed — proceed.
    if (!this.customEvent) this.setCustomEvent({})
    this.element[0].dispatchEvent(this.customEvent!)
    this.restoreActiveModal()
    this._userConfirmedClose = false // reset for next open
    super.onDialogClose(result)
  }

  protected clearUnsavedChanges(): void {
    this.initialEntity = this.getSaveEntity() as TItem
  }

  public hasUnsavedChanges(): boolean {
    // initialEntity is populated synchronously in updateInterface, so a
    // null value here means hasUnsavedChanges was called before the
    // dialog finished mounting — treat as "no changes" defensively.
    if (this.initialEntity == null) return false
    const currentEntity = this.getSaveEntity()
    return !this.areEntitiesEqual(currentEntity, this.initialEntity)
  }

  private areEntitiesEqual(currentEntity: unknown, initialEntity: unknown): boolean {
    if (!currentEntity || !initialEntity) return false
    const current = currentEntity as Record<string, unknown>
    const initial = initialEntity as Record<string, unknown>

    // Compare the UNION of keys, not just the current entity's. Without
    // the symmetric check, a key that existed in `initial` but is missing
    // from `current` (deletion / clear-to-undefined) would be skipped and
    // hasUnsavedChanges would silently miss the change.
    const allKeys = new Set<string>([...Object.keys(current), ...Object.keys(initial)])

    for (const key of allKeys) {
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

      const equal =
        currentValue === initialValue || bothNaN || bothDates || bothNullish || bothObjects
      if (!equal) return false
    }
    return true
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
    // Guard against detached DOM (closest can return null when the dialog
    // is being torn down or used in a non-modal context).
    const modal = this.domNode.closest<HTMLElement>('.modal')
    if (!modal) {
      setActiveModal(0)
      return
    }
    const currentLevel = parseInt(Fluent(modal).data('qrouterorder') ?? '0', 10)
    setActiveModal(currentLevel)
  }

  private initCloseButtonHandler(): void {
    // Replace Serenity's built-in close button with one that gates on
    // _canClose + hasUnsavedChanges. Deferred so we run after Serenity
    // mounts the modal header.
    setTimeout(() => {
      if (this._isDestroyed) return

      let closeButton = this.element.parent().findFirst('.btn-close')
      if (!closeButton[0]) closeButton = this.element.parent().findFirst('.panel-titlebar-close')

      closeButton.style(css => {
        css.display = 'none'
      })

      // Remove any previously-injected .btn-close-x from prior opens of
      // this dialog instance — onDialogOpen runs every open, so without
      // this guard we'd stack a new button + handler on every reopen.
      const existing = this.element.parent().findFirst('.btn-close-x')
      if (existing[0]) existing.remove()

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
    // Interval handle stored on the instance so destroy() can clear it
    // (otherwise a never-flipping _canClose would leak the interval forever).
    return new Promise(resolve => {
      if (this._canClose) {
        resolve()
        return
      }
      // Clear any prior polling interval — only one waiter at a time.
      if (this._canClosePollId !== undefined) clearInterval(this._canClosePollId)
      this._canClosePollId = setInterval(() => {
        if (this._isDestroyed) {
          if (this._canClosePollId !== undefined) clearInterval(this._canClosePollId)
          this._canClosePollId = undefined
          resolve()
          return
        }
        if (this._canClose) {
          if (this._canClosePollId !== undefined) clearInterval(this._canClosePollId)
          this._canClosePollId = undefined
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
      confirmDialog(
        this.confirmMessage,
        () => {
          // Save AND close — pass dialogClose to save() so this is a real
          // save-and-close, not a bare save that leaves the dialog open.
          this._userConfirmedClose = true
          this.save(() => {
            this.dialogClose('save-and-close')
          })
        },
        {
          title: this.confirmTitle,
          onNo: () => {
            this._userConfirmedClose = true
            this.initialEntity = this.getSaveEntity() as TItem
            this.dialogClose('save-with-leave-changes')
          },
        },
      )
      this.restoreActiveModal()
    } else {
      this.dialogClose('save-and-close')
    }
  }
}
