import {
  Decorators,
  type EntityDialog,
  notifyError,
  Widget,
  type WidgetProps,
} from '@serenity-is/corelib'

/**
 * Bootstrap offcanvas slide-out panel that hosts an EntityDialog. The dialog
 * is initialized lazily via `props.initDialog()`; on `load()` it opens
 * inside the offcanvas body. `onDataChangeCallback` fires when the embedded
 * dialog emits an `ondatachange` event, and the panel destroys itself.
 *
 * Replaces PowerACC's `OffCanvasPanel`. Hardening:
 *   - Source had three debug `console.log/error` calls; removed.
 *   - `target.parentElement.parentElement` chains null-guarded.
 *   - title `innerHTML` copy from the dialog titlebar replaced with a
 *     textContent + cloneNode round-trip (preserves child markup safely
 *     when the consumer rendered the titlebar via DOM API).
 *   - generateRandomId from PowerACC inlined as a Math.random base36
 *     substring (8 chars) — matches the source's id-length expectation.
 *   - `injectDialogIntoPanel` retry-limit of 100 (10s total) preserved
 *     from source; the silent give-up replaces the source's console.error.
 */

export type IdevsOffcanvasPanelOptions = {
  target: HTMLElement
  initDialog: () => EntityDialog<unknown, unknown>
  onDataChangeCallback?: () => void
  // NOTE: PowerACC's source declared `sliderWidth` and `entityOrId` on the
  // options type but never read either. Dropped here to avoid a misleading
  // API surface. Consumers needing custom panel width should set it via
  // CSS or extend this class; consumers wanting auto-load by id can pass
  // it to `load(id)` directly.
}

function generateRandomId(length: number): string {
  return Math.random().toString(36).substring(2, 2 + length)
}

@Decorators.registerClass('Idevs.CoreLib.IdevsOffcanvasPanel')
export class IdevsOffcanvasPanel extends Widget<IdevsOffcanvasPanelOptions> {
  private static readonly BODY_OPEN_CLASS = 'with-offcanvas-panel'

  private readonly canvasId: string
  private overlayDiv!: HTMLElement
  private readonly dlg: EntityDialog<unknown, unknown>
  private isLoaded = false
  private isTorn = false
  private dataChangeHandler?: () => void
  /** Pending setTimeout handles from injectDialogIntoPanel's retry loop. */
  private pendingTimers: Array<ReturnType<typeof setTimeout>> = []

  constructor(prop: WidgetProps<IdevsOffcanvasPanelOptions>) {
    super(prop)

    const target = this.getTargetElement()
    this.dlg = this.props.initDialog()
    this.canvasId = generateRandomId(8)
    this.createCanvasElement()
    target.appendChild(this.domNode)

    // The embedded dialog signals data changes via jQuery custom event.
    // Both event spellings supported (IdevsEntityDialog dispatches both
    // 'onDataChange' and 'ondatachange' — see batch 4a Copilot review).
    // Handler stored on the instance so teardown can call .off() with the
    // function reference (otherwise .off() would remove ALL listeners for
    // those events, including ones the consumer may have attached).
    this.dataChangeHandler = () => {
      this.props.onDataChangeCallback?.()
      this.teardown()
    }
    $(this.dlg.domNode).on('onDataChange ondatachange', this.dataChangeHandler)
  }

  override destroy(): void {
    this.teardown()
    super.destroy()
  }

  /**
   * Idempotent teardown — removes the body class, detaches the jQuery
   * data-change listener, destroys the embedded dialog, and removes the
   * panel's DOM. Used by both the dialog's data-change event and the
   * Widget destroy() override.
   */
  private teardown(): void {
    if (this.isTorn) return
    this.isTorn = true

    document.body.classList.remove(IdevsOffcanvasPanel.BODY_OPEN_CLASS)

    // Cancel any pending injectDialogIntoPanel retries so they can't run
    // against detached DOM (or click the hidden toggle button) after teardown.
    for (const id of this.pendingTimers) clearTimeout(id)
    this.pendingTimers = []

    if (this.dataChangeHandler) {
      try {
        // Scoped removal — pass the handler reference so we don't strip
        // listeners that consumers attached for the same event names.
        $(this.dlg.domNode).off('onDataChange ondatachange', this.dataChangeHandler)
      } catch {
        /* dialog DOM may already be detached */
      }
      this.dataChangeHandler = undefined
    }
    try {
      this.dlg.destroy()
    } catch {
      /* dialog destroy can throw if Serenity's chain races; swallow */
    }
    this.domNode.remove()
  }

  public load(id?: string | number): void {
    // Explicit nullish check — `if (id)` would skip valid falsy ids like 0
    // or '' (numeric 0 is a legitimate primary key in many systems).
    if (id !== undefined && id !== null) {
      this.dlg.loadById(
        id as never,
        () => {
          // Success: no-op (the dialog will render its loaded entity).
        },
        () => {
          // Source's port passed `() => {}` for error — preserving that
          // hid every load failure (404 / 500 / deleted record / auth)
          // and left users staring at a blank offcanvas. Surface a
          // user-visible error and tear down so the panel doesn't get
          // stuck half-open. Serenity's typed signature is `() => void`
          // (no payload); the dialog framework surfaces its own toast
          // for the underlying service error — this notification
          // confirms to the user that the offcanvas close was a
          // consequence, not a freeze.
          notifyError('Failed to load record.')
          this.teardown()
        },
      )
    }

    document.body.classList.add(IdevsOffcanvasPanel.BODY_OPEN_CLASS)
    this.isLoaded = true

    // Hook into Bootstrap's offcanvas hidden event (fires on Esc, backdrop
    // click, or close-button click) and route through full teardown.
    // Previously this handler only removed the body class — the embedded
    // dialog, jQuery data-change listener, and pending injectDialogIntoPanel
    // timers would all leak when the user dismissed via any of those
    // non-data-change paths. teardown() is idempotent so the followup
    // ondatachange path (when present) is harmless.
    this.overlayDiv.addEventListener(
      'hidden.bs.offcanvas',
      () => {
        this.teardown()
      },
      { once: true },
    )

    const body = this.overlayDiv.querySelector('.offcanvas-body')
    if (!body) return

    this.dlg.dialogOpen(true)
    const parent = this.dlg.domNode.parentElement
    if (parent) {
      parent.classList.add('offcanvas-item')
      body.appendChild(parent)
    }

    this.injectDialogIntoPanel()
  }

