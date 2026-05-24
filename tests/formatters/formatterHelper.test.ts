import { describe, expect, it } from 'vitest'
import {
  customerCodeFormatter,
  isNumericInput,
  isNumericTemplate,
} from '../../src/formatters/formatterHelper'

describe('customerCodeFormatter', () => {
  it('applies a digit-only pattern with hyphen separators', () => {
    expect(customerCodeFormatter('1234567890', '0000-00000-0')).toBe('1234-56789-0')
  })

  it('pads with "0" when the value is shorter than the digit pattern', () => {
    expect(customerCodeFormatter('12', '000-0')).toBe('120-0')
  })

  it('pads with space when an "x" placeholder is unfilled', () => {
    expect(customerCodeFormatter('ab', 'xxxx')).toBe('ab  ')
  })

  it('returns the original value when an all-zeros pattern receives non-digit input', () => {
    expect(customerCodeFormatter('AB12', '0000')).toBe('AB12')
  })

  it('accepts mixed alphanumerics via "x" placeholders', () => {
    expect(customerCodeFormatter('AB12', 'xx-xx')).toBe('AB-12')
  })

  it('strips existing separators before applying the pattern', () => {
    expect(customerCodeFormatter('12-34-56', '00-00-00')).toBe('12-34-56')
  })

  // Inherited PowerACC behavior: the all-zeros early-return only triggers for
  // separator-less masks, so a separator-containing numeric mask still
  // reformats non-digit input rather than returning it untouched.
  it('does NOT short-circuit for non-digit input on a separator-containing numeric mask', () => {
    expect(customerCodeFormatter('AB12', '0000-00000-0')).toBe('AB12-00000-0')
  })
})

describe('isNumericTemplate', () => {
  it('is true for a digit-only pattern with separators', () => {
    expect(isNumericTemplate('0000-00000-0')).toBe(true)
  })

  it('is false when the pattern contains "x" placeholders', () => {
    expect(isNumericTemplate('xx-00')).toBe(false)
  })

  it('is false for a pure-zeros pattern (residue is empty, requires at least one separator/digit)', () => {
    expect(isNumericTemplate('00000')).toBe(false)
  })
})

describe('isNumericInput', () => {
  it('is true for plain digits', () => {
    expect(isNumericInput('1234567')).toBe(true)
  })

  it('ignores hyphens, dots, underscores, and whitespace', () => {
    expect(isNumericInput('123-45.6_7 8')).toBe(true)
  })

  it('is false when the value contains letters', () => {
    expect(isNumericInput('123A')).toBe(false)
  })

  it('is false for the empty string', () => {
    expect(isNumericInput('')).toBe(false)
  })
})
