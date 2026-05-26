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
 * Replaces PowerACC's `CsiSearchDialog`. PascalCase setters from the source
 * (`set FilterKeys`, `set CriteriaKeys`, `set SearchValue`, `set DialogSize`)
 * are dropped in favor of camelCase methods inherited from the parent + a
 * couple new ones (`setDialogSize`/`setDialogType`/`setDialogPermission`).
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
  setPreItems(value: unknown[]): void {
    this._preItems = value
    const grid = this.getGrid()
    if (grid) grid.PreItems = value
  }

  // === Override hooks from IdevsPropertyDialog: forward to the grid ===

  protected override setFilterKeys(filters: Record<string, unknown>): void {
    const grid = this.getGrid()
    if (grid) grid.FilterKeys = filters
    else super.setFilterKeys(filters)
  }

  protected override setCriteriaKeys(criteria: unknown[]): void {
    const grid = this.getGrid()
    if (grid) grid.CriteriaKeys = criteria
    else super.setCriteriaKeys(criteria)
  }

  protected override setSearchValue(value: unknown): void {
    const grid = this.getGrid()
    if (grid) grid.SearchValue = value
    else super.setSearchValue(value)
  }

  // === Toolbar customization ===

  protected hideToolbar(): boolean {
    return false
  }

  initToolbar(): void {
    setTimeout(() => {
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
