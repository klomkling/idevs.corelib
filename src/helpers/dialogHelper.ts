import { StringEditor, ToolButton } from '@serenity-is/corelib'
import type { DialogSize } from '../types/common'

/**
 * Remove Select2 clear buttons from specified targets
 * Use this function within updateInterface()
 */
export function removeSelect2ClearButton(...targets: string[]): void {
  for (const target of targets) {
    $(`.${target} .select2-search-choice-close`).remove()
  }
}

export function EmailValidator(value: string): string | null {
   
  const filter =
    /^([\w-.]+)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.)|(([\w-]+\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\]?)$/
  return filter.test(value) ? null : 'Invalid email address'
}

export function NumberOnly(e: Event): boolean {
  const ev = e as KeyboardEvent
  if ('0123456789'.includes(ev.key)) {
    return true
  }

  e.preventDefault()
  return false
}

/**
 * Use GetDialogHelper function within function initToolbar()
 * @param helper
 * @constructor
 */
export function GetDialogHelper(helper: DialogHelper): DialogHelper {
  if (helper) {
    return helper
  }

  return new DialogHelper()
}

export class DialogHelper {
  /**
   * Use this function within function getToolbarButtons()
   * @param buttons
   */
  public getToolbarButtons(buttons: ToolButton[]): ToolButton[] {
    const applyButton = buttons.find(b => b.cssClass === 'apply-changes-button')
    if (applyButton) {
      applyButton.visible = false
    }

    return buttons
  }

  /**
   * Use this function within constructor
   * @param targets
   */
  public inputNumberOnly(...targets: StringEditor[]): void {
    for (let i = 0; i < targets.length; i++) {
      targets[i].element.on('keypress', NumberOnly)
    }
  }

  private NumberOnly(e: Event): boolean {
    const ev = e as KeyboardEvent
    if ('0123456789'.includes(ev.key)) {
      return true
    }

    e.preventDefault()
    return false
  }

  public enabledEditItem<T>(form: T, ...targets: string[]): void {
    const frm = form as { [key: string]: object }
    for (let i = 0; i < targets.length; i++) {
      if (frm[targets[i]].constructor.name === 'LookupEditor') {
        ;(frm[targets[i]] as HTMLInputElement).readOnly = false
      } else {
        $(`input[name="${targets[i]}"]`).prop('disabled', false).removeClass('readonly')
      }
    }
  }

  public disabledEditItem<T>(form: T, ...targets: string[]): void {
    const frm = form as { [key: string]: object }
    for (let i = 0; i < targets.length; i++) {
      if (!frm[targets[i]]) {
        continue
      }

      if (frm[targets[i]].constructor.name === 'LookupEditor') {
        ;(frm[targets[i]] as HTMLInputElement).readOnly = true
      } else {
        $(`input[name="${targets[i]}"]`).prop('disabled', true).addClass('readonly')
      }
    }
  }

  public disabledAndClearEditItem<T>(form: T, ...targets: string[]): void {
    const frm = form as { [key: string]: object }
    for (let i = 0; i < targets.length; i++) {
      const className = frm[targets[i]].constructor.name
      if (className === 'LookupEditor') {
        ;(frm[targets[i]] as HTMLInputElement).readOnly = true
      } else {
        $(`input[name="${targets[i]}"]`).val('')
        $(`input[name="${targets[i]}"]`).addClass('readonly').prop('disabled', true)
      }
    }
  }

  /**
   * Use this function within function onDialogOpen()
   * Put after super.onDialogOpen() line
   * @param dialog
   * @param options
   */
  public setDialogSize(dialog: object, options?: DialogSize) {
    let name = dialog.constructor.name
    name = `.s-${name}`
    const optionH = options?.height || 0
    const titleH = $(`${name} .ui-dialog-titlebar`).innerHeight() || 0
    const dialogH = $(`${name} .s-TemplatedDialog`).css('height', '').innerHeight() || 0
    const h = optionH > 0 ? optionH : titleH + dialogH + 2
    const w = options?.width ?? 420
    $(name)
      .css({ width: `${w}px`, height: `${h}px` })
      .position({
        of: window,
        my: 'center center',
        at: 'center center',
      })
  }
}
