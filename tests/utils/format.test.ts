// tests/utils/format.test.ts
import { describe, expect, it } from 'vitest'
import { truncateString, toTimeString, stringToNumber } from '../../src/utils/format'

describe('truncateString', () => {
  it('returns the string unchanged when shorter than maxLength', () => {
    expect(truncateString('hello', 10)).toBe('hello')
  })

  it('truncates and appends ellipsis when longer than maxLength', () => {
    expect(truncateString('hello world', 5)).toBe('hell…')
  })

  it('returns ellipsis-only when maxLength is 1', () => {
    expect(truncateString('hello', 1)).toBe('…')
  })
})

describe('toTimeString', () => {
  it('pads single-digit hours and minutes', () => {
    expect(toTimeString(65)).toBe('01:05')
  })

  it('formats zero as 00:00', () => {
    expect(toTimeString(0)).toBe('00:00')
  })
})

describe('stringToNumber', () => {
  it('strips thousands separators', () => {
    expect(stringToNumber('1,234.5')).toBe(1234.5)
  })

  it('returns 0 for empty input', () => {
    expect(stringToNumber('')).toBe(0)
  })
})
