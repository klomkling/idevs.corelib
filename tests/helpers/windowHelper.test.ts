import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSmallDevice } from '../../src/helpers/windowHelper'

type MatchMediaFn = (query: string) => MediaQueryList

const stubMatchMedia = (matches: boolean): MatchMediaFn => {
  return ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList) satisfies MatchMediaFn
}

describe('isSmallDevice', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'matchMedia', originalDescriptor)
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia
    }
  })

  it('returns true when the small-device media query matches', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: stubMatchMedia(true),
      configurable: true,
    })
    expect(isSmallDevice()).toBe(true)
  })

  it('returns false when the small-device media query does not match', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: stubMatchMedia(false),
      configurable: true,
    })
    expect(isSmallDevice()).toBe(false)
  })

  it('queries against the 768px breakpoint', () => {
    const spy = vi.fn(stubMatchMedia(false))
    Object.defineProperty(window, 'matchMedia', { value: spy, configurable: true })
    isSmallDevice()
    expect(spy).toHaveBeenCalledWith('only screen and (max-width: 768px)')
  })
})
