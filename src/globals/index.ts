import type { ModalOptions, ModalEvent } from '../types/common'
import {
  toTimeString,
  toDecimalString,
  RoundingMethod,
  roundByMethod,
  stringToNumber,
  truncateString,
  dateToNumber,
} from '../utils/format'
import { toSqlDateString as utilsToSqlDateString } from '../utils/date'
import {
  isEmptyOrNull,
  DataGrid,
  ListRequest,
  ServiceResponse,
  ToolButton,
} from '@serenity-is/corelib'

/**
 * Global prototype extensions for built-in JavaScript types
 * These add methods to Number, String, and Date prototypes for backward compatibility
 * @deprecated Consider using the utility functions from utils/format and utils/date instead
 */

declare global {
  interface Number {
    toDecimal(precision?: number): string
    toTimeString(): string
  }

  interface String {
    truncate(maxLength?: number): string
    toNumber(): number
    toMethodRound(method?: RoundingMethod): number
  }

  interface Date {
    toSqlDate(): string
    toNumber(): number
  }

  type IModalOptions = ModalOptions
  type IEvent = ModalEvent
}

// Date prototype extensions
Date.prototype.toSqlDate = function (): string {
  return utilsToSqlDateString(this)
}

Date.prototype.toNumber = function (): number {
  return dateToNumber(this)
}

// Number prototype extensions
Number.prototype.toTimeString = function (): string {
  return toTimeString(this.valueOf())
}

Number.prototype.toDecimal = function (precision?: number): string {
  return toDecimalString(this.valueOf(), precision)
}

// String prototype extensions
String.prototype.truncate = function (maxLength = 0): string {
  return truncateString(this.valueOf(), maxLength)
}

String.prototype.toNumber = function (): number {
  return stringToNumber(this.valueOf())
}

String.prototype.toMethodRound = function (method = RoundingMethod.None): number {
  return roundByMethod(this.valueOf(), method)
}

export function ToTimeString(value: number): string {
  const hours = `0${Math.floor(value / 60)}`.slice(-2)
  const minutes = `0${value % 60}`.slice(-2)
  return `${hours}:${minutes}`
}

export function ToNumber(date: Date): number {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  return hours * 60 + minutes * 60 + seconds
}

export function GetElementWidth(element?: HTMLElement): number {
  if (element) {
    return element.clientWidth
  }

  return window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
}

export function GetElementHeight(element?: HTMLElement): number {
  if (element) {
    return element.clientHeight
  }

  return window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight
}

export function RemoveChildren(parent?: HTMLElement): void {
  if (!parent) {
    return
  }

  while (parent.firstChild) {
    parent.removeChild(parent.firstChild)
  }
}

export function IsOverflow(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

export function IsOverflowY(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight
}

export function IsOverflowX(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth
}

export function InnerDimensions(el: HTMLElement | null): [number, number] {
  if (!el) {
    return [0, 0]
  }

  const style = getComputedStyle(el)
  let width = el.clientWidth
  let height = el.clientHeight

  height -= parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  width -= parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)

  return [height, width]
}

export function neededTarget(el: HTMLElement, target: string): HTMLElement {
  if (target.slice(0, 1) == '.') {
    if (el.classList.contains(target.slice(1)) === false) {
      el = el.closest(target) as HTMLElement
    }
  } else {
    if (el.tagName.toLowerCase() !== target.toLowerCase()) {
      el = el.closest(target) as HTMLElement
    }
  }
  return el
}

export function dateStringOption(): Intl.DateTimeFormatOptions {
  return {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
}

export function toDateString(date: Date): string {
  return date.toLocaleString('en-GB', dateStringOption())
}

export const setCookie = (name: string, value: string, expires?: number): void => {
  let cookie = `${name}=${value}`
  if (expires) {
    const date = new Date()
    date.setTime(date.getTime() + expires * 24 * 60 * 60 * 1000)
    const exp = `expires=${date.toUTCString()}`
    cookie = `${cookie}; ${exp}`
  }
  document.cookie = `${cookie}; path=/`
}

export type dateProxyInputOption = {
  name: string
  readOnly?: boolean
  width?: number
}

export function addDateProxyInput(opt: dateProxyInputOption): HTMLInputElement {
  const input: HTMLInputElement = document.querySelector(`input[name="${opt.name}"]`)
  const cloneInput: HTMLInputElement = input.cloneNode(true) as HTMLInputElement
  cloneInput.setAttribute('name', `${opt.name}-2`)
  cloneInput.setAttribute('id', `${input.getAttribute('id')}-2`)
  cloneInput.setAttribute('readonly', 'readonly')
  cloneInput.classList.remove('customValidate')
  cloneInput.classList.remove('s-DateEditor')
  cloneInput.classList.remove('s-Serenity-DateEditor')
  cloneInput.classList.remove('dateQ')
  cloneInput.classList.remove('hasDatepicker')
  if (opt.readOnly) {
    cloneInput.style.backgroundColor = 'rgba(var(--s-bright-rgb), 0.02)'
  } else {
    cloneInput.style.backgroundColor = 'white'
  }
  if (opt.width) {
    cloneInput.style.width = `${opt.width}px`
  }

  input.parentNode.insertBefore(cloneInput, input.nextSibling)
  input.classList.add('d-none')

  return cloneInput
}

export function updateDateProxyValue(
  name: string,
  dateValue: string | Date | null,
  locale?: string
): void {
  let target = document.querySelector(`#${name}-2`) as HTMLInputElement
  if (!target) {
    target = document.querySelector(`input[name=${name}-2]`) as HTMLInputElement
  }
  if (isEmptyOrNull(dateValue?.toString())) {
    target.value = ''
  } else {
    if (!locale) {
      locale = 'en-GB'
    }
    target.value = (dateValue.constructor == Date ? dateValue : new Date(dateValue)).toLocaleString(
      locale,
      dateStringOption()
    )
  }
}

export function toSqlDateString(date: Date): string {
  const offset = date.getTimezoneOffset()
  date = new Date(date.getTime() - offset * 60 * 1000)
  return date.toISOString().split('T')[0]
}

// Re-export types from types/export for backward compatibility
export {
  PageSizes,
  PageOrientations,
  type PageSize,
  type PageMargin,
  type IdevsExportRequest,
  type IdevsExportOptions,
  type ExportOptions,
  type IdevsContentResponse,
  createExportToolButton
} from '../types/export'

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

export class globals {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public static load() {}
}
