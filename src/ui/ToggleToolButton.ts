import { neededTarget } from '../globals'

export type ToggleToolButtonOptions = {
  title?: string
  hint?: string
  cssClass?: string
  altCssClass?: string
  icon?: string
  altIcon?: string
  onClick?: (e: JQuery.ClickEvent<HTMLElement, null, HTMLElement, HTMLElement>) => void
  disabled?: boolean
}

export class ToggleToolButton {
  public element: JQuery
  private isDisabled = false
  private options: ToggleToolButtonOptions

  public constructor(container: JQuery, opt?: ToggleToolButtonOptions) {
    this.options = opt || {}
    this.isDisabled = this.options.disabled || false
    this.element = this.buildBaseButton()

    this.element.on('click', e => {
      if (this.isDisabled) return

      const target = neededTarget(e.target as HTMLElement, '.idevs-toggle-button')
      if (this.options.altIcon) {
        const icon = target.querySelector(`i`)
        if (icon && icon.className === this.options.icon) {
          icon.className = this.options.altIcon
        } else if (icon) {
          icon.className = this.options.icon ?? ''
        }
      }

      if (this.options.cssClass && this.options.altCssClass) {
        if (target.className.includes(this.options.cssClass)) {
          target.className = target.className.replace(
            this.options.cssClass,
            this.options.altCssClass
          )
        } else {
          target.className = target.className.replace(
            this.options.altCssClass,
            this.options.cssClass
          )
        }
      }

      if (this.options.onClick) {
        // jQuery's .on('click', ...) handler types the event data slot as `undefined`,
        // but the user-supplied onClick callback declares the data slot as `null`.
        // Both are equivalent at runtime (no data attached); the cast aligns the
        // static types without changing the public API.
        this.options.onClick(
          e as unknown as JQuery.ClickEvent<HTMLElement, null, HTMLElement, HTMLElement>
        )
      }
    })

    container.append(this.element)
  }

  private buildBaseButton(): JQuery {
    const buttonTemplate = `<div class="buttons-inner" style="overflow: visible">
    <div class="idevs-toggle-button tool-button icon-tool-button ${this.options.cssClass ?? ''} ${
      this.isDisabled ? 'disabled' : ''
    }" style="cursor: unset;">
        <div class="button-outer ${this.isDisabled ? 'disabled' : ''}"
        style="cursor: pointer;">
            <span class="button-inner">
                <i class="${this.options.icon}"></i>
                ${this.options.title ?? ''}
            </span>
            <i class="caret"></i>
        </div>
    </div>
</div>`

    return $(buttonTemplate)
  }
}
