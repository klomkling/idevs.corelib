import { describe, expect, it, vi } from 'vitest'
import { addProcessQueryButtons } from '../../src/helpers/processQueryButtons'

describe('addProcessQueryButtons', () => {
  it('returns Query and Clear buttons in that order', () => {
    const buttons = addProcessQueryButtons({ onClick: vi.fn() })
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.title).toBe('Query')
    expect(buttons[1]?.title).toBe('Clear')
  })

  it('configures the Query button with the search icon and separator flag', () => {
    const [query] = addProcessQueryButtons({ onClick: vi.fn() })
    expect(query?.cssClass).toBe('process-query-button text-blue')
    expect(query?.icon).toBe('bi bi-search')
    expect(query?.separator).toBe(true)
  })

  it('configures the Clear button with the ban icon and no separator', () => {
    const [, clear] = addProcessQueryButtons({ onClick: vi.fn() })
    expect(clear?.cssClass).toBe('clear-query-button text-red')
    expect(clear?.icon).toBe('bi bi-ban')
    expect(clear?.separator).toBeUndefined()
  })

  it('invokes onClick with true when Query is clicked', () => {
    const onClick = vi.fn()
    const [query] = addProcessQueryButtons({ onClick })
    ;(query?.onClick as () => void)()
    expect(onClick).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('invokes onClick with false when Clear is clicked', () => {
    const onClick = vi.fn()
    const [, clear] = addProcessQueryButtons({ onClick })
    ;(clear?.onClick as () => void)()
    expect(onClick).toHaveBeenCalledExactlyOnceWith(false)
  })
})
