/**
 * Formatting utility functions
 */

export function toTimeString(value: number): string {
  const hours = `0${Math.floor(value / 60)}`.slice(-2)
  const minutes = `0${value % 60}`.slice(-2)
  return `${hours}:${minutes}`
}

export function dateToNumber(date: Date): number {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  return hours * 60 + minutes + seconds / 60
}

export function toDecimalString(value: number, precision = 0): string {
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }

  const formatted = Intl.NumberFormat('en-US', options).format(value)
  const parsed = parseFloat(formatted.replace(/,/g, '')).toString()
  return Intl.NumberFormat('en-US', options).format(parseFloat(parsed))
}

export function truncateString(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength - 1) + '…' : str
}

export function stringToNumber(str: string): number {
  return str ? parseFloat(str.replace(/,/g, '')) : 0
}

export enum RoundingMethod {
  None = 0,
  Quarter25 = 1,
  Quarter50 = 2,
  FloorToWhole = 3,
  CeilQuarter25 = 4,
  CeilQuarter50 = 5,
  CeilToWhole = 6,
  RoundQuarter25 = 7,
  RoundQuarter50 = 8,
  RoundToWhole = 9,
}

export function roundByMethod(value: string | number, method: RoundingMethod): number {
  const input = typeof value === 'string' ? parseFloat(value) : value
  let result = Number.isNaN(input) ? 0 : input

  if (result === 0) return 0

  const rounded = parseFloat(result.toFixed(2))

  switch (method) {
    case RoundingMethod.Quarter25:
      result = rounded - (parseFloat(((rounded % 1) * 100).toFixed(2)) % 25) / 100
      break
    case RoundingMethod.Quarter50:
      result = rounded - (parseFloat(((rounded % 1) * 100).toFixed(2)) % 50) / 100
      break
    case RoundingMethod.FloorToWhole:
      result = Math.floor(rounded)
      break
    case RoundingMethod.CeilQuarter25:
      result =
        Math.floor(rounded) +
        (Math.floor((rounded % 1) * 100) + (25 - (Math.floor((rounded % 1) * 100) % 25))) / 100
      break
    case RoundingMethod.CeilQuarter50:
      result =
        Math.floor(rounded) +
        (Math.floor((rounded % 1) * 100) + (50 - (Math.floor((rounded % 1) * 100) % 50))) / 100
      break
    case RoundingMethod.CeilToWhole:
      result = Math.ceil(rounded)
      break
    case RoundingMethod.RoundQuarter25:
      result =
        Math.floor(rounded) +
        (parseFloat((parseFloat(((rounded % 1) * 100).toString()) / 25).toFixed(0)) * 25) / 100
      break
    case RoundingMethod.RoundQuarter50:
      result =
        Math.floor(rounded) +
        (parseFloat((parseFloat(((rounded % 1) * 100).toString()) / 50).toFixed(0)) * 50) / 100
      break
    case RoundingMethod.RoundToWhole:
      result = parseFloat(rounded.toFixed(0))
      break
    default:
      result = rounded
      break
  }

  return result
}
