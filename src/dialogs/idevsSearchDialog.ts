import {
  Authorization,
  Decorators,
  type DialogOptions,
  Fluent,
  getType,
  Toolbar,
  type ToolButton,
} from '@serenity-is/corelib'
import { IdevsPropertyDialog } from './idevsPropertyDialog'

/**
 * Abstract base for "search result" dialogs — extends IdevsPropertyDialog
 * with a results-grid integration, toolbar customization (clear/new
 * buttons), and a custom dialog-size option. Subclasses implement
 * `getGrid()` and `getFormKey()`.
 *
 * Replaces PowerACC's `CsiSearchDialog`. Preferred API: camelCase methods
 * (`setFilterKeys`, `setCriteriaKeys`, `setSearchValue` inherited from
 * IdevsPropertyDialog; `setDialogSize`/`setDialogType`/`setDialogPermission`
 * /`setPreItems` added here). The PowerACC PascalCase assignment setters
 * (`dialog.FilterKeys = ...`, `dialog.CriteriaKeys = ...`,
 * `dialog.DialogSize = ...`, `dialog.DialogType = ...`,
 * `dialog.DialogPermission = ...`, `dialog.preItems = ...`) are PRESERVED
 * as compatibility shims that route to the camelCase methods. Each routes
 * through the camelCase method so subclass overrides remain effective via
 * either entry point.
 */

type GridLike = {
  refresh(): void
  FilterKeys?: Record<string, unknown>
  CriteriaKeys?: unknown[]
  SearchValue?: unknown
  PreItems?: unknown[]
  EditPermission?: string
} & Record<string, unknown>

@Decorators.registerClass('Idevs.CoreLib.IdevsSearchDialog')
export abstract class IdevsSearchDialog<P = unknown> extends IdevsPropertyDialog<P> {
  protected abstract getGrid(): GridLike | undefined
  protected abstract getFormKey(): string

  private _dialogSize?: 'sm' | 'md' | 'lg' | 'xl'
  private _dialogType?: string
  private _dialogPermission?: string
  private _preItems?: unknown[]
  /** Tracked initToolbar setTimeout so destroy can cancel it. */
  private _initToolbarTimer?: ReturnType<typeof setTimeout>
  private _isSearchDialogDestroyed = false

  // === Public getters / setters (camelCase methods preferred) ===

  get dialogSize(): 'sm' | 'md' | 'lg' | 'xl' | undefined {
    return this._dialogSize
  }
  setDialogSize(value: 'sm' | 'md' | 'lg' | 'xl'): void {
    this._dialogSize = value
  }

  get dialogType(): string | undefined {
    return this._dialogType
  }
  setDialogType(value: string): void {
    this._dialogType = value
  }

  get dialogPermission(): string | undefined {
    return this._dialogPermission
  }
  setDialogPermission(value: string): void {
    this._dialogPermission = value
    const grid = this.getGrid()
    if (grid) grid.EditPermission = value
  }

  get preItems(): unknown[] | undefined {
    return this._preItems
  }
  // === PascalCase compatibility shims ===
  // IdevsSearchButtonEditor.openDialog writes these by property assignment
  // per the PowerACC dialog interface contract. Without a setter pair,
  // (a) DialogSize/Type/Permission writes silently no-op, and
  // (b) `preItems` assignment THROWS in strict mode (getter-only).
  // Each setter routes to the camelCase method so subclass overrides
  // remain effective.
  set DialogSize(value: 'sm' | 'md' | 'lg' | 'xl') {
    this.setDialogSize(value)
  }
  set DialogType(value: string) {
    this.setDialogType(value)
  }
  set DialogPermission(value: string) {
    this.setDialogPermission(value)
  }
  set preItems(value: unknown[]) {
    this.setPreItems(value)
  }
  setPreItems(value: unknown[]): void {
    this._preItems = value
    const grid = this.getGrid()
    if (grid) grid.PreItems = value
  }

