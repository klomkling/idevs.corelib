import { afterEach, describe, expect, it } from 'vitest'
import { addDateProxyInput, updateDateProxyValue } from '../src/globals'

afterEach(() => {
  document.body.replaceChildren()
})

describe('addDateProxyInput', () => {
  it('throws when the source input is missing', () => {
    expect(() => addDateProxyInput({ name: 'missing' })).toThrow(/not found/)
  })
})

describe('updateDateProxyValue', () => {
  it('is a no-op when no proxy input exists', () => {
    expect(() => updateDateProxyValue('missing', new Date())).not.toThrow()
  })
})
