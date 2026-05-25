/**
 * Masked pattern helpers shared between IdevsSearchButtonEditor and (in PR-3b)
 * IdevsSelfSearchButtonEditor. Template chars:
 *   `0` — accepts only digits (0-9)
 *   `X` — accepts alphanumerics (A-Z, a-z, 0-9)
 *   anything else — separator (kept verbatim in the formatted value)
 */

const TEMPLATE_CHARS = new Set(['0', 'X'])

export function applyMaskedPattern(rawValue: string, pattern: string): string {
  if (!pattern) return rawValue
  if (!rawValue) return ''

  let formatted = ''
  let rawIndex = 0

  for (let i = 0; i < pattern.length && rawIndex < rawValue.length; i++) {
    const templateChar = pattern[i]
    if (TEMPLATE_CHARS.has(templateChar)) {
      formatted += rawValue[rawIndex]
      rawIndex++
    } else {
      formatted += templateChar
    }
  }

  return formatted
}

export function extractRawValue(formattedValue: string, pattern: string): string {
  if (!pattern) return formattedValue
  if (!formattedValue) return ''

  let raw = ''
  for (let i = 0; i < formattedValue.length && i < pattern.length; i++) {
    if (TEMPLATE_CHARS.has(pattern[i])) {
      raw += formattedValue[i]
    }
  }
  return raw
}

export function getSeparatorsFromTemplate(pattern: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const ch of pattern) {
    if (!TEMPLATE_CHARS.has(ch) && !seen.has(ch)) {
      seen.add(ch)
      result.push(ch)
    }
  }
  return result
}

export function isValidInputCharacter(char: string, pattern: string): boolean {
  if (!pattern) return true
  const templateChar = pattern[0]
  if (templateChar === '0') return /^[0-9]$/.test(char)
  if (templateChar === 'X') return /^[A-Za-z0-9]$/.test(char)
  return true
}

/**
 * After reformatting an input under a masked pattern, compute the new cursor
 * position so the user's caret lands sensibly. The rule: if the position falls
 * on a separator slot in the pattern, advance past it; otherwise hold. Clamp
 * to [0, newValue.length].
 */
export function calculateNewCursorPosition(
  newValue: string,
  oldCursorPos: number,
  pattern: string,
): number {
  if (!pattern || oldCursorPos < 0) return Math.max(0, oldCursorPos)

  let pos = oldCursorPos
  while (pos < newValue.length && pos < pattern.length && !TEMPLATE_CHARS.has(pattern[pos])) {
    pos++
  }
  return Math.min(pos, newValue.length)
}
