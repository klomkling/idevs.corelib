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
