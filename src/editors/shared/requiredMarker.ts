/**
 * XSS-safe required-field marker for form labels. Inserts a `<sup>*</sup>` at
 * the start of the label using DOM APIs and `textContent` — never via raw HTML
 * writes. Mirrors the 1.1.0 DropdownToolButton XSS fix.
 *
 * The marker is tagged with `data-idevs-required-marker` so subsequent calls
 * can find and remove (or skip duplicating) it.
 */

const MARKER_ATTR = 'data-idevs-required-marker'

/**
 * Locate the form label associated with the given input. Looks at:
 *   1. The input's immediate parent (sibling label).
 *   2. The parent's parent (label is a cousin under a wrapper).
 * Returns null if no label is reachable.
 */
export function findLabelFor(input: HTMLElement): HTMLLabelElement | null {
  const directParent = input.parentElement
  if (!directParent) return null

  const sibling = directParent.querySelector('label')
  if (sibling) return sibling as HTMLLabelElement

  const grandparent = directParent.parentElement
  if (!grandparent) return null

  return grandparent.querySelector('label')
}

/**
 * Insert or remove the required marker on the given label. Idempotent.
 */
export function setRequiredMarker(label: HTMLLabelElement, isRequired: boolean): void {
  const existing = label.querySelector<HTMLElement>(`sup[${MARKER_ATTR}]`)

  if (isRequired) {
    if (existing) return // already present — idempotent
    const sup = document.createElement('sup')
    sup.setAttribute(MARKER_ATTR, '')
    sup.setAttribute('title', 'this field is required')
    sup.textContent = '*'
    label.insertBefore(sup, label.firstChild)
    return
  }

  existing?.remove()
}
