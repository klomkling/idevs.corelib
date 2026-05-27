import {
  Decorators,
  Fluent,
  Toolbar,
  type ToolButton,
  Widget,
  type WidgetProps,
} from '@serenity-is/corelib'

/**
 * Page-level container — title bar + toolbar + content pane in a vertical
 * flex layout. Replaces PowerACC's `CsiPage`.
 *
 * Hardening vs source:
 *   - Source used preact `render(<CsiTitle title={...}/>)` to render the
 *     title element. Dropped the preact dependency in favor of plain
 *     textContent — same visual outcome, no JSX runtime needed in corelib.
 */

export type IdevsPageOptions = Record<string, never>

@Decorators.registerClass('Idevs.CoreLib.IdevsPage')
export class IdevsPage<P extends IdevsPageOptions = IdevsPageOptions> extends Widget<P> {
  protected toolbar!: Toolbar
  protected panelContainer!: Fluent

  constructor(props: WidgetProps<P>) {
    super(props)
    this.render()
  }

  override render(): unknown {
    return super.render()
  }

  internalRenderContents(): void {
    this.element.addClass(['flex-fill', 'd-flex', 'flex-column'])

    const titleDiv = Fluent('div').class(['panel-titlebar']).appendTo(this.element)
    this.renderTitle(titleDiv.getNode())

    // Single toolbar surface: construct Toolbar bound to the visible
    // toolbarDiv so `this.toolbar.findButton()` / `updateInterface()` /
    // `destroy()` operate on the buttons users actually see. Previously
    // we built a detached Toolbar instance AND manually re-rendered the
    // buttons into a separate div — the Toolbar instance's internal
    // domNode was orphaned, so subclass code calling
    // `this.toolbar.findButton(...)` would search a hidden tree and
    // return nothing.
    const toolbarDiv = Fluent('div')
      .class(['s-Toolbar', 'clearfix'])
      .appendTo(this.element)
    // Cache getButtons() — without this, an override that returns a fresh
    // array (or has side effects) would render a different set than the
    // toolbar was constructed with.
    const buttons = this.getButtons()
    this.toolbar = new Toolbar({
      element: toolbarDiv.getNode(),
      buttons,
    })

    this.panelContainer = Fluent('div')
      .class(['panel-container', 'position-relative', 'flex-fill'])
      .appendTo(this.element)

    super.internalRenderContents()
  }

  protected override renderContents(): unknown {
    return super.renderContents()
  }

  protected getButtons(): ToolButton[] {
    return []
  }

  protected getTitle(): string {
    return 'Idevs Page'
  }

  /**
   * Render the title bar. Plain DOM (no preact dependency). Subclasses can
   * override for custom title markup.
   */
  protected renderTitle(element: HTMLElement): void {
    const titleSpan = document.createElement('div')
    titleSpan.classList.add('title-text')
    titleSpan.textContent = this.getTitle()
    element.appendChild(titleSpan)
  }
}
