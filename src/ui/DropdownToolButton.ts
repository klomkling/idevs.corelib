import { first, isEmptyOrNull, tryFirst } from '@serenity-is/corelib'

// Exported for unit testing — avoids HTML interpolation of caller-supplied strings.
export function buildSideButtonElement(button: {
  key?: string
  title?: string
  icon?: string
  cssClass?: string
  disabled?: boolean
}): HTMLElement {
  const el = document.createElement('div')
  const classes = ['tool-button', 'add-button', 'icon-tool-button']
  if (button.cssClass) {
    // Split into whitespace-separated tokens and keep only valid CSS class names
    // (word chars and hyphens). Drops anything that could escape the attribute
    // (quotes, angle brackets, equals signs from injection attempts).
    for (const token of button.cssClass.split(/\s+/)) {
      if (token && /^[\w-]+$/.test(token)) {
        classes.push(token)
      }
    }
  }
  if (button.disabled) classes.push('disabled')
  el.className = classes.join(' ')
  el.setAttribute('data-idevs-key', button.key ?? '')
  if (button.title) el.title = button.title // safe: title is a property, not parsed as HTML

  const outer = document.createElement('div')
  outer.className = 'button-outer'
  const inner = document.createElement('span')
  inner.className = 'button-inner'
  const icon = document.createElement('i')
  if (button.icon) icon.className = button.icon
  inner.appendChild(icon)
  outer.appendChild(inner)
  el.appendChild(outer)

  return el
}

export type DropdownToolButtonOptions = {
  title?: string
  cssClass?: string
  icon?: string
  disabled?: boolean
  dropdownMenuPosition?: 'right'
  isDropUp?: boolean
}

export type DropdownToolButtonItem = {
  key: string
  title?: string
  hint?: string
  cssClass?: string
  icon?: string
  onClick?: (e: Event) => void
  isSeparator?: boolean
  disabled?: boolean
  isDropdownHeader?: boolean
  dropdownHeaderTitle?: string
}

export type ToolDropdownSideButtonItem = {
  key: string
  title?: string
  hint?: string
  cssClass?: string
  icon?: string
  onClick?: (e: Event) => void
  disabled?: boolean
}

export class DropdownToolButton {
  public element: JQuery
  private isDisabled = false
  private itemDisablingState: { key: string; disabled: boolean }[] = []
  private options: DropdownToolButtonOptions

  public constructor(
    container: JQuery,
    buttons: DropdownToolButtonItem[],
    opt?: DropdownToolButtonOptions
  ) {
    this.options = opt || {}
    this.isDisabled = this.options.disabled || false
    this.element = this.buildBaseDropdown()
    this.addDropdownItems(buttons)

    container.append(this.element)
  }

  private getDisablingStateItem(key: string): boolean {
    if (tryFirst(this.itemDisablingState, x => x.key === key) != null) {
      return first(this.itemDisablingState, x => x.key === key).disabled || false
    }

    return false
  }

  private setDisablingStateItem(key: string, value: boolean) {
    if (tryFirst(this.itemDisablingState, x => x.key === key) != null) {
      first(this.itemDisablingState, x => x.key === key).disabled = value || false
      return
    }

    this.itemDisablingState.push({ key: key, disabled: value || false })
  }

  private removeDisablingStateItem(key: string) {
    this.itemDisablingState.some((item, idx) => {
      if (item.key === key) {
        this.itemDisablingState.splice(idx, 1)

        return true
      }
    })
  }

  private buildBaseDropdown(): JQuery {
    const dropdownTemplate = `<div class="buttons-inner dropdown" style="overflow: visible">
    <div class="idevs-tool-dropdown-button tool-button icon-tool-button ${
      this.options.cssClass ?? ''
    } ${this.options.isDropUp ? 'dropup' : ''} ${
      this.isDisabled ? 'disabled' : ''
    }" style="cursor: unset;">
        <div class="button-outer dropdown-toggle ${this.isDisabled ? 'disabled' : ''}"
        data-bs-toggle="dropdown"
        style="cursor: pointer;">
            <span class="button-inner">
                <i class="${this.options.icon}"></i>
                ${this.options.title ?? ''}
            </span>
            <i class="caret"></i>
        </div>
        <ul class="dropdown-menu ${
          this.options.dropdownMenuPosition === 'right' ? 'dropdown-menu-right' : ''
        }"></ul>
    </div>
</div>`

    return $(dropdownTemplate)
  }

  public addDropdownItems(buttons: DropdownToolButtonItem[]) {
    if (buttons && buttons.length > 0) {
      buttons.forEach(button => {
        this.addDropdownItem(button)
      })
    }
  }

