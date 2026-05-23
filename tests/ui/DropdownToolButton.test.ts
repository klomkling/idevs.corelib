import { afterEach, describe, expect, it } from 'vitest'
import { buildSideButtonElement } from '../../src/ui/DropdownToolButton'

afterEach(() => {
  document.body.replaceChildren()
})

describe('buildSideButtonElement', () => {
  it('does not interpret HTML in button.title', () => {
    const el = buildSideButtonElement({
      key: 'k',
      title: '<img src=x onerror="window.__xss=true">',
      icon: 'fa fa-x',
      cssClass: '',
      disabled: false,
      onClick: () => undefined,
    })
    expect(el.getAttribute('title')).toContain('<img')
    expect(el.querySelector('img')).toBeNull()
  })

  it('does not produce inline event handlers from caller-supplied cssClass', () => {
    const el = buildSideButtonElement({
      key: 'k',
      title: '',
      icon: '',
      cssClass: 'foo" onerror="window.__xss=true',
      disabled: false,
      onClick: () => undefined,
    })
    expect(el.outerHTML).not.toContain('onerror=')
  })
})
