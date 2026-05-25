import { describe, expect, it } from 'vitest'
import {
  applyMaskedPattern,
  calculateNewCursorPosition,
  extractRawValue,
  getSeparatorsFromTemplate,
  isValidInputCharacter,
} from '../../../src/editors/shared/maskedPattern'

describe('applyMaskedPattern', () => {
  it('inserts separators into numeric template', () => {
    expect(applyMaskedPattern('12345678', '0000-0000')).toBe('1234-5678')
  })

  it('inserts separators into alphanumeric template', () => {
    expect(applyMaskedPattern('AB1234', 'XX-0000')).toBe('AB-1234')
  })

  it('returns the partial raw value when shorter than the template', () => {
    expect(applyMaskedPattern('12', '0000-0000')).toBe('12')
    expect(applyMaskedPattern('1234', '0000-0000')).toBe('1234')
    expect(applyMaskedPattern('12345', '0000-0000')).toBe('1234-5')
  })

  it('returns the empty string for empty input', () => {
    expect(applyMaskedPattern('', '0000-0000')).toBe('')
  })

  it('returns the input unchanged when pattern is empty', () => {
    expect(applyMaskedPattern('12345678', '')).toBe('12345678')
  })
})

describe('extractRawValue', () => {
  it('strips separators from a numeric formatted value', () => {
    expect(extractRawValue('1234-5678', '0000-0000')).toBe('12345678')
  })

  it('strips separators from an alphanumeric formatted value', () => {
    expect(extractRawValue('AB-1234', 'XX-0000')).toBe('AB1234')
  })

  it('returns partial raw value for partial formatted input', () => {
    expect(extractRawValue('1234-5', '0000-0000')).toBe('12345')
    expect(extractRawValue('1234-', '0000-0000')).toBe('1234')
  })

  it('returns the empty string for empty input', () => {
    expect(extractRawValue('', '0000-0000')).toBe('')
  })

  it('round-trips apply ∘ extract = identity for complete values', () => {
    expect(extractRawValue(applyMaskedPattern('12345678', '0000-0000'), '0000-0000')).toBe('12345678')
    expect(extractRawValue(applyMaskedPattern('AB1234', 'XX-0000'), 'XX-0000')).toBe('AB1234')
  })
})

describe('getSeparatorsFromTemplate', () => {
  it('extracts separators from a numeric template', () => {
    expect(getSeparatorsFromTemplate('0000-0000')).toEqual(['-'])
  })

  it('extracts multiple distinct separators', () => {
    expect(getSeparatorsFromTemplate('00/00-00 00')).toEqual(['/', '-', ' '])
  })

  it('deduplicates repeated separators', () => {
    expect(getSeparatorsFromTemplate('00-00-00')).toEqual(['-'])
  })

  it('returns empty array when no separators', () => {
    expect(getSeparatorsFromTemplate('0000')).toEqual([])
  })
})

describe('isValidInputCharacter', () => {
  it('accepts digits when the template starts with "0"', () => {
    expect(isValidInputCharacter('5', '0000')).toBe(true)
  })

  it('rejects letters when the template starts with "0"', () => {
    expect(isValidInputCharacter('A', '0000')).toBe(false)
  })

  it('accepts alphanumerics when the template starts with "X"', () => {
    expect(isValidInputCharacter('A', 'XXXX')).toBe(true)
    expect(isValidInputCharacter('5', 'XXXX')).toBe(true)
  })

  it('rejects symbols when the template starts with "X"', () => {
    expect(isValidInputCharacter('-', 'XXXX')).toBe(false)
    expect(isValidInputCharacter('@', 'XXXX')).toBe(false)
  })

  it('accepts any character when pattern is empty', () => {
    expect(isValidInputCharacter('@', '')).toBe(true)
  })
})

describe('calculateNewCursorPosition', () => {
  it('places cursor after typed character when no separator was inserted', () => {
    expect(calculateNewCursorPosition('12', 2, '0000-0000')).toBe(2)
  })

  it('skips past an inserted separator when typing into the slot before it', () => {
    expect(calculateNewCursorPosition('1234-', 4, '0000-0000')).toBe(5)
  })

  it('does not move cursor past the end of the new value', () => {
    expect(calculateNewCursorPosition('1234-56', 7, '0000-0000')).toBe(7)
  })

  it('handles cursor at start of value', () => {
    expect(calculateNewCursorPosition('1', 0, '0000-0000')).toBe(0)
  })
})
