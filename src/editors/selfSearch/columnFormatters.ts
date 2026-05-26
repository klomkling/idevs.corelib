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
    const date = parseToLocalDate(value)
    if (date == null || Number.isNaN(date.getTime())) return String(value)
    return formatDate(date, pattern)
  } catch {
    return String(value)
  }
}

/**
 * Parse a value to a Date in LOCAL time semantics. Date objects pass
 * through; numbers go straight to `new Date(ms)`. Strings get an ISO
 * date-only special case: `YYYY-MM-DD` is parsed via the local-time
 * constructor `new Date(y, m-1, d)` so it doesn't shift ±1 day when
 * the formatter renders it in the host timezone (the default
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, which becomes the
 * previous day in any timezone west of UTC).
 *
 * Other string formats (full ISO datetime, RFC 2822, etc.) keep the
 * default `new Date(string)` parsing — those typically carry an
 * explicit offset and behave correctly.
 */
function parseToLocalDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnly) {
      const [, y, mo, d] = dateOnly
      return new Date(Number(y), Number(mo) - 1, Number(d))
    }
    return new Date(value)
  }
  return null
}

export function formatNumber(value: unknown, pattern: string): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)

  const decimalMatch = pattern.match(/\.(0+)/)
  const decimals = decimalMatch ? decimalMatch[1].length : 0

  // Use an explicit 'en-US' locale rather than `undefined` (host default).
  // The PowerACC source used the host locale, which produces different
  // thousands/decimal separators on consumer machines configured for
  // other locales (e.g., de-DE would emit '1.234,50' instead of
  // '1,234.50'). Stable output is more useful than locale-aware output
  // here — values are stored and forwarded as raw numbers; the formatter
  // only controls display in the results grid. Consumers needing a
  // localized variant should supply their own column formatter via
  // `columnFormatters` rather than the built-in 'number' formatter.
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
