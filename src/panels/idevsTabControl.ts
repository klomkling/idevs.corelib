import { Decorators, Fluent, Widget, type WidgetProps } from '@serenity-is/corelib'

/**
 * Tab control widget — Bootstrap-styled tabs with WAI-ARIA wiring.
 *
 * Each tab is configured with `id`, `title`, optional `cssClass`/`active`,
 * and a `createWidget` factory that materializes the tab's pane content.
 * Replaces PowerACC's `CsiTabControl`.
 */

export type IdevsTab = {
  /** Unique identifier for the tab. */
  id: string
  /** Display title of the tab. */
  title: string
  /** Optional CSS class for the tab pane. */
  cssClass?: string
  /** Indicates if the tab should start active. */
  active?: boolean
  /** Factory that builds the widget rendered inside the tab pane. */
  createWidget: (container: Fluent) => Widget<unknown>
}

export type IdevsTabControlOptions = {
  tabs: IdevsTab[]
}

@Decorators.registerClass('Idevs.CoreLib.IdevsTabControl')
export class IdevsTabControl<
  P extends IdevsTabControlOptions = IdevsTabControlOptions,
> extends Widget<P> {
  private widgets: Record<string, Widget<unknown>> = {}
  private nav?: Fluent
  private resizeTimer?: ReturnType<typeof setTimeout>

  static override createDefaultElement(): HTMLElement {
    return Fluent('div')
      .class([
        'idevs-tab-control',
        's-IdevsTabControl',
        'w-100',
        'd-flex',
        'flex-column',
        'pb-3',
        'position-relative',
      ])
      .getNode()
  }

  constructor(props: WidgetProps<P>) {
    super(props)

    const nav = Fluent('ul')
      .class(['nav', 'nav-tabs'])
      .style(css => {
        css.zIndex = '1'
      })
      .attr('id', `${this.uniqueName}-idevs-tabs`)
      .attr('role', 'tablist')
      .appendTo(this.element)
    this.nav = nav

    const tabContainer = Fluent('div')
      .class(['h-100', 'overflow-auto'])
      .style(css => {
        css.marginTop = '-1px'
      })
      .appendTo(this.element)

    const tabContent = Fluent('div')
      .class(['tab-content', 'h-100'])
      .attr('id', `${this.uniqueName}-idevs-tab-content`)
      .appendTo(tabContainer)

    const hasActiveTab = this.options.tabs.some(t => t.active)

    this.options.tabs.forEach((tabInfo, index) => {
      const isActive = tabInfo.active || (!hasActiveTab && index === 0)
      const tabId = `${this.uniqueName}-${tabInfo.id}-tab`
      const paneId = `${this.uniqueName}-${tabInfo.id}-tab-pane`

      const tabLinkClasses: string[] = ['nav-link']
      if (isActive) tabLinkClasses.push('active')

      const tabLink = Fluent('button')
        .class(tabLinkClasses)
        .attr('id', tabId)
        .attr('data-bs-toggle', 'tab')
        .attr('data-bs-target', `#${paneId}`)
        .attr('type', 'button')
        .attr('role', 'tab')
        .attr('aria-controls', paneId)
        .attr('aria-selected', isActive ? 'true' : 'false')
        .text(tabInfo.title)

      Fluent('li')
        .class('nav-item')
        .attr('role', 'presentation')
        .append(tabLink)
        .appendTo(nav)

      const paneClasses: string[] = ['tab-pane', 'fade', 'h-100']
      if (isActive) paneClasses.push('show', 'active')

      const tabPane = Fluent('div')
        .class(paneClasses)
        .attr('id', paneId)
        .attr('role', 'tabpanel')
        .attr('aria-labelledby', tabId)
        .attr('tabindex', '0')
        .appendTo(tabContent)

      if (tabInfo.cssClass) tabPane.addClass(tabInfo.cssClass)

      const widgetContainer = Fluent('div').addClass('h-100').appendTo(tabPane)
      this.widgets[tabInfo.id] = tabInfo.createWidget(widgetContainer)
      this.widgets[tabInfo.id].element.style(css => {
        css.borderTopLeftRadius = '0'
        css.borderTopRightRadius = '0'
      })
    })

    nav.on('shown.bs.tab', 'button[data-bs-toggle="tab"]', () => {
      // Resize any SlickGrid contained inside a freshly-shown tab — without
      // this, the grid canvas measures incorrectly while the pane was hidden.
      // Timer handle stored so destroy() can cancel a pending resize.
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = undefined
        for (const id in this.widgets) {
          const widget = this.widgets[id] as { slickGrid?: { resizeCanvas?: () => void } }
          widget?.slickGrid?.resizeCanvas?.()
        }
      }, 10)
    })
  }

  override destroy(): void {
    if (this.resizeTimer !== undefined) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = undefined
    }
    // Detach the delegated shown.bs.tab handler so it can't fire after
    // teardown (Bootstrap retains the binding otherwise).
    if (this.nav) {
      try {
        this.nav.off('shown.bs.tab')
      } catch {
        /* nav already detached */
      }
    }
    // Destroy owned tab widgets first — they may hold references back
    // through this controller.
    for (const id in this.widgets) {
      try {
        this.widgets[id].destroy()
      } catch {
        /* swallow teardown errors */
      }
    }
    this.widgets = {}
    super.destroy()
  }

  /** Get the widget instance associated with a given tab id. */
  public getWidget<T extends Widget<unknown>>(id: string): T | undefined {
    return this.widgets[id] as T | undefined
  }
}
