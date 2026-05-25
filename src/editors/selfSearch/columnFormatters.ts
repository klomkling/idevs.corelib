import { formatDate } from '@serenity-is/corelib'
import { applyMaskedPattern } from '../shared/maskedPattern'

/**
 * Pure helpers for parsing `resultColumns` specs and producing built-in cell
 * formatters. No DOM access, no editor coupling — fully unit-testable in
 * isolation.
 */

export type ResultColumn = {
  field: string
  title: string
  width?: string
  formatter?: (value: unknown, row: Record<string, unknown>) => string
}

export type CustomFormatterMap = Record<
  string,
  (value: unknown, row: Record<string, unknown>, pattern?: string) => string
>

export type DefaultColumnsContext = {
  idColumnName?: string
  textColumnName?: string
  maskedPattern?: string
}

/**
 * Parse the `resultColumns` option into an array of column definitions.
 * Accepts an explicit array (passed through), a string spec (parsed by
 * `parseColumnString`), or undefined/null (falls back to default columns).
 */
export function parseResultColumns(
  spec: ResultColumn[] | string | null | undefined,
  context: DefaultColumnsContext,
  customFormatters?: CustomFormatterMap,
): ResultColumn[] {
  // Use nullish (not falsy) check: an empty string is a valid string spec
  // that should be parsed (and will return []) — distinct from "no spec
  // provided" which falls back to defaults.
  if (spec == null) return getDefaultColumns(context)
  if (Array.isArray(spec)) return spec
  if (typeof spec === 'string') return parseColumnString(spec, customFormatters)
  return getDefaultColumns(context)
}

/**
 * Parse a comma-separated column spec string. Each column is
 * `field:title[:width[:formatter[:pattern]]]`. Falls back to built-in
 * formatters when the named formatter isn't in `customFormatters`.
 */
export function parseColumnString(
  columnString: string,
  customFormatters?: CustomFormatterMap,
): ResultColumn[] {
  const columns: ResultColumn[] = []
  const defs = columnString
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0)

  for (const def of defs) {
    const parts = def.split(':').map(p => p.trim())
    if (parts.length < 2) continue
    const [field, title, width, formatterName, formatterPattern] = parts
    if (!field || !title) continue

    const column: ResultColumn = { field, title }
    if (width) column.width = width

    if (formatterName) {
      const custom = customFormatters?.[formatterName]
      if (custom) {
        column.formatter = (value, row) => custom(value, row, formatterPattern)
      } else {
        const builtIn = getBuiltInFormatter(formatterName, formatterPattern)
        if (builtIn) column.formatter = builtIn
      }
    }

    columns.push(column)
  }

  return columns
}

/**
 * Resolve a built-in formatter by name. Returns null when the name isn't
 * recognized. The first character is lower-cased so callers can use either
 * `dateFormatter` or `DateFormatter`.
 */
export function getBuiltInFormatter(
  name: string,
  pattern?: string,
): ((value: unknown, row: Record<string, unknown>) => string) | null {
  if (!name) return null
  const normalized = name[0].toLowerCase() + name.slice(1)
  switch (normalized) {
    case 'customerCodeFormatter':
    case 'customerCode':
      return value => formatCustomerCode(value, pattern ?? '0000-00000-0')
    case 'dateFormatter':
    case 'date':
      return value => formatSerenityDate(value, pattern ?? 'dd/MM/yyyy')
    case 'numericFormatter':
    case 'numberFormatter':
    case 'number':
      return value => formatNumber(value, pattern ?? '0,0.00')
    default:
      return null
  }
}

export function getDefaultColumns(context: DefaultColumnsContext): ResultColumn[] {
  const idColumn = context.idColumnName ?? 'Id'
  const textColumn = context.textColumnName ?? 'Name'

  const columns: ResultColumn[] = [
    { field: idColumn, title: 'ID', width: '100px' },
    { field: textColumn, title: 'Name', width: '200px' },
  ]

  if (context.maskedPattern && idColumn) {
    const pattern = context.maskedPattern
    columns[0].formatter = value => applyMaskedPattern(String(value ?? ''), pattern)
  }

  return columns
}

export function formatCustomerCode(value: unknown, pattern: string): string {
  if (value === null || value === undefined || value === '') return ''
  if (!pattern) return String(value)
  return applyMaskedPattern(String(value), pattern)
}

export function formatSerenityDate(value: unknown, pattern: string): string {
  if (value === null || value === undefined || value === '') return ''
  try {
    const date = new Date(value as string | number | Date)
    if (Number.isNaN(date.getTime())) return String(value)
    return formatDate(date, pattern)
  } catch {
    return String(value)
  }
}

export function formatNumber(value: unknown, pattern: string): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)

  const decimalMatch = pattern.match(/\.(0+)/)
  const decimals = decimalMatch ? decimalMatch[1].length : 0

  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
