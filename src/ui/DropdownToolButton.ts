import { first, isEmptyOrNull, tryFirst } from '@serenity-is/corelib'

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

// Filters caller-supplied cssClass tokens to safe ones, matching the
// pattern used by buildSideButtonElement.
function __sanitizeClassTokens(cssClass: string | undefined): string[] {
  if (!cssClass) return []
  const tokens: string[] = []
  for (const token of cssClass.split(/\s+/)) {
    if (token && /^[\w-]+$/.test(token)) {
      tokens.push(token)
    }
  }
  return tokens
}

/**
 * Builds the base dropdown container element used by `DropdownToolButton`.
 * Mirrors the original `buildBaseDropdown` template structure but constructs
 * each node via DOM APIs so caller-supplied title/icon/cssClass cannot inject
 * markup. Exported for unit testing.
 *
 * @internal
 */
export function __buildDropdownBaseElement(
  options: DropdownToolButtonOptions,
  isDisabled: boolean
): HTMLElement {
  const outerWrap = document.createElement('div')
  outerWrap.className = 'buttons-inner dropdown'
  outerWrap.style.overflow = 'visible'

  const inner = document.createElement('div')
  const innerClasses = [
    'idevs-tool-dropdown-button',
    'tool-button',
    'icon-tool-button',
    ...__sanitizeClassTokens(options.cssClass),
  ]
  if (options.isDropUp) innerClasses.push('dropup')
  if (isDisabled) innerClasses.push('disabled')
  inner.className = innerClasses.join(' ')
  inner.style.cursor = 'unset'
  outerWrap.appendChild(inner)

  const toggle = document.createElement('div')
  const toggleClasses = ['button-outer', 'dropdown-toggle']
  if (isDisabled) toggleClasses.push('disabled')
  toggle.className = toggleClasses.join(' ')
  toggle.setAttribute('data-bs-toggle', 'dropdown')
  toggle.style.cursor = 'pointer'
  inner.appendChild(toggle)

  const buttonInner = document.createElement('span')
  buttonInner.className = 'button-inner'
  toggle.appendChild(buttonInner)

  const icon = document.createElement('i')
  if (options.icon) icon.className = __sanitizeClassTokens(options.icon).join(' ')
  buttonInner.appendChild(icon)

  if (options.title) {
    buttonInner.appendChild(document.createTextNode(` ${options.title}`))
  }

  const caret = document.createElement('i')
  caret.className = 'caret'
  toggle.appendChild(caret)

  const menu = document.createElement('ul')
  const menuClasses = ['dropdown-menu']
  if (options.dropdownMenuPosition === 'right') menuClasses.push('dropdown-menu-right')
  menu.className = menuClasses.join(' ')
  inner.appendChild(menu)

  return outerWrap
}

/**
 * Builds the side-button DOM element used by `addSideButtonItem`. Exported
 * for unit testing; sanitizes caller-supplied class tokens to prevent XSS
 * through `cssClass`.
 *
 * @internal
 */
export function buildSideButtonElement(button: ToolDropdownSideButtonItem): HTMLElement {
  const el = document.createElement('div')
  const classes = ['tool-button', 'add-button', 'icon-tool-button']
  // Split into whitespace-separated tokens and keep only valid CSS class names
  // (word chars and hyphens). Drops anything that could escape the attribute
  // (quotes, angle brackets, equals signs from injection attempts).
  const safeClasses = __sanitizeClassTokens(button.cssClass)
  classes.push(...safeClasses)
  if (button.disabled) classes.push('disabled')
  el.className = classes.join(' ')
  el.setAttribute('data-idevs-key', button.key ?? '')
  if (button.title) el.title = button.title // safe: title is a property, not parsed as HTML

  const outer = document.createElement('div')
  outer.className = 'button-outer'
  const inner = document.createElement('span')
  inner.className = 'button-inner'
  const icon = document.createElement('i')
  if (button.icon) icon.className = __sanitizeClassTokens(button.icon).join(' ')
  inner.appendChild(icon)
  outer.appendChild(inner)
  el.appendChild(outer)

  return el
}

/**
 * Builds an individual dropdown menu item element. Exported for unit testing;
 * sanitizes caller-supplied class/icon tokens and uses `textContent`/text
 * nodes so titles and hints cannot inject markup.
 *
 * @internal
 */
export function buildDropdownItemElement(button: DropdownToolButtonItem): HTMLElement {
  const li = document.createElement('li')
  const dropdownHeaderTitle = button.dropdownHeaderTitle

  if (
    button.isDropdownHeader &&
    typeof dropdownHeaderTitle === 'string' &&
    !isEmptyOrNull(dropdownHeaderTitle)
  ) {
    const classes = ['dropdown-header', ...__sanitizeClassTokens(button.cssClass)]
    li.className = classes.join(' ')
    li.textContent = dropdownHeaderTitle
    return li
  }

  // Preserve original attributes: title, data-idevs-key, disabled class on <li>;
  // anchor uses cssClass (defaulting to 'dropdown-item'), href="#", icon, and title text.
  if (button.disabled) li.className = 'disabled'
  if (button.hint) li.title = button.hint // safe: title is a property, not parsed as HTML
  li.setAttribute('data-idevs-key', button.key ?? '')

  const a = document.createElement('a')
  a.href = '#'
  const anchorClasses = __sanitizeClassTokens(button.cssClass)
  a.className = anchorClasses.length ? anchorClasses.join(' ') : 'dropdown-item'

  const icon = document.createElement('i')
  if (button.icon) icon.className = __sanitizeClassTokens(button.icon).join(' ')
  a.appendChild(icon)

  if (button.title) {
    a.appendChild(document.createTextNode(` ${button.title}`))
  }

  li.appendChild(a)
  return li
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
    return $(__buildDropdownBaseElement(this.options, this.isDisabled))
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
      dropdownItemElement = $(buildDropdownItemElement(button))
    } else {
      if (button.isSeparator) {
        const separator = document.createElement('li')
        separator.className = 'dropdown-divider'
        dropdownItemElement = $(separator)
      } else {
        dropdownItemElement = $(buildDropdownItemElement(button))

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
