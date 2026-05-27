import { afterEach, describe, expect, it, vi } from 'vitest'
import { Widget } from '@serenity-is/corelib'
import { IdevsTabControl, type IdevsTab } from '../../src/panels/idevsTabControl'

const mountedTabs: IdevsTabControl[] = []

afterEach(() => {
  mountedTabs.splice(0).forEach(t => {
    try {
      t.destroy()
    } catch {
      /* ignore */
    }
  })
  document.body.replaceChildren()
})

function mountTabs(tabs: IdevsTab[]): { tabControl: IdevsTabControl; element: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const tabControl = new IdevsTabControl({ element: container, tabs })
  mountedTabs.push(tabControl)
  return { tabControl, element: container }
}

function makeStubTabFactory() {
  return vi.fn((c: { append(el: HTMLElement): unknown }) => {
    const widgetEl = document.createElement('div')
    widgetEl.classList.add('stub-widget')
    c.append(widgetEl)
    return { element: { style: () => undefined } } as unknown as Widget<unknown>
  })
}

describe('IdevsTabControl — construction + ARIA', () => {
  it('renders a role="tablist" with one role="tab" per configured tab', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', createWidget: makeStubTabFactory() },
    ])

    const tablist = element.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    const tabs = element.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].textContent).toBe('Alpha')
    expect(tabs[1].textContent).toBe('Beta')
  })

  it('marks the first tab active when none is explicitly set', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('honors an explicit active flag', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', active: true, createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('renders a role="tabpanel" per tab with aria-labelledby pointing at its tab id', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
    ])
    const tab = element.querySelector<HTMLElement>('[role="tab"]')!
    const panel = element.querySelector<HTMLElement>('[role="tabpanel"]')!
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
  })

  it('invokes each tab\'s createWidget factory', () => {
    const factoryA = makeStubTabFactory()
    const factoryB = makeStubTabFactory()
    mountTabs([
      { id: 'a', title: 'Alpha', createWidget: factoryA },
      { id: 'b', title: 'Beta', createWidget: factoryB },
    ])
    expect(factoryA).toHaveBeenCalledTimes(1)
    expect(factoryB).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsTabControl — keyboard nav (WAI-ARIA tabs pattern)', () => {
  it('initial tab has tabindex=0, others -1 (roving tabindex)', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', createWidget: makeStubTabFactory() },
      { id: 'c', title: 'Gamma', createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')
    expect(tabs[2].getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowRight on a focused tab clicks the next tab', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[0].focus()
    const clickSpy = vi.fn()
    tabs[1].addEventListener('click', clickSpy)
    const tablist = element.querySelector('[role="tablist"]')!
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('ArrowLeft wraps from first tab to last', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'Beta', createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[0].focus()
    const clickSpy = vi.fn()
    tabs[1].addEventListener('click', clickSpy)
    const tablist = element.querySelector('[role="tablist"]')!
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('Home + End move to first and last', () => {
    const { element } = mountTabs([
      { id: 'a', title: 'A', createWidget: makeStubTabFactory() },
      { id: 'b', title: 'B', createWidget: makeStubTabFactory() },
      { id: 'c', title: 'C', createWidget: makeStubTabFactory() },
    ])
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[1].focus()
    const clickFirst = vi.fn()
    const clickLast = vi.fn()
    tabs[0].addEventListener('click', clickFirst)
    tabs[2].addEventListener('click', clickLast)
    const tablist = element.querySelector('[role="tablist"]')!
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(clickFirst).toHaveBeenCalledTimes(1)
    tabs[1].focus()
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(clickLast).toHaveBeenCalledTimes(1)
  })
})

describe('IdevsTabControl — destroy (regression)', () => {
  it('destroy clears child widgets and is idempotent', () => {
    const innerWidget = {
      element: { style: () => undefined },
      destroy: vi.fn(),
    } as unknown as Widget<unknown>
    const factory = vi.fn(() => innerWidget)
    const { tabControl } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: factory },
    ])

    tabControl.destroy()
    expect((innerWidget as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled()
    // Idempotent — second destroy should not throw or re-invoke.
    expect(() => tabControl.destroy()).not.toThrow()
  })
})

describe('IdevsTabControl — getWidget', () => {
  it('returns the widget registered under the tab id', () => {
    const widget = { element: { style: () => undefined } } as unknown as Widget<unknown>
    const factory = vi.fn(() => widget)
    const { tabControl } = mountTabs([
      { id: 'foo', title: 'Foo', createWidget: factory },
    ])
    expect(tabControl.getWidget('foo')).toBe(widget)
  })

  it('returns undefined for an unknown tab id', () => {
    const { tabControl } = mountTabs([
      { id: 'a', title: 'Alpha', createWidget: makeStubTabFactory() },
    ])
    expect(tabControl.getWidget('missing')).toBeUndefined()
  })
})
