import { afterEach, describe, expect, it } from 'vitest'
import {
  __buildDropdownBaseElement,
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

describe('__buildDropdownBaseElement', () => {
  it('renders the dropdown shell without interpreting HTML in title/icon', () => {
    const el = __buildDropdownBaseElement(
      {
        title: '<img src=x onerror=1>',
        icon: 'fa fa-x" onerror="window.__xss=1',
        cssClass: 'safe-class',
        dropdownMenuPosition: 'right',
      },
      false
    )
    // No actual <img> node is created — the title string is text content, not HTML.
    expect(el.querySelector('img')).toBeNull()
    // Title is rendered as text, so its raw bytes appear escaped inside the
    // <span class="button-inner"> (e.g. "&lt;img src=x onerror=1&gt;"). The
    // critical guarantee is that no element ever carries a real `onerror`
    // attribute from the caller's input.
    expect(el.querySelector('[onerror]')).toBeNull()
    // Icon classes are tokenised and reject anything containing quotes/spaces with quotes,
    // so the injected `onerror=...` token in the icon string is dropped from class names.
    const iconEl = el.querySelector('.button-inner > i')
    expect(iconEl?.getAttribute('onerror')).toBeNull()
    expect(iconEl?.className).not.toContain('onerror')
    // 'safe-class' should still appear after sanitization.
    expect(el.querySelector('.idevs-tool-dropdown-button')?.classList.contains('safe-class')).toBe(
      true
    )
    // 'dropdown-menu-right' is applied when position is 'right'.
    expect(el.querySelector('.dropdown-menu-right')).not.toBeNull()
  })

  it('omits the icon class when icon is empty (caret <i> still present)', () => {
    const el = __buildDropdownBaseElement({ title: 'Export', cssClass: '' }, false)
    const toggle = el.querySelector('.dropdown-toggle')
    const icons = toggle?.querySelectorAll('i') ?? []
    // First <i> is the empty icon span, second is the caret.
    expect(icons.length).toBe(2)
    expect(icons[1].className).toBe('caret')
    // The first <i> has no class because icon was empty.
    expect(icons[0].className).toBe('')
  })

  it('applies disabled classes to inner wrapper and toggle when isDisabled is true', () => {
    const el = __buildDropdownBaseElement({ title: 'X', cssClass: '' }, true)
    expect(el.querySelector('.idevs-tool-dropdown-button')?.classList.contains('disabled')).toBe(
      true
    )
    expect(el.querySelector('.dropdown-toggle')?.classList.contains('disabled')).toBe(true)
  })
})
