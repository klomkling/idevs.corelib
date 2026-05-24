const ALPHANUMERIC_STRIP = /[^0-9a-zA-Z]/g
const DIGITS_ONLY = /^\d+$/
const NUMERIC_TEMPLATE_RESIDUE = /^[0-9\s._-]+$/
const COMMON_SEPARATORS = /[\s._-]/g

/**
 * Apply a pattern mask to a value.
 * - '0' and 'x' placeholders both consume the next alphanumeric character from
 *   the value; they differ only in their padding char when the value is shorter
 *   ('0' pads with '0', 'x' pads with a space).
 * - All other pattern characters are literal separators copied through.
 *
 * Early-return guard: if the pattern is composed entirely of '0' characters
 * (no separators, e.g. "0000") and the value contains any non-digit, the
 * original value is returned untouched. Numeric masks that contain separators
 * (e.g. "0000-00000-0") do NOT trigger this guard — this is the inherited
 * behavior from the original PowerACC implementation.
 */
export function customerCodeFormatter(value: string, pattern: string): string {
  const cleanValue = value.replace(ALPHANUMERIC_STRIP, '')
  const isAllZerosPattern = pattern.replace(/[^0-9]/g, '') === '0'.repeat(pattern.length)
  const isNumericValue = DIGITS_ONLY.test(cleanValue)

  if (isAllZerosPattern && !isNumericValue) {
    return value
  }

  let result = ''
  let valueIndex = 0
  for (let i = 0; i < pattern.length; i++) {
    const patternChar = pattern.charAt(i)
    if (patternChar === '0' || patternChar === 'x') {
      if (valueIndex < cleanValue.length) {
        result += cleanValue.charAt(valueIndex++)
      } else {
        result += patternChar === '0' ? '0' : ' '
      }
    } else {
      result += patternChar
    }
  }
  return result
}

/** True when the pattern uses only digit placeholders and separators (no letter placeholders). */
export function isNumericTemplate(pattern: string): boolean {
  return NUMERIC_TEMPLATE_RESIDUE.test(pattern.replace(/0/g, ''))
}

/** True when the value consists of digits once common separators (- _ . space) are stripped. */
export function isNumericInput(value: string): boolean {
  return DIGITS_ONLY.test(value.replace(COMMON_SEPARATORS, ''))
}