  public addDropdownItem(button: DropdownToolButtonItem, idx?: number) {
    if (!isEmptyOrNull(button.key)) {
      if (this.itemDisablingState.map(x => x.key).indexOf(button.key) > -1) {
        alert(`Dropdown has existed key: ${button.key}`)
        return
      }

      this.setDisablingStateItem(button.key, button.disabled || false)
    }

    let dropdownItemElement: JQuery

    if (button.isDropdownHeader && !isEmptyOrNull(button.dropdownHeaderTitle ?? '')) {
      dropdownItemElement = $(
        `<li class="dropdown-header ${button.cssClass ?? ''}">${button.dropdownHeaderTitle}</li>`
      )
    } else {
      if (button.isSeparator) {
        dropdownItemElement = $(`<li class="dropdown-divider"></li>`)
      } else {
        dropdownItemElement = $(`<li class="${button.disabled ? 'disabled' : ''}"
                title="${button.hint ?? ''}"
                data-idevs-key="${button.key ?? ''}">
                    <a href="#" class="${button.cssClass ?? 'dropdown-item'}">
                        <i class="${button.icon ?? ''}"></i>
                        ${button.title}
                    </a>
                </li>`)

        dropdownItemElement.on('click', (e: Event) => {
          e.preventDefault()

          if (this.isDisabled) {
            return
          }

          let buttonIsDisabled = button.disabled

          if (!isEmptyOrNull(button.key)) {
            buttonIsDisabled = this.getDisablingStateItem(button.key)
          }
          if (buttonIsDisabled) {
            return
          }

          button.onClick?.(e)
        })
      }
    }

    if (idx === null || typeof idx === 'undefined') {
      this.element.find('.dropdown-menu').append(dropdownItemElement)
      return
    }

    if (idx <= 0) {
      this.element.find('.dropdown-menu').prepend(dropdownItemElement)
      return
    }

    const nbrOfButtons = this.element.find(`.dropdown-menu > li`).length

    if (idx > nbrOfButtons) {
      idx = nbrOfButtons
    }

    this.element.find(`.dropdown-menu > li:nth-child(${idx})`).after(dropdownItemElement)
  }

  public enableDropdown(enable: boolean) {
    const drd = this.element.find('.dropdown').first()
    if (drd) {
      if (enable) {
        if (drd.hasClass('disabled')) {
          drd.removeClass('disabled')
        }
      } else {
        if (!drd.hasClass('disabled')) {
          drd.addClass('disabled')
        }
      }
    }

    const drdToggle = this.element.find('.dropdown-toggle').first()
    if (drdToggle) {
      if (enable) {
        if (drdToggle.hasClass('disabled')) {
          drd.removeClass('disabled')
        } else {
          if (!drdToggle.hasClass('disabled')) {
            drdToggle.addClass('disabled')
          }
        }
      }
    }

    this.isDisabled = !enable
  }

  public enableDropdownItemByKey(key: string, enable: boolean) {
    const drdItem = this.element.find(`.dropdown-menu li[data-idevs-key="${key}"]`).first()
    if (drdItem) {
      if (enable) {
        if (drdItem.hasClass('disabled')) {
          drdItem.removeClass('disabled')
        }
      } else {
        if (!drdItem.hasClass('disabled')) {
          drdItem.addClass('disabled')
        }
      }
    }

    this.setDisablingStateItem(key, !enable)
  }

  public enableSideButtonByKey(key: string, enable: boolean) {
    const tButton = this.element.find(`.tool-button[data-idevs-key="${key}"]`).first()
    if (tButton) {
      if (enable) {
        if (tButton.hasClass('disabled')) {
          tButton.removeClass('disabled')
        }
      } else {
        if (!tButton.hasClass('disabled')) {
          tButton.addClass('disabled')
        }
      }
    }

    this.setDisablingStateItem(key, !enable)
  }

  public removeDropdownItem(key: string) {
    this.element.find(`.dropdown-menu li[data-idevs-key="${key}"]`).remove()
    this.removeDisablingStateItem(key)
  }

  public removeSideButtonItem(key: string) {
    this.element.find(`.tool-button[data-idevs-key="${key}"]`).remove()
    this.removeDisablingStateItem(key)
  }

  public addSideButtonItem(button: ToolDropdownSideButtonItem, idx?: number) {
    if (!isEmptyOrNull(button.key)) {
      if (this.itemDisablingState.map(x => x.key).indexOf(button.key) > -1) {
        alert(`Dropdown has existed key: ${button.key}`)
        return
      }

      this.setDisablingStateItem(button.key, button.disabled || false)
    }

    const sideButton = $(buildSideButtonElement(button))

    sideButton.on('click', (e: Event) => {
      e.preventDefault()

      let buttonIsDisabled = button.disabled

      if (!isEmptyOrNull(button.key)) {
        buttonIsDisabled = this.getDisablingStateItem(button.key)
      }

      if (buttonIsDisabled) {
        return
      }

      button.onClick?.(e)
    })

    if (idx === null || typeof idx === 'undefined') {
      this.element.append(sideButton)
      return
    }

    if (idx <= 0) {
      this.element.prepend(sideButton)
      return
    }

    const nbrOfButtons = this.element.find(`div.tool-button`).length

    if (idx > nbrOfButtons) {
      idx = nbrOfButtons
    }

    this.element.find(`div.tool-button:nth-child(${idx})`).after(sideButton)
  }
}
