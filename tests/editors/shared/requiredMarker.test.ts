import { afterEach, describe, expect, it } from 'vitest'
import {
  findLabelFor,
  setRequiredMarker,
} from '../../../src/editors/shared/requiredMarker'

afterEach(() => {
  document.body.replaceChildren()
})

function setupForm() {
  const form = document.createElement('form')
  const label = document.createElement('label')
  label.textContent = 'Customer'
  const input = document.createElement('input')
  form.append(label, input)
  document.body.appendChild(form)
  return { form, label, input }
}

describe('findLabelFor', () => {
  it('finds a sibling label in the same parent', () => {
    const { label, input } = setupForm()
    expect(findLabelFor(input)).toBe(label)
  })

  it('walks up to the parent container for nested inputs', () => {
    const { form, label } = setupForm()
    const wrapper = document.createElement('div')
    const input = document.createElement('input')
    wrapper.appendChild(input)
    form.appendChild(wrapper)
    expect(findLabelFor(input)).toBe(label)
  })

  it('returns null when no label exists nearby', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(findLabelFor(input)).toBeNull()
  })
})

describe('setRequiredMarker', () => {
  it('inserts a <sup>*</sup> at the start of the label when isRequired=true', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    const sup = label.querySelector('sup[data-idevs-required-marker]')
    expect(sup).not.toBeNull()
    expect(sup?.textContent).toBe('*')
    expect(label.firstChild).toBe(sup)
  })

  it('is idempotent — re-calling does not duplicate the marker', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    setRequiredMarker(label, true)
    setRequiredMarker(label, true)
    expect(label.querySelectorAll('sup[data-idevs-required-marker]')).toHaveLength(1)
  })

  it('removes the marker when isRequired=false', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    expect(label.querySelector('sup[data-idevs-required-marker]')).not.toBeNull()
    setRequiredMarker(label, false)
    expect(label.querySelector('sup[data-idevs-required-marker]')).toBeNull()
  })

  it('uses textContent (not HTML-property writes) for the marker', () => {
    const { label } = setupForm()
    setRequiredMarker(label, true)
    const sup = label.querySelector('sup[data-idevs-required-marker]') as HTMLElement
    expect(sup.children.length).toBe(0)
    expect(sup.textContent).toBe('*')
  })
})
