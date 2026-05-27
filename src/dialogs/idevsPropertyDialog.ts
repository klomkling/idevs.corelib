import { Decorators, Fluent, PropertyDialog, type WidgetProps } from '@serenity-is/corelib'
import { setActiveModal, setInactiveModal } from '../helpers/dialogHelpers'

/**
 * Property-dialog wrapper that integrates with the modal-stack helpers and
 * dispatches an `onDialogClose` CustomEvent on close. Subclasses override
 * `setFilterKeys` / `setCriteriaKeys` / `setSearchValue` to receive search-
 * style context from a parent search button.
 *
 * Replaces PowerACC's `CsiPropertyDialog`. The preferred API surface is the
 * camelCase methods (`setFilterKeys`, `setCriteriaKeys`, `setSearchValue`);
 * the PascalCase assignment setters from PowerACC (`dialog.FilterKeys = ...`)
 * are PRESERVED as compatibility shims that route to the camelCase methods.
 * Existing callers — notably IdevsSearchButtonEditor.openDialog which still
 * writes by assignment per the dialog interface contract — continue to work
 * unchanged. Subclass overrides on the camelCase methods take effect through
 * either entry point.
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsPropertyDialog')
export class IdevsPropertyDialog<P = unknown> extends PropertyDialog<unknown, P> {
  protected customEvent?: CustomEvent

  private _onDataSelected?: (data: unknown) => void

  constructor(props: WidgetProps<P>) {
    super(props)

    // Tighten the modal header/footer padding — matches PowerACC styling.
    // Deferred so it runs after Serenity finishes mounting the dialog DOM.
    setTimeout(() => {
      const header = this.domNode.parentElement?.querySelector('.modal-header')
      header?.classList.add('py-1')
      const footer = this.domNode.parentElement?.querySelector('.modal-footer')
      footer?.classList.add('py-0')
    }, 0)
  }

  // Public hooks — subclasses override the implementation; external callers
  // (notably IdevsSearchButtonEditor's dialog instantiation path) invoke
  // these to propagate filter/criteria/search context into the dialog.
  setFilterKeys(_filters: Record<string, unknown>): void {}
  setCriteriaKeys(_criteria: unknown[]): void {}
  setSearchValue(_value: unknown): void {}

  // PascalCase property setters — kept as compatibility shims for callers
  // (e.g., IdevsSearchButtonEditor.openDialog) that still write
  // `dialog.FilterKeys = {...}` per the PowerACC dialog interface contract.
  // Route to the camelCase methods so subclass overrides take effect.
  set FilterKeys(filters: Record<string, unknown>) {
    this.setFilterKeys(filters)
  }
  set CriteriaKeys(criteria: unknown[]) {
    this.setCriteriaKeys(criteria)
  }
  set SearchValue(value: unknown) {
    this.setSearchValue(value)
  }

  // Selection callback wiring.
  set onDataSelected(callback: (data: unknown) => void) {
    this._onDataSelected = callback
  }

  protected setCustomEvent(detail: unknown): void {
    this.customEvent = new CustomEvent('onDialogClose', { detail })
  }

  protected override onDialogOpen(): void {
    super.onDialogOpen()
    setInactiveModal(this.domNode)
  }

  protected override onDialogClose(result?: string): void {
    if (!this.customEvent) this.setCustomEvent({})
    const evt = this.customEvent!
    this.element[0].dispatchEvent(evt)
    this._onDataSelected?.(evt.detail)
    // Clear the customEvent after dispatch — without this, a reused dialog
    // instance can replay stale `detail` on a subsequent close if no new
    // setCustomEvent was called in the interim (e.g., user cancels after
    // a prior data selection). Resetting forces the next close to either
    // explicitly set a payload or fall back to an empty {}.
    this.customEvent = undefined
    this.restoreActiveModal()
    super.onDialogClose(result)
  }

  private restoreActiveModal(): void {
    // Guard against detached DOM (closest can return null when the dialog
    // is being torn down).
    const modal = this.domNode.closest<HTMLElement>('.modal')
    if (!modal) {
      setActiveModal(0)
      return
    }
    const currentLevel = parseInt(Fluent(modal).data('qrouterorder') ?? '0', 10)
    setActiveModal(currentLevel)
  }
}
