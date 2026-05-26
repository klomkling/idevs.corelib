import { describe, expect, it } from 'vitest'
import {
  formatCustomerCode,
  formatNumber,
  formatSerenityDate,
  getBuiltInFormatter,
  getDefaultColumns,
  parseColumnString,
  parseResultColumns,
  type ResultColumn,
} from '../../../src/editors/selfSearch/columnFormatters'

describe('parseResultColumns', () => {
  it('returns the explicit array unchanged when an array is passed', () => {
    const cols: ResultColumn[] = [{ field: 'a', title: 'A' }]
    expect(parseResultColumns(cols, {})).toBe(cols)
  })

  it('parses a string spec via parseColumnString', () => {
    const result = parseResultColumns('id:ID:80px,name:Name', {})
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ field: 'id', title: 'ID', width: '80px' })
    expect(result[1]).toMatchObject({ field: 'name', title: 'Name' })
  })

  it('falls back to default columns when spec is undefined', () => {
    const result = parseResultColumns(undefined, { idColumnName: 'CustId', textColumnName: 'CustName' })
    expect(result).toHaveLength(2)
    expect(result[0].field).toBe('CustId')
    expect(result[1].field).toBe('CustName')
  })

  it('falls back to default columns when spec is null', () => {
    const result = parseResultColumns(null, {})
    expect(result).toHaveLength(2)
    expect(result[0].field).toBe('Id')
    expect(result[1].field).toBe('Name')
  })

  it('parses an empty string spec into [] (not falling back to defaults)', () => {
    // Regression: empty string is a valid string spec; the function must
    // distinguish it from null/undefined "no spec provided".
    const result = parseResultColumns('', {})
    expect(result).toEqual([])
  })
})

describe('parseColumnString', () => {
  it('parses basic field:title pairs', () => {
    expect(parseColumnString('id:ID,name:Name')).toEqual([
      { field: 'id', title: 'ID' },
      { field: 'name', title: 'Name' },
    ])
  })

  it('parses field:title:width', () => {
    const cols = parseColumnString('id:ID:80px')
    expect(cols[0]).toMatchObject({ field: 'id', title: 'ID', width: '80px' })
  })

  it('wires a built-in formatter when specified', () => {
    const cols = parseColumnString('date:Date:120px:date:yyyy-MM-dd')
    expect(cols[0].formatter).toBeDefined()
    expect(cols[0].formatter!(new Date(2026, 0, 15), {})).toBe('2026-01-15')
  })

  it('prefers customFormatters over built-ins when name matches', () => {
    const cols = parseColumnString('foo:Foo:80px:upper', {
      upper: (v: unknown) => String(v).toUpperCase(),
    })
    expect(cols[0].formatter!('hello', {})).toBe('HELLO')
  })

  it('skips malformed entries (missing title)', () => {
    expect(parseColumnString('id, name:Name')).toEqual([{ field: 'name', title: 'Name' }])
  })

  it('returns empty array for empty string', () => {
    expect(parseColumnString('')).toEqual([])
  })
})

describe('getBuiltInFormatter', () => {
  it('returns null for unknown formatter names', () => {
    expect(getBuiltInFormatter('nonsense')).toBeNull()
  })

  it('matches both camelCase and PascalCase formatter names', () => {
    expect(getBuiltInFormatter('date')).not.toBeNull()
    expect(getBuiltInFormatter('DateFormatter')).not.toBeNull()
    expect(getBuiltInFormatter('number')).not.toBeNull()
    expect(getBuiltInFormatter('numericFormatter')).not.toBeNull()
    expect(getBuiltInFormatter('customerCode')).not.toBeNull()
  })

  it('uses default pattern when no pattern provided', () => {
    const fn = getBuiltInFormatter('customerCode')!
    // Default pattern "0000-00000-0" → 9 digits + 1 → 10 raw chars
    expect(fn('1234567890', {})).toBe('1234-56789-0')
  })
})

describe('getDefaultColumns', () => {
  it('uses Id/Name defaults when idColumnName/textColumnName not provided', () => {
    const cols = getDefaultColumns({})
    expect(cols).toEqual([
      { field: 'Id', title: 'ID', width: '100px' },
      { field: 'Name', title: 'Name', width: '200px' },
    ])
  })

  it('applies maskedPattern to the ID column when configured', () => {
    const cols = getDefaultColumns({ idColumnName: 'Code', maskedPattern: '0000-0000' })
    expect(cols[0].formatter).toBeDefined()
    expect(cols[0].formatter!('12345678', {})).toBe('1234-5678')
  })
})

describe('formatCustomerCode', () => {
  it('formats with the supplied pattern', () => {
    expect(formatCustomerCode('1234567890', '0000-00000-0')).toBe('1234-56789-0')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(formatCustomerCode(null, '0000')).toBe('')
    expect(formatCustomerCode(undefined, '0000')).toBe('')
    expect(formatCustomerCode('', '0000')).toBe('')
  })
})

describe('formatSerenityDate', () => {
  it('formats a Date object with the supplied pattern', () => {
    expect(formatSerenityDate(new Date(2026, 4, 25), 'yyyy-MM-dd')).toBe('2026-05-25')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(formatSerenityDate(null, 'yyyy')).toBe('')
    expect(formatSerenityDate(undefined, 'yyyy')).toBe('')
    expect(formatSerenityDate('', 'yyyy')).toBe('')
  })

  it('returns the raw value for unparseable dates', () => {
    expect(formatSerenityDate('not a date', 'yyyy')).toBe('not a date')
  })

  it('parses YYYY-MM-DD strings as LOCAL dates (no UTC shift)', () => {
    // Regression: previously `new Date('2026-05-25')` parsed as UTC
    // midnight, which became 2026-05-24 in any timezone west of UTC,
    // and the formatted output would show the wrong day. With the fix,
    // YYYY-MM-DD strings construct via `new Date(y, m-1, d)` so the
    // formatted day matches the input regardless of host TZ.
    expect(formatSerenityDate('2026-05-25', 'yyyy-MM-dd')).toBe('2026-05-25')
    expect(formatSerenityDate('2026-01-01', 'yyyy-MM-dd')).toBe('2026-01-01')
    expect(formatSerenityDate('2026-12-31', 'yyyy-MM-dd')).toBe('2026-12-31')
  })
})

describe('formatNumber', () => {
  it('formats integers with 0 decimals when pattern has none', () => {
    expect(formatNumber(1234, '0,0')).toBe('1,234')
  })

  it('formats with the pattern decimals', () => {
    expect(formatNumber(1234.5, '0,0.00')).toBe('1,234.50')
    expect(formatNumber(1234.5678, '0,0.000')).toBe('1,234.568')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(formatNumber(null, '0,0')).toBe('')
    expect(formatNumber(undefined, '0,0')).toBe('')
    expect(formatNumber('', '0,0')).toBe('')
  })

  it('returns raw value (stringified) for non-numeric', () => {
    expect(formatNumber('not a number', '0,0')).toBe('not a number')
  })
})
