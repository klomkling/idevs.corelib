import { isEmptyOrNull } from '@serenity-is/corelib'

/**
 * Date utility functions
 */

export function dateStringOptions(): Intl.DateTimeFormatOptions {
  return {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
}

export function toDateString(date: Date): string {
  return date.toLocaleString('en-GB', dateStringOptions())
}

export function toSqlDateString(date: Date): string {
  const offset = date.getTimezoneOffset()
  const adjustedDate = new Date(date.getTime() - offset * 60 * 1000)
  return adjustedDate.toISOString().split('T')[0]
}

export function toBeginMonth(date: string): string {
  if (isEmptyOrNull(date)) {
    return date
  }
  return `${date.substring(0, 8)}01`
}

export function toEndMonth(date: string): string {
  if (isEmptyOrNull(date)) {
    return date
  }

  const dateArr = date.split('-')
  const d = new Date(parseInt(dateArr[0]), parseInt(dateArr[1]), 0)
  return `${date.substring(0, 8)}${d.getDate()}`
}

export type DateProxyInputOptions = {
  name: string
  readOnly?: boolean
  width?: number
}

export function addDateProxyInput(options: DateProxyInputOptions): HTMLInputElement {
  const input: HTMLInputElement = document.querySelector(`input[name="${options.name}"]`)!
  const cloneInput: HTMLInputElement = input.cloneNode(true) as HTMLInputElement

  cloneInput.setAttribute('name', `${options.name}-2`)
  cloneInput.setAttribute('id', `${input.getAttribute('id')}-2`)
  cloneInput.setAttribute('readonly', 'readonly')

  // Remove Serenity-specific classes
  const classesToRemove = [
    'customValidate',
    's-DateEditor',
    's-Serenity-DateEditor',
    'dateQ',
    'hasDatepicker',
  ]
  classesToRemove.forEach(className => cloneInput.classList.remove(className))

  // Apply styles
  if (options.readOnly) {
    cloneInput.style.backgroundColor = 'rgba(var(--s-bright-rgb), 0.02)'
  } else {
    cloneInput.style.backgroundColor = 'white'
  }

  if (options.width) {
    cloneInput.style.width = `${options.width}px`
  }

  input.parentNode!.insertBefore(cloneInput, input.nextSibling)
  input.classList.add('d-none')

  return cloneInput
}

export function updateDateProxyValue(
  name: string,
  dateValue: string | Date | null,
  locale = 'en-GB'
): void {
  let target = document.querySelector(`#${name}-2`) as HTMLInputElement
  if (!target) {
    target = document.querySelector(`input[name="${name}-2"]`) as HTMLInputElement
  }

  if (dateValue == null || isEmptyOrNull(dateValue.toString())) {
    target.value = ''
  } else {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
    target.value = date.toLocaleString(locale, dateStringOptions())
  }
}