  private createCanvasElement(): void {
    const btnToggle = document.createElement('button')
    btnToggle.setAttribute('id', `canvasToggle_${this.canvasId}`)
    btnToggle.classList.add('d-none')
    btnToggle.setAttribute('type', 'button')
    btnToggle.setAttribute('data-bs-toggle', 'offcanvas')
    btnToggle.setAttribute('data-bs-target', `#offcanvasRight_${this.canvasId}`)
    btnToggle.setAttribute('aria-controls', `offcanvasRight_${this.canvasId}`)
    this.domNode.append(btnToggle)

    this.overlayDiv = document.createElement('div')
    this.overlayDiv.classList.add('offcanvas', 'offcanvas-end')
    this.overlayDiv.setAttribute('tabindex', '-1')
    this.overlayDiv.setAttribute('id', `offcanvasRight_${this.canvasId}`)
    this.overlayDiv.setAttribute('aria-labelledby', `offcanvasRightLabel_${this.canvasId}`)
    this.overlayDiv.setAttribute('role', 'dialog')
    this.overlayDiv.setAttribute('aria-modal', 'true')

    const header = document.createElement('div')
    header.classList.add('offcanvas-header')

    const title = document.createElement('h5')
    title.classList.add('offcanvas-title')
    title.setAttribute('id', `offcanvasRightLabel_${this.canvasId}`)

    const closeButton = document.createElement('button')
    closeButton.classList.add('btn-close')
    closeButton.setAttribute('type', 'button')
    closeButton.setAttribute('data-bs-dismiss', 'offcanvas')
    closeButton.setAttribute('aria-label', 'Close')

    header.appendChild(title)
    header.appendChild(closeButton)
    this.overlayDiv.appendChild(header)

    const body = document.createElement('div')
    body.classList.add('offcanvas-body')

    this.overlayDiv.appendChild(body)
    this.domNode.append(this.overlayDiv)
  }

  private getTargetElement(): HTMLElement {
    const target = this.props.target
    if (target.classList.contains('panel-body')) {
      return target.parentElement?.parentElement ?? target
    }
    if (target.classList.contains('ui-dialog-content')) {
      return target.parentElement ?? target
    }
    return target
  }

  private injectDialogIntoPanel(): void {
    const MAX_RETRIES = 100
    let attempts = 0

    const scheduleTimer = (cb: () => void, delay: number): void => {
      if (this.isTorn) return
      const id = setTimeout(() => {
        // Drop the handle from the pending list before running the callback
        // so destroy() doesn't try to clear an already-fired timer.
        this.pendingTimers = this.pendingTimers.filter(t => t !== id)
        if (this.isTorn) return
        cb()
      }, delay)
      this.pendingTimers.push(id)
    }

    const tryInject = (): void => {
      scheduleTimer(() => {
        attempts++
        if (attempts >= MAX_RETRIES) return // give up silently (source console.error'd)

        if (!this.overlayDiv.querySelector('.panel-titlebar')) {
          tryInject()
          return
        }

        // Unhide any previously-hidden sibling panel.
        let parent: HTMLElement | null = this.overlayDiv.parentElement
        if (parent?.getAttribute('data-hiddenby')) {
          const lastChild = parent.parentElement?.querySelector<HTMLElement>(
            '.s-Panel[data-hiddenby]:not(.offcanvas-item)',
          )
          lastChild?.removeAttribute('data-hiddenby')
          parent.removeAttribute('data-hiddenby')
        } else {
          parent = this.getTargetElement()
          parent.removeAttribute('data-hiddenby')
        }

        scheduleTimer(() => {
          const titlebar = this.overlayDiv.querySelector<HTMLElement>('.panel-titlebar')
          const titleEl = this.overlayDiv.querySelector<HTMLElement>('.offcanvas-title')
          if (titlebar && titleEl) {
            // XSS-safer than raw markup copy — clone the first child node
            // tree into the title element. textContent fallback when
            // there's no child element.
            const firstChild = titlebar.firstElementChild
            if (firstChild) {
              titleEl.replaceChildren(firstChild.cloneNode(true))
            } else {
              titleEl.textContent = titlebar.textContent ?? ''
            }
            titlebar.remove()
          }
        }, 100)

        const dialogParent = this.dlg.domNode.parentElement
        if (dialogParent) dialogParent.style.setProperty('display', 'block', 'important')

        const btn = this.domNode.querySelector<HTMLButtonElement>(
          `#canvasToggle_${this.canvasId}`,
        )
        btn?.click()
      }, 100)
    }

    tryInject()
  }
}