  // === Override hooks from IdevsPropertyDialog: forward to the grid ===
  // Public to match the parent's public hook signature (PropertyDialog's
  // setters are public so external callers — like the editor's dialog
  // instantiation path — can pass filter/criteria/search context in).

  override setFilterKeys(filters: Record<string, unknown>): void {
    const grid = this.getGrid()
    if (grid) grid.FilterKeys = filters
    else super.setFilterKeys(filters)
  }

  override setCriteriaKeys(criteria: unknown[]): void {
    const grid = this.getGrid()
    if (grid) grid.CriteriaKeys = criteria
    else super.setCriteriaKeys(criteria)
  }

  override setSearchValue(value: unknown): void {
    const grid = this.getGrid()
    if (grid) grid.SearchValue = value
    else super.setSearchValue(value)
  }

  // === Toolbar customization ===

  protected hideToolbar(): boolean {
    return false
  }

  initToolbar(): void {
    // Cancel any prior pending init (defensive — initToolbar should only
    // be called once per dialog open, but storing the handle anyway lets
    // destroy() cancel cleanly).
    if (this._initToolbarTimer !== undefined) clearTimeout(this._initToolbarTimer)
    this._initToolbarTimer = setTimeout(() => {
      this._initToolbarTimer = undefined
      // Guard against open-then-close races: don't mutate DOM after teardown.
      if (this._isSearchDialogDestroyed) return

      this.toolbar = new Toolbar({
        class: 's-SearchDialogToolbar',
        buttons: this.getToolbarButtons(),
      })

      this.removeEmptyToolGroup()
      const tb = this.domNode.querySelector('.s-Toolbar')
      if (!tb) return
      const rendered = this.toolbar.render()
      while (rendered.firstChild) tb.appendChild(rendered.firstChild)
    }, 100)
  }

  override destroy(): void {
    this._isSearchDialogDestroyed = true
    if (this._initToolbarTimer !== undefined) {
      clearTimeout(this._initToolbarTimer)
      this._initToolbarTimer = undefined
    }
    super.destroy()
  }

  protected getToolbarButtons(): ToolButton[] {
    const buttons = super.getToolbarButtons()
    if (this.hideToolbar()) return buttons

    buttons.push({
      icon: 'bi bi-x-lg',
      hint: 'Clear search',
      cssClass: 'text-danger d-flex justify-content-center align-items-center',
      onClick: () => {
        const inputEl = this.domNode.querySelector<HTMLInputElement>('.s-QuickSearchInput')
        if (!inputEl) return
        const searchInput = Fluent(inputEl)
        searchInput.val('')
        searchInput.trigger('change')
      },
    })

    if (this._dialogType && Authorization.hasPermission(this._dialogPermission ?? '')) {
      buttons.push({
        icon: 'bi bi-plus-lg',
        title: 'New',
        separator: true,
        cssClass: 'text-success d-flex justify-content-center align-items-center',
        onClick: () => {
          const DialogClass = getType(this._dialogType!) as
            | (new (...args: unknown[]) => {
                loadNewAndOpenDialog(triggerEvents?: boolean): void
                element: [HTMLElement]
              })
            | undefined
          if (!DialogClass) return

          const dlg = new DialogClass({})
          dlg.loadNewAndOpenDialog(false)
          dlg.element[0].addEventListener('onDialogClose', (e: Event) => {
            const data = (e as CustomEvent).detail
            if (data && Object.keys(data as Record<string, unknown>).length > 0) {
              this.getGrid()?.refresh()
            }
          })
        },
      })
    }

    return buttons
  }

  protected removeEmptyToolGroup(): void {
    const elements = this.domNode.getElementsByClassName('tool-group')
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i]
      // textContent is safer than innerHTML for the emptiness check and avoids
      // re-parsing.
      if ((element.textContent ?? '').trim() === '' && element.children.length === 0) {
        element.parentNode?.removeChild(element)
      }
    }
  }

  protected override getDialogOptions(): DialogOptions {
    const options = super.getDialogOptions()
    options.size = this._dialogSize ?? 'md'
    return options
  }
}
