import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDropdownItemElement,
  buildSideButtonElement,
} from '../../src/ui/DropdownToolButton'

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

describe('buildDropdownItemElement', () => {
  it('renders dropdown header without parsing HTML in title', () => {
    const el = buildDropdownItemElement({
      key: 'h',
      isDropdownHeader: true,
      dropdownHeaderTitle: '<img src=x onerror=1>',
      cssClass: 'safe-class',
    })
    expect(el.classList.contains('dropdown-header')).toBe(true)
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('<img src=x onerror=1>')
  })

  it('renders dropdown item with text content (no HTML execution in title)', () => {
    const el = buildDropdownItemElement({
      key: 'k',
      title: '<svg onload=window.__xss=1>',
      icon: 'fa fa-x',
      cssClass: '',
    })
    expect(el.querySelector('svg')).toBeNull()
    expect(el.textContent).toContain('<svg onload=window.__xss=1>')
  })

  it('rejects invalid cssClass tokens (defense in depth)', () => {
    const el = buildDropdownItemElement({
      key: 'h',
      isDropdownHeader: true,
      dropdownHeaderTitle: 'Header',
      cssClass: 'foo" onerror="window.__xss=1',
    })
    expect(el.outerHTML).not.toContain('onerror=')
  })
})
