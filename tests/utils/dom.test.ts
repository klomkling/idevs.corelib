import { afterEach, describe, expect, it } from 'vitest'
import { getElementWidth, getElementHeight } from '../../src/utils/dom'

afterEach(() => {
  document.body.replaceChildren()
})

describe('getElementWidth', () => {
  it('returns the element clientWidth when an element is passed', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 250 })
    expect(getElementWidth(el)).toBe(250)
  })

  it('falls back to window.innerWidth when no element is passed', () => {
    expect(getElementWidth()).toBe(window.innerWidth)
  })
})

describe('getElementHeight', () => {
  it('returns the element clientHeight when an element is passed', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientHeight', { value: 400 })
    expect(getElementHeight(el)).toBe(400)
  })
})
