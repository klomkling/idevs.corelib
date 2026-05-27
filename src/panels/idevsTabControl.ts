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
  /**
   * Delegated bootstrap shown.bs.tab handler — stored so destroy() can
   * pass the function reference to .off() and scope removal to THIS
   * component (not strip listeners attached by consumers).
   */
  private shownTabHandler?: () => void
  /** Tab buttons in tablist order for keyboard nav (ArrowLeft/Right/Home/End). */
  private tabButtons: HTMLButtonElement[] = []
  private tablistKeydownHandler?: (e: KeyboardEvent) => void
  private tablistElement?: HTMLUListElement

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
    this.tablistElement = nav[0] as HTMLUListElement

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

      // tabindex per WAI-ARIA tabs pattern: active tab gets 0, inactive
      // tabs get -1 — Tab key reaches the tablist once, then arrow keys
      // navigate within. Without this, every tab is independently
      // tab-reachable, which is not the recommended ARIA flow.
      const tabLink = Fluent('button')
        .class(tabLinkClasses)
        .attr('id', tabId)
        .attr('data-bs-toggle', 'tab')
        .attr('data-bs-target', `#${paneId}`)
        .attr('type', 'button')
        .attr('role', 'tab')
        .attr('aria-controls', paneId)
        .attr('aria-selected', isActive ? 'true' : 'false')
        .attr('tabindex', isActive ? '0' : '-1')
        .text(tabInfo.title)
      this.tabButtons.push(tabLink[0] as HTMLButtonElement)

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

    // Store the delegated handler reference so destroy() can pass it to
    // .off() — without the reference, .off() would strip every
    // shown.bs.tab listener on the nav, including ones consumers attached
    // after construction.
    this.shownTabHandler = () => {
      // Resize any SlickGrid contained inside a freshly-shown tab — without
      // this, the grid canvas measures incorrectly while the pane was hidden.
      // Timer handle stored so destroy() can cancel a pending resize.
      // Coalesce rapid tab switches: cancel any prior pending resize so we
      // only do one canvas pass per quiescent period.
      if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = undefined
        for (const id in this.widgets) {
          const widget = this.widgets[id] as { slickGrid?: { resizeCanvas?: () => void } }
          widget?.slickGrid?.resizeCanvas?.()
        }
      }, 10)

      // Sync tabindex + aria-selected after Bootstrap's class flip so the
      // WAI-ARIA roving-tabindex contract holds across user interactions.
      this.syncTabIndices()
    }
    nav.on('shown.bs.tab', 'button[data-bs-toggle="tab"]', this.shownTabHandler)

    // Keyboard nav for the tablist (WAI-ARIA tabs pattern):
    //   ArrowLeft / ArrowRight — move focus + activate prev/next tab
    //   Home / End             — move to first / last tab
    // Stored on instance for destroy-time removal.
    this.tablistKeydownHandler = (e: KeyboardEvent) => this.handleTablistKeydown(e)
    this.tablistElement!.addEventListener('keydown', this.tablistKeydownHandler)
  }

  /** Roving-tabindex sync: active tab is 0, others -1. */
  private syncTabIndices(): void {
    for (const btn of this.tabButtons) {
      const active = btn.classList.contains('active')
      btn.setAttribute('tabindex', active ? '0' : '-1')
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
    }
  }

  /** WAI-ARIA tablist keyboard pattern (Arrow keys + Home/End). */
  private handleTablistKeydown(event: KeyboardEvent): void {
    if (this.tabButtons.length === 0) return

    const currentIndex = this.tabButtons.findIndex(b => b === document.activeElement)
    let nextIndex = -1

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = currentIndex <= 0 ? this.tabButtons.length - 1 : currentIndex - 1
        break
      case 'ArrowRight':
        nextIndex = currentIndex === this.tabButtons.length - 1 ? 0 : currentIndex + 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = this.tabButtons.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const next = this.tabButtons[nextIndex]
    if (!next) return
    // Activate via Bootstrap's data-bs-toggle path (click triggers shown.bs.tab).
    next.focus()
    next.click()
  }

  override destroy(): void {
    if (this.resizeTimer !== undefined) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = undefined
    }
    // Detach the delegated shown.bs.tab handler — scoped to OUR handler
    // function so consumer-attached listeners are preserved.
    if (this.nav && this.shownTabHandler) {
      try {
        this.nav.off('shown.bs.tab', this.shownTabHandler as unknown as EventListener)
      } catch {
        /* nav already detached */
      }
      this.shownTabHandler = undefined
    }
    // Detach tablist keyboard handler.
    if (this.tablistElement && this.tablistKeydownHandler) {
      try {
        this.tablistElement.removeEventListener('keydown', this.tablistKeydownHandler)
      } catch {
        /* element already detached */
      }
      this.tablistKeydownHandler = undefined
    }
    this.tabButtons = []
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
