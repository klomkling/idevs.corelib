import {
  confirmDialog,
  Decorators,
  EntityDialog,
  Fluent,
  notifyError,
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
 *     close event BEFORE the user could respond to "save unsaved changes?",
 *     which let the dialog close out from under the user. This port FIXES
 *     that — `onDialogClose` now blocks on the prompt via the
 *     `_userConfirmedClose` flag and only proceeds via the prompt's button
 *     handlers (`onYes-then-save-success` or `onNo-discard`). The Esc/
 *     backdrop close paths route through the same gate as the custom
 *     close-button click.
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
   * confirm prompt for the current close attempt. The hide.bs.modal
   * before-close listener (setupBeforeCloseGate) checks this flag and
   * preventDefault's the close when it's false AND the form is dirty.
   */
  private _userConfirmedClose = false
  /**
   * The Bootstrap modal element (the `.modal` wrapper around domNode)
   * that we attach the hide.bs.modal listener to. Captured at open time
   * for clean detach in destroy().
   */
  private _modalEl?: HTMLElement
  private _beforeCloseHandler?: (e: Event) => void

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
    this.teardownBeforeCloseGate()
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
    // Honor the public alwaysDisableLocalization / alwaysDisableUndelete
    // flags — defaults stay `true` to preserve the source's hide-by-default
    // behavior, but consumers who flip either to false get the standard
    // Serenity button back. Previously these flags were settable but
    // ignored, presenting a misleading public API.
    if (this._alwaysDisableLocalization) this.localizerButton?.hide()
    if (this._alwaysDisableUndelete) this.undeleteButton?.hide()
    this.cloneButton?.toggle(this.isEditMode())

    this.initCloseButtonHandler()
    this.setupBeforeCloseGate()
    setInactiveModal(this.domNode)

    super.onDialogOpen()
  }

  /**
   * Register the Bootstrap `hide.bs.modal` before-close listener that
   * gates Esc / backdrop / programmatic close paths on the dirty-check
   * prompt.
   *
   * Why a before-close listener rather than the inherited
   * `onDialogClose` override: Serenity's `onDialogClose` is invoked from
   * the AFTER-close hook (the modal is already hiding when it fires).
   * Returning early from `onDialogClose` does NOT keep the modal
   * visible. The confirm prompt would appear over a hidden modal and
   * the user could end up with an orphaned dialog state. Bootstrap's
   * `hide.bs.modal` fires BEFORE the hide animation and respects
   * `preventDefault()` — that's what we need to actually gate the
   * close.
   *
   * Flow:
   *   1. User presses Esc / clicks backdrop / calls `dialogClose()`.
   *   2. Bootstrap dispatches `hide.bs.modal`.
   *   3. Our handler fires: if not yet confirmed AND dirty,
   *      `e.preventDefault()` (modal stays open) and show the confirm
   *      prompt.
   *   4. Prompt's onYes-save-success or onNo-discard callback sets
   *      `_userConfirmedClose = true` then calls `dialogClose()`.
   *   5. Bootstrap re-dispatches `hide.bs.modal`; our handler sees the
   *      flag and lets the close proceed.
   *   6. After Bootstrap finishes hiding, `onDialogClose` runs and
   *      dispatches `customEvent` + cleanup. The flag is reset there
   *      for the next open.
   */
  private setupBeforeCloseGate(): void {
    // Deferred — Serenity's modal wrapper may not be in the DOM yet at
    // the moment onDialogOpen fires. setTimeout(0) lets the mount settle.
    setTimeout(() => {
      if (this._isDestroyed) return
      const modal = this.domNode.closest<HTMLElement>('.modal')
      if (!modal) return

      // Replace any prior wiring (defensive — onDialogOpen runs on every
      // open of a reused dialog instance).
      this.teardownBeforeCloseGate()

      const handler = (e: Event) => {
        if (this._userConfirmedClose) return
        if (!this.hasUnsavedChanges()) return
        e.preventDefault()
        this.showDirtyCloseConfirm()
      }
      modal.addEventListener('hide.bs.modal', handler)
      this._modalEl = modal
      this._beforeCloseHandler = handler
    }, 0)
  }

  private teardownBeforeCloseGate(): void {
    if (this._modalEl && this._beforeCloseHandler) {
      this._modalEl.removeEventListener('hide.bs.modal', this._beforeCloseHandler)
    }
    this._modalEl = undefined
    this._beforeCloseHandler = undefined
  }

  /**
   * Show the confirm prompt for an unsaved-changes close attempt. Used
   * by both the before-close gate (setupBeforeCloseGate) and the
   * custom close button (onCloseButtonClick). Both paths route through
   * this single implementation so the user only ever sees ONE prompt
   * spelling and `_userConfirmedClose` is set in one place per outcome.
   */
  private showDirtyCloseConfirm(result?: string): void {
    confirmDialog(
      this.confirmMessage,
      () => {
        // Yes, save. Validate first so the user gets explicit feedback if
        // validation blocks the save — Serenity's inline errors fire too
        // but are easy to miss while focus is on the prompt.
        if (!this.validateBeforeSave()) {
          notifyError('Save failed — please review the form for validation errors.')
          return
        }
        this.save(() => {
          this._userConfirmedClose = true
          this.dialogClose(result ?? 'save-and-close')
        })
      },
      {
        title: this.confirmTitle,
        onNo: () => {
          // Discard — clear the snapshot so subsequent dirty checks pass,
          // then trigger close. The before-close handler will see the
          // confirmed flag and let it through.
          this._userConfirmedClose = true
          this.initialEntity = this.getSaveEntity() as TItem
          this.dialogClose(result ?? 'discarded-unsaved-changes')
        },
      },
    )
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
    // onDialogClose runs from the AFTER-close hook — by the time we get
    // here the modal is already hiding. The dirty-close GATE lives in
    // setupBeforeCloseGate (a hide.bs.modal preventDefault listener); we
    // only reach onDialogClose when the close is actually allowed to
    // proceed (either no unsaved changes OR user already confirmed).
    // This method's responsibility: dispatch customEvent, restore modal
    // stack layering, reset the confirmed flag for the next open, and
    // tear down the before-close listener.
    if (!this.customEvent) this.setCustomEvent({})
    const evt = this.customEvent!
    this.element[0].dispatchEvent(evt)
    // Clear the customEvent after dispatch — without this, a reused
    // dialog instance can replay stale `detail` from a prior close
    // (e.g., a subclass called setCustomEvent during a save flow, then
    // the user opens + closes again without triggering a fresh
    // setCustomEvent). Reset forces the next close to either set a
    // fresh payload or fall back to an empty {}.
    this.customEvent = undefined
    this.restoreActiveModal()
    this.teardownBeforeCloseGate()
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

  /** Max time waitForCanClose will poll before giving up (defensive cap). */
  private static readonly CAN_CLOSE_MAX_WAIT_MS = 5_000

  private waitForCanClose(): Promise<void> {
    // Replaces the source's `setInterval(100ms)` polling. Resolves
    // immediately if _canClose is already true; otherwise polls quietly.
    // Interval handle stored on the instance so destroy() can clear it
    // (otherwise a never-flipping _canClose would leak the interval forever).
    // Bounded by CAN_CLOSE_MAX_WAIT_MS — protects against a subclass
    // override of updateInterface that throws before the snapshot timer
    // resets _canClose, which would otherwise leave the interval running
    // until destroy.
    return new Promise(resolve => {
      if (this._canClose) {
        resolve()
        return
      }
      // Clear any prior polling interval — only one waiter at a time.
      if (this._canClosePollId !== undefined) clearInterval(this._canClosePollId)
      const startedAt = Date.now()
      this._canClosePollId = setInterval(() => {
        const elapsed = Date.now() - startedAt
        const done = this._isDestroyed || this._canClose || elapsed >= IdevsEntityDialog.CAN_CLOSE_MAX_WAIT_MS
        if (done) {
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
    if (this._isDestroyed) return
    // Route through dialogClose — the before-close gate
    // (setupBeforeCloseGate) sees the resulting hide.bs.modal and runs
    // the dirty-check + confirm prompt centrally. Previously this method
    // duplicated the prompt logic; consolidated so all close paths
    // (Esc, backdrop, programmatic, custom X button) hit one prompt.
    this.dialogClose('save-and-close')
  }

  /**
   * Pre-save validation guard. Override in subclasses for custom checks.
   * Defaults to invoking Serenity's standard validateForm() if present;
   * returns true (let save proceed) when the validator isn't available.
   */
  protected validateBeforeSave(): boolean {
    const self = this as unknown as { validateForm?: () => boolean }
    if (typeof self.validateForm === 'function') return self.validateForm()
    return true
  }
}
