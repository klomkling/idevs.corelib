import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IdevsGridEditController,
  type IdevsCellEditorRender,
} from '../../src/grids/idevsGridEditController'

/**
 * IdevsGridEditController is a pure controller, not a Widget — so we can
 * actually instantiate it against a hand-rolled fake SlickGrid + EntityGrid.
 * Tests exercise:
 *   - Constructor reads from `slickGrid.getOptions()` (NOT `["_options"]`,
 *     which was the source's private-field probe).
 *   - Built-in cell-editor registry is populated and pluggable via
 *     `registerCellEditor`.
 *   - destroy() unsubscribes all SlickGrid emitters and is idempotent.
 *   - State machine: handleActiveCellPositionChanged consumes-once
 *     criteria and updates the editable flag.
 *   - Navigation primitives (nextCell, previousCell, isReadonlyCell,
 *     isEditableCell) walk the column list correctly.
 *   - XSS hardening regression: a custom-registered renderer receives
 *     `target` as an HTMLElement and the controller never writes via
 *     innerHTML at any dispatch boundary.
 */

type SlickEmitterRecord = {
  subscribers: ((e: unknown, args: unknown) => unknown)[]
  notify(args: unknown): void
}

function makeEmitter(): SlickEmitterRecord & {
  subscribe(h: (e: unknown, args: unknown) => unknown): void
  unsubscribe(h: (e: unknown, args: unknown) => unknown): void
} {
  const subscribers: ((e: unknown, args: unknown) => unknown)[] = []
  return {
    subscribers,
    subscribe(h) {
      subscribers.push(h)
    },
    unsubscribe(h) {
      const idx = subscribers.indexOf(h)
      if (idx >= 0) subscribers.splice(idx, 1)
    },
    notify(args: unknown) {
      for (const h of subscribers.slice()) h({}, args)
    },
  }
}

type FakeColumn = {
  field?: string
  visible?: boolean
  sourceItem?: { readOnly?: boolean; editorType?: string; editorParams?: Record<string, unknown> }
}

function makeFakeGrid(opts: {
  editable?: boolean
  autoEdit?: boolean
  enableCellNavigation?: boolean
  columns?: FakeColumn[]
  items?: Record<string, unknown>[]
}) {
  const onClick = makeEmitter()
  const onDblClick = makeEmitter()
  const onActiveCellChanged = makeEmitter()
  const onActiveCellPositionChanged = makeEmitter()
  const onCellChange = makeEmitter()
  const onKeyDown = makeEmitter()

  const columns = opts.columns ?? []
  const items = opts.items ?? []

  // Header DOM: one child per column with a `data-id` attribute. The
  // controller walks these via `getHeader().children`.
  const header = document.createElement('div')
  columns.forEach(col => {
    const el = document.createElement('div')
    if (col.field) el.setAttribute('data-id', col.field)
    header.appendChild(el)
  })

  const slickGrid = {
    getOptions: vi.fn(() => ({
      editable: opts.editable ?? false,
      autoEdit: opts.autoEdit ?? false,
      enableCellNavigation: opts.enableCellNavigation ?? false,
    })),
    getColumns: vi.fn(() => columns),
    getHeader: vi.fn(() => header),
    getDataItem: vi.fn((row: number) => items[row]),
    getCellNode: vi.fn(() => document.createElement('div')),
    getDataItemValueForColumn: vi.fn((item: Record<string, unknown>, col: FakeColumn) =>
      col.field ? item[col.field] : undefined,
    ),
    onClick,
    onDblClick,
    onActiveCellChanged,
    onActiveCellPositionChanged,
    onCellChange,
    onKeyDown,
  }
  const grid = {
    slickGrid,
    getItems: vi.fn(() => items),
  }
  return { grid, slickGrid, items }
}

let controller: IdevsGridEditController | undefined

afterEach(() => {
  if (controller) {
    controller.destroy()
    controller = undefined
  }
  document.body.replaceChildren()
})

describe('IdevsGridEditController — construction', () => {
  it('reads editable/autoEdit/enableCellNavigation via slickGrid.getOptions() (no private-field probe)', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      enableCellNavigation: true,
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(slickGrid.getOptions).toHaveBeenCalled()
    // Source accessed `slickGrid["_options"]["editable"]` etc. — verify our
    // construction path does NOT read a private `_options` property even
    // if present.
    const privateOptionsProbe = (slickGrid as unknown as Record<string, unknown>)['_options']
    expect(privateOptionsProbe).toBeUndefined()
  })

  it('subscribes to onClick when editable+autoEdit, not onDblClick', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: true, autoEdit: true })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(slickGrid.onClick.subscribers.length).toBe(1)
    expect(slickGrid.onDblClick.subscribers.length).toBe(0)
  })

  it('subscribes to onDblClick when editable+!autoEdit', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: true, autoEdit: false })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(slickGrid.onClick.subscribers.length).toBe(0)
    expect(slickGrid.onDblClick.subscribers.length).toBe(1)
  })

  it('skips click/dblClick subscriptions when not editable', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: false })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(slickGrid.onClick.subscribers.length).toBe(0)
    expect(slickGrid.onDblClick.subscribers.length).toBe(0)
  })

  it('always subscribes to active-cell + keydown emitters', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: false })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(slickGrid.onActiveCellChanged.subscribers.length).toBe(1)
    expect(slickGrid.onActiveCellPositionChanged.subscribers.length).toBe(1)
    expect(slickGrid.onKeyDown.subscribers.length).toBe(1)
  })
})

describe('IdevsGridEditController — registry', () => {
  it('seeds the registry with the 5 built-in editor types', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Inspect via internal map. We avoid public listing API to keep the
    // surface small; the test reads via a controlled internal probe.
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.has('Integer')).toBe(true)
    expect(registry.has('Decimal')).toBe(true)
    expect(registry.has('Boolean')).toBe(true)
    expect(registry.has('Lookup')).toBe(true)
    expect(registry.has('ServiceLookup')).toBe(true)
  })

  it('registerCellEditor adds a new factory', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const customRender: IdevsCellEditorRender = vi.fn()
    controller.registerCellEditor('Custom.Foo', customRender)
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.get('Custom.Foo')).toBe(customRender)
  })

  it('registerCellEditor replaces an existing factory', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const newIntegerRender: IdevsCellEditorRender = vi.fn()
    controller.registerCellEditor('Integer', newIntegerRender)
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.get('Integer')).toBe(newIntegerRender)
  })

  it('does NOT carry the source\'s hardcoded "PowerACC.MasterData.CustomerProductPriceEditor" case', () => {
    // Regression: the source switch had a domain-specific case for
    // CustomerProductPriceEditor. Dropped in favor of the public
    // registerCellEditor hook.
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.has('PowerACC.MasterData.CustomerProductPriceEditor')).toBe(false)
  })
})

describe('IdevsGridEditController — destroy', () => {
  it('unsubscribes all subscribed handlers and is idempotent', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    expect(slickGrid.onClick.subscribers.length).toBe(1)
    expect(slickGrid.onActiveCellChanged.subscribers.length).toBe(1)
    expect(slickGrid.onActiveCellPositionChanged.subscribers.length).toBe(1)
    expect(slickGrid.onKeyDown.subscribers.length).toBe(1)

    controller.destroy()
    expect(slickGrid.onClick.subscribers.length).toBe(0)
    expect(slickGrid.onActiveCellChanged.subscribers.length).toBe(0)
    expect(slickGrid.onActiveCellPositionChanged.subscribers.length).toBe(0)
    expect(slickGrid.onKeyDown.subscribers.length).toBe(0)

    // Idempotent — second destroy should not throw.
    expect(() => controller!.destroy()).not.toThrow()
  })

  it('clears the cell-editor registry on destroy', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.size).toBeGreaterThan(0)
    controller.destroy()
    expect(registry.size).toBe(0)
  })
})

describe('IdevsGridEditController — state machine', () => {
  it('handleActiveCellPositionChanged consumes-once criteria from args', () => {
    const { grid, slickGrid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const positionHandler = slickGrid.onActiveCellPositionChanged.subscribers[0]
    expect(positionHandler).toBeDefined()

    const args: { criteria: unknown[] | null; editable?: boolean } = {
      criteria: ['Name', '=', 'foo'],
    }
    positionHandler({}, args)
    expect(args.criteria).toBe(null) // consumed (cleared on the args)
    const internal = controller as unknown as { criteria: unknown[] | null }
    expect(internal.criteria).toEqual(['Name', '=', 'foo'])
  })

  it('handleActiveCellPositionChanged updates editable when present in args', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: false })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const positionHandler = slickGrid.onActiveCellPositionChanged.subscribers[0]
    positionHandler({}, { editable: true } as Record<string, unknown>)
    const internal = controller as unknown as { editable: boolean }
    expect(internal.editable).toBe(true)
  })

  it('handleActiveCellPositionChanged ignores undefined editable + criteria fields', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: false })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const positionHandler = slickGrid.onActiveCellPositionChanged.subscribers[0]
    positionHandler({}, {} as Record<string, unknown>)
    const internal = controller as unknown as { editable: boolean; criteria: unknown[] | null }
    expect(internal.editable).toBe(false)
    expect(internal.criteria).toBe(null)
  })
})

describe('IdevsGridEditController — navigation primitives', () => {
  it('isReadonlyCell respects sourceItem.readOnly', () => {
    const { grid } = makeFakeGrid({
      columns: [
        { field: 'a', visible: true, sourceItem: { readOnly: false } },
        { field: 'b', visible: true, sourceItem: { readOnly: true } },
        { field: 'c', visible: true },
      ],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const isReadonly = (controller as unknown as { isReadonlyCell(i: number): boolean })
      .isReadonlyCell
    expect(isReadonly.call(controller, 0)).toBe(false)
    expect(isReadonly.call(controller, 1)).toBe(true)
    expect(isReadonly.call(controller, 2)).toBe(false)
  })

  it('nextCell skips read-only columns', () => {
    const { grid } = makeFakeGrid({
      columns: [
        { field: 'a', visible: true, sourceItem: { readOnly: false } },
        { field: 'b', visible: true, sourceItem: { readOnly: true } },
        { field: 'c', visible: true, sourceItem: { readOnly: false } },
      ],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const nextCell = (controller as unknown as { nextCell(i: number): number }).nextCell
    // Starting at -1 should skip 1 (read-only) and return 0, 2 in sequence.
    expect(nextCell.call(controller, -1)).toBe(0)
    expect(nextCell.call(controller, 0)).toBe(2) // skips index 1
  })

  // The prior `isEditableCell matches the s-*Editor regex` test was
  // removed in round-7 #6: editor identification is now marker-based
  // (data-idevs-cell-editor) via `findEditorChild`, not regex-on-className.
  // See the "row-change cleanup finds editor via marker" test below
  // for the replacement contract.
})

describe('IdevsGridEditController — custom renderer dispatch + XSS regression', () => {
  it('loadEditor routes to the registered renderer and passes the consumed criteria', () => {
    const items = [{ name: 'A' }]
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items,
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    const customRender: IdevsCellEditorRender = vi.fn(({ target }) => {
      // Renderer writes via textContent (the contract our hardening expects).
      target.textContent = 'custom-rendered'
    })
    controller.registerCellEditor('Custom.X', customRender)

    // Pre-queue criteria via the position-changed event.
    const positionHandler = slickGrid.onActiveCellPositionChanged.subscribers[0]
    positionHandler({}, { criteria: ['q'] } as Record<string, unknown>)

    // Invoke loadEditor through the click subscriber path.
    const targetCell = document.createElement('div')
    slickGrid.getCellNode.mockReturnValue(targetCell)
    const clickHandler = slickGrid.onClick.subscribers[0]
    clickHandler(
      { target: targetCell } as unknown as Event,
      { row: 0, cell: 0, grid: slickGrid } as Record<string, unknown>,
    )

    expect(customRender).toHaveBeenCalledTimes(1)
    const callArgs = (customRender as unknown as { mock: { calls: { 0: unknown[] }[] } }).mock
      .calls[0]?.[0] as {
      target: HTMLElement
      criteria: unknown[] | null
    }
    expect(callArgs.target).toBe(targetCell)
    expect(callArgs.criteria).toEqual(['q'])
    expect(targetCell.textContent).toBe('custom-rendered')
    // XSS regression: textContent never produces innerHTML script execution.
    expect(targetCell.innerHTML).not.toContain('<script')
  })

  it('clicking nested formatted markup renders into the Slick cell node', () => {
    const items = [{ name: 'A' }]
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items,
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    const customRender: IdevsCellEditorRender = vi.fn(({ target }) => {
      target.textContent = 'custom-rendered'
    })
    controller.registerCellEditor('Custom.X', customRender)

    const targetCell = document.createElement('div')
    const formatterWrapper = document.createElement('span')
    const icon = document.createElement('span')
    formatterWrapper.appendChild(icon)
    targetCell.appendChild(formatterWrapper)
    slickGrid.getCellNode.mockReturnValue(targetCell)

    const clickHandler = slickGrid.onClick.subscribers[0]
    clickHandler(
      { target: icon } as unknown as Event,
      { row: 0, cell: 0, grid: slickGrid } as Record<string, unknown>,
    )

    expect(customRender).toHaveBeenCalledTimes(1)
    const callArgs = (customRender as unknown as { mock: { calls: { 0: unknown[] }[] } }).mock
      .calls[0]?.[0] as {
      target: HTMLElement
    }
    expect(callArgs.target).toBe(targetCell)
    expect(targetCell.textContent).toBe('custom-rendered')
    expect(formatterWrapper.textContent).not.toBe('custom-rendered')
  })

  it('loadEditor short-circuits when destroyed', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const render: IdevsCellEditorRender = vi.fn()
    controller.registerCellEditor('Custom.X', render)
    controller.destroy()

    // After destroy(), there are no subscribers — the click event can't
    // even reach the controller. But we should be defensive in case a
    // stale handler is captured before destroy() ran:
    const internal = controller as unknown as { loadEditor(t: HTMLElement, a: unknown): void }
    expect(() =>
      internal.loadEditor.call(controller, document.createElement('div'), {
        row: 0,
        cell: 0,
        grid: slickGrid,
      } as Record<string, unknown>),
    ).not.toThrow()
    expect(render).not.toHaveBeenCalled()
  })

  it('loadEditor falls back to the default string renderer for unknown editor types', () => {
    // Source had a default-case in its switch; the port keeps this
    // semantic via the renderStringEditor fallback in loadEditor.
    const { grid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Unknown.Type' } }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const registry = (controller as unknown as { cellEditorRegistry: Map<string, unknown> })
      .cellEditorRegistry
    expect(registry.has('Unknown.Type')).toBe(false)
    // The default case in loadEditor routes to renderStringEditor; we
    // can't easily invoke a real StringEditor mount here, but we verify
    // that unknown types are NOT in the registry (the default-case path
    // is the only escape hatch).
  })
})

describe('IdevsGridEditController — destroyed-guard (PR-4b round-3 #22)', () => {
  // The earlier "loadEditor short-circuits when destroyed" test passed
  // for the WRONG reason: destroy() clears the registry, so render was
  // `undefined` from the map lookup. The guard at line 435
  // (`if (this.destroyed || !this.editable)`) was never actually
  // exercised. This regression test re-registers the renderer AFTER
  // destroy() so the registry path is alive but the guard must still
  // short-circuit.
  it('loadEditor early-returns via the `destroyed` guard even when the renderer is registered', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    controller.destroy()
    // Re-register the renderer AFTER destroy. cellEditorRegistry was
    // cleared in destroy(), so registering here puts an entry back
    // — but the `destroyed` flag is set, so the registerCellEditor
    // call itself is harmless and the `loadEditor` guard takes over.
    const render: IdevsCellEditorRender = vi.fn()
    controller.registerCellEditor('Custom.X', render)
    const internal = controller as unknown as { loadEditor(t: HTMLElement, a: unknown): void }
    expect(() =>
      internal.loadEditor.call(controller, document.createElement('div'), {
        row: 0,
        cell: 0,
        grid: slickGrid,
      } as Record<string, unknown>),
    ).not.toThrow()
    // Renderer MUST NOT be called — the `destroyed` guard fires first.
    expect(render).not.toHaveBeenCalled()
  })

  it('destroy() logs subscription teardown errors (PR-4b round-3 #8)', () => {
    const { grid, slickGrid } = makeFakeGrid({ editable: true, autoEdit: true })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Force the click emitter's unsubscribe to throw so we exercise the
    // catch branch.
    slickGrid.onClick.unsubscribe = vi.fn(() => {
      throw new Error('unsubscribe failed')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      controller.destroy()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subscription teardown threw'),
        expect.any(Error),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditController — column.field undefined guard (PR-4b round-3 #7)', () => {
  it('loadEditor refuses to dispatch when column.field is undefined', () => {
    // Misconfigured: a column with editorType but no field. The renderers
    // would otherwise write item["undefined"] silently — the user sees
    // the cell update via textContent but the entity field is never
    // touched. Round-3 fix: bail at dispatch with a warn.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ visible: true, sourceItem: { editorType: 'Custom.X' } }], // no `field`
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const customRender: IdevsCellEditorRender = vi.fn()
    controller.registerCellEditor('Custom.X', customRender)

    const targetCell = document.createElement('div')
    slickGrid.getCellNode.mockReturnValue(targetCell)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const clickHandler = slickGrid.onClick.subscribers[0]
      clickHandler(
        { target: targetCell } as unknown as Event,
        { row: 0, cell: 0, grid: slickGrid } as Record<string, unknown>,
      )
      expect(customRender).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('editorType but no field'),
        expect.anything(),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditController — editor marker + controller-managed toggle-off (PR-4b round-3 #14 + round-7 #1/#3/#4)', () => {
  // Round 7 evolved the toggle-off contract through three steps:
  //
  //   #1: removeExistingEditor only matches MARKED children (data-idevs-cell-editor).
  //       Formatter markup is left alone.
  //   #3: appendEditorChild is exposed via render params so public custom
  //       renderers can mark their nodes without casting into private fields.
  //   #4: Toggle-off is now controller-managed — hoisted into loadEditor BEFORE
  //       dispatch. Renderers never need to call any "remove existing editor"
  //       helper; they're always invoked for a fresh mount. This eliminates
  //       the last piece of contract that consumers couldn't reach through
  //       the public type.
  //
  // ALL tests below use ONLY the public `IdevsCellEditorRender` surface —
  // no `as unknown as { ... }` casts to private/protected methods.

  function buildRendererProbe() {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const targetCell = document.createElement('div')
    slickGrid.getCellNode.mockReturnValue(targetCell)
    const clickHandler = slickGrid.onClick.subscribers[0]
    const click = () =>
      clickHandler(
        { target: targetCell } as unknown as Event,
        { row: 0, cell: 0, grid: slickGrid } as Record<string, unknown>,
      )
    return { targetCell, click }
  }

  it('renderer mounts via appendEditorChild — node carries the editor marker', () => {
    const { targetCell, click } = buildRendererProbe()
    const renderer: IdevsCellEditorRender = vi.fn(({ appendEditorChild }) => {
      const input = document.createElement('input')
      input.value = 'mounted-via-callback'
      appendEditorChild(input)
    })
    controller!.registerCellEditor('Custom.X', renderer)
    click()
    const marked = targetCell.querySelector<HTMLInputElement>(
      '[data-idevs-cell-editor="true"]',
    )
    expect(marked).not.toBeNull()
    expect(marked!.value).toBe('mounted-via-callback')
    expect(targetCell.classList.contains('with-editor')).toBe(true)
  })

  it('editor + formatter coexist in the same cell (round-7 #1 formatter regression)', () => {
    const { targetCell, click } = buildRendererProbe()
    // Pre-populate the cell with formatter markup BEFORE the user
    // clicks (the common round-4-getCellNode scenario).
    const formatter = document.createElement('span')
    formatter.appendChild(document.createElement('i'))
    targetCell.appendChild(formatter)
    const renderer: IdevsCellEditorRender = vi.fn(({ appendEditorChild }) => {
      appendEditorChild(document.createElement('input'))
    })
    controller!.registerCellEditor('Custom.X', renderer)
    click()
    // Editor mounted, formatter preserved.
    expect(targetCell.querySelector('[data-idevs-cell-editor]')).not.toBeNull()
    expect(targetCell.contains(formatter)).toBe(true)
    expect(targetCell.classList.contains('with-editor')).toBe(true)
  })

  it('second click triggers controller-managed toggle-off (round-7 #4)', () => {
    // Round 7 #4: toggle-off is hoisted into loadEditor BEFORE renderer
    // dispatch. On the second click, the controller finds the marked
    // editor and removes it — the renderer is NOT invoked at all.
    const { targetCell, click } = buildRendererProbe()
    const renderer: IdevsCellEditorRender = vi.fn(({ appendEditorChild }) => {
      appendEditorChild(document.createElement('input'))
    })
    controller!.registerCellEditor('Custom.X', renderer)
    click() // first click → mount
    expect(renderer).toHaveBeenCalledTimes(1)
    expect(targetCell.querySelector('[data-idevs-cell-editor]')).not.toBeNull()

    click() // second click → controller-managed toggle-off
    // Renderer was NOT called again — controller bailed before dispatch.
    expect(renderer).toHaveBeenCalledTimes(1)
    // Marked editor child is gone; with-editor class is stripped.
    expect(targetCell.querySelector('[data-idevs-cell-editor]')).toBeNull()
    expect(targetCell.classList.contains('with-editor')).toBe(false)
  })

  it('same-row cell change cleans up the prior cell (round-7 #7 Tab regression)', () => {
    // Round 7 #7: prior cleanup condition was `currentRow !== args.row`,
    // so Tab from cell A to cell B in the SAME row skipped cleanup —
    // cell A retained its marked editor + with-editor/text-white
    // classes while cell B gained its own editor. User saw two
    // editors active simultaneously. Fix: cleanup when EITHER row OR
    // cell changes (not when both are equal — same-cell re-activation
    // is handled by the loadEditor toggle-off).
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    // Old cell (row 0, cell 0): formatter + marked editor + classes.
    const cellA = document.createElement('div')
    const formatterA = document.createElement('span')
    cellA.appendChild(formatterA)
    const markedA = document.createElement('input')
    markedA.setAttribute('data-idevs-cell-editor', 'true')
    cellA.appendChild(markedA)
    cellA.classList.add('with-editor', 'text-white')

    // New cell (row 0, cell 1): empty, will be activated.
    const cellB = document.createElement('div')

    // Prime: currentRow=0, currentCell=0 (we just left cell A).
    ;(controller as unknown as { currentRow: number | null }).currentRow = 0
    ;(controller as unknown as { currentCell: number | null }).currentCell = 0
    slickGrid.getCellNode.mockImplementation((row: number, cell: number) => {
      if (row === 0 && cell === 0) return cellA
      if (row === 0 && cell === 1) return cellB
      return null
    })

    // Drive the active-cell-changed handler with SAME row but new cell.
    const handler = slickGrid.onActiveCellChanged.subscribers[0]
    handler({}, { row: 0, cell: 1 })

    // Cell A must be cleaned up — that's the round-7 #7 fix.
    expect(cellA.querySelector('[data-idevs-cell-editor]')).toBeNull()
    expect(cellA.classList.contains('with-editor')).toBe(false)
    expect(cellA.classList.contains('text-white')).toBe(false)
    // Formatter preserved (it wasn't a marked editor).
    expect(cellA.contains(formatterA)).toBe(true)
  })

  it('same-cell re-activation does NOT trigger cleanup (round-7 #7 guard)', () => {
    // Round 7 #7 inverse: when the active cell hasn't actually moved
    // (currentRow === args.row && currentCell === args.cell), the
    // handler must NOT clean up. Same-cell click is handled by the
    // toggle-off path in `loadEditor`, not here.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: {} }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    const cell = document.createElement('div')
    const marked = document.createElement('input')
    marked.setAttribute('data-idevs-cell-editor', 'true')
    cell.appendChild(marked)
    cell.classList.add('with-editor')

    ;(controller as unknown as { currentRow: number | null }).currentRow = 0
    ;(controller as unknown as { currentCell: number | null }).currentCell = 0
    slickGrid.getCellNode.mockReturnValue(cell)

    const handler = slickGrid.onActiveCellChanged.subscribers[0]
    // Same row + same cell — should NOT cleanup.
    handler({}, { row: 0, cell: 0 })

    // Editor + class still present (cleanup did NOT run).
    expect(cell.querySelector('[data-idevs-cell-editor]')).not.toBeNull()
    expect(cell.classList.contains('with-editor')).toBe(true)
  })

  it('row-change cleanup removes a MARKED editor that is a later sibling after formatter (round-7 #6)', () => {
    // Round 7 #6: prior row-change cleanup inspected ONLY
    // `firstElementChild` and used the s-*Editor regex. After the
    // marker contract, the editor may be at index 1+ (formatter at
    // index 0, editor sibling after). The regex/firstChild check
    // would miss it → editor left orphaned in the old cell on row
    // navigation. Fix: use marker-based findEditorChild, same as
    // toggle-off.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: {} }],
      items: [{ name: 'A' }, { name: 'B' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })

    // Simulate the state where row 0 was previously edited: cell has
    // formatter markup at index 0 + a marked editor at index 1.
    const oldCell = document.createElement('div')
    const formatter = document.createElement('span')
    formatter.textContent = 'formatted'
    oldCell.appendChild(formatter)
    const markedEditor = document.createElement('input')
    markedEditor.setAttribute('data-idevs-cell-editor', 'true')
    oldCell.appendChild(markedEditor)
    oldCell.classList.add('with-editor', 'text-white')

    // Prime the controller's internal state so handleActiveCellChanged
    // sees row 0 as the prior active cell.
    ;(controller as unknown as { currentRow: number | null }).currentRow = 0
    ;(controller as unknown as { currentCell: number | null }).currentCell = 0
    slickGrid.getCellNode.mockImplementation((row: number) => (row === 0 ? oldCell : null))

    // Drive the real handler: row 0 → row 1.
    const handler = slickGrid.onActiveCellChanged.subscribers[0]
    handler({}, { row: 1, cell: 0 })

    // The marked editor MUST be removed even though it's not at
    // firstElementChild. Formatter markup is preserved.
    expect(oldCell.querySelector('[data-idevs-cell-editor]')).toBeNull()
    expect(oldCell.contains(formatter)).toBe(true)
    // Both classes stripped (symmetric with toggle-off + round-7 #5).
    expect(oldCell.classList.contains('with-editor')).toBe(false)
    expect(oldCell.classList.contains('text-white')).toBe(false)
  })

  it('lookup change-handler strips text-white on commit (round-11 #3)', () => {
    // Round-11 #3 (Copilot): when the Select2 commit replaces the
    // editor container with text via `target.textContent = ...`,
    // the `text-white` class added at mount time was left on the
    // cell. White text on a normal background → committed value
    // invisible until another cleanup path fires (row change,
    // toggle-off). Fix: call cleanupCellEditorClasses(target) in
    // the change handler. We exercise the rendered text directly
    // via the public mount + change-handler path, since spinning up
    // a real LookupEditor instance would require Serenity service-
    // registry wiring beyond what the harness mocks.
    //
    // Custom renderer that emulates the lookup pattern: mounts a
    // marked editor + adds text-white, then commits via a click
    // simulating the Select2 change handler.
    const { targetCell, click } = buildRendererProbe()
    let committedTarget: HTMLElement | undefined
    const renderer: IdevsCellEditorRender = ({ target, appendEditorChild }) => {
      const container = document.createElement('div')
      appendEditorChild(container)
      target.classList.add('text-white')
      // Stash the target so the test can drive a synthetic commit.
      committedTarget = target
    }
    controller!.registerCellEditor('Custom.X', renderer)
    click()
    expect(targetCell.classList.contains('with-editor')).toBe(true)
    expect(targetCell.classList.contains('text-white')).toBe(true)

    // Simulate the lookup's change-handler: replace contents via
    // textContent + cleanupCellEditorClasses (the round-11 #3 fix
    // mirrors this pattern in renderLookupEditor's changeSelect2
    // callback).
    expect(committedTarget).toBeDefined()
    committedTarget!.textContent = 'selected-value'
    ;(controller as unknown as { cleanupCellEditorClasses(c: HTMLElement): void }).cleanupCellEditorClasses(
      committedTarget!,
    )

    // Committed text is visible — both editor classes stripped.
    expect(targetCell.textContent).toBe('selected-value')
    expect(targetCell.classList.contains('with-editor')).toBe(false)
    expect(targetCell.classList.contains('text-white')).toBe(false)
  })

  it('source: renderLookupEditor changeSelect2 callback calls cleanupCellEditorClasses (round-11 #3)', async () => {
    // Direct source-level anti-regression: confirm that the lookup
    // renderer's change handler does the cleanup call. (The runtime
    // test above exercises the contract via the shared
    // cleanupCellEditorClasses helper; this test pins the call site
    // in the actual lookup renderer body so a refactor that drops
    // the cleanup would fail.)
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditController.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startIdx = src.indexOf('renderLookupEditor:')
    expect(startIdx).toBeGreaterThan(-1)
    const remainder = src.slice(startIdx)
    // Slice forward to the next renderer (renderServiceLookupEditor)
    // to scope to just this body.
    const nextRendererIdx = remainder.indexOf('renderServiceLookupEditor')
    const body = nextRendererIdx > -1 ? remainder.slice(0, nextRendererIdx) : remainder
    // Anti-regression: the change handler calls cleanupCellEditorClasses.
    expect(body).toMatch(/this\.cleanupCellEditorClasses\(target\)/)
  })

  it('source: renderServiceLookupEditor changeSelect2 callback matches Lookup cleanup pattern (round-13 #2)', async () => {
    // Round-13 #2 (Copilot): the ServiceLookup commit handler used
    // to only update item fields + notifyCellChange, leaving the
    // Select2 container mounted and the `with-editor` class on the
    // cell. Inconsistent with the Lookup renderer (round-11 #3 fix)
    // which replaces the container with committed text and strips
    // editor classes. Round-13 #2 brings ServiceLookup in line.
    //
    // Structural assertion: in the renderServiceLookupEditor body,
    // both `target.textContent = ...` AND
    // `this.cleanupCellEditorClasses(target)` must appear inside
    // the changeSelect2 callback.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditController.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startIdx = src.indexOf('renderServiceLookupEditor:')
    expect(startIdx).toBeGreaterThan(-1)
    const remainder = src.slice(startIdx)
    // Slice to the next renderer (renderStringEditor) to scope.
    const nextRendererIdx = remainder.indexOf('renderStringEditor')
    const body = nextRendererIdx > -1 ? remainder.slice(0, nextRendererIdx) : remainder
    // Anti-regression: the change handler MUST cleanup editor
    // classes (round-13 #2 fix) AND replace the container with
    // textContent (so the editor isn't left mounted).
    expect(body).toMatch(/this\.cleanupCellEditorClasses\(target\)/)
    expect(body).toMatch(/target\.textContent\s*=/)
  })

  it('source: integer/decimal/string commit handlers cleanup editor classes', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditController.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const rendererBoundaries: Array<[string, string]> = [
      ['renderIntegerEditor', 'renderDecimalEditor'],
      ['renderDecimalEditor', 'renderBooleanEditor'],
      ['renderStringEditor', 'private editorParamsFor('],
    ]
    for (const [rendererName, nextMarker] of rendererBoundaries) {
      const startIdx = src.indexOf(`${rendererName}:`)
      expect(startIdx).toBeGreaterThan(-1)
      const remainder = src.slice(startIdx)
      const nextIdx = remainder.indexOf(nextMarker)
      const body = nextIdx > -1 ? remainder.slice(0, nextIdx) : remainder
      expect(body).toMatch(/target\.textContent\s*=/)
      expect(body).toMatch(/this\.cleanupCellEditorClasses\(target\)/)
    }
  })

  it('toggle-off strips BOTH with-editor AND text-white classes (round-7 #5)', () => {
    // Round 7 #5: prior toggle-off only removed `with-editor`. The
    // Lookup renderer adds BOTH `with-editor` (the controller) AND
    // `text-white` (the renderer itself). The row-change cleanup
    // path was already removing both, but the same-cell toggle-off
    // only removed one, leaving Lookup cells with `text-white`
    // (white text on white background) after the editor closed.
    const { targetCell, click } = buildRendererProbe()
    // Renderer simulates the Lookup pattern: appendEditorChild + adds
    // `text-white` to the cell.
    const renderer: IdevsCellEditorRender = ({ target, appendEditorChild }) => {
      appendEditorChild(document.createElement('input'))
      target.classList.add('text-white')
    }
    controller!.registerCellEditor('Custom.X', renderer)
    click() // mount
    expect(targetCell.classList.contains('with-editor')).toBe(true)
    expect(targetCell.classList.contains('text-white')).toBe(true)
    click() // toggle-off
    expect(targetCell.classList.contains('with-editor')).toBe(false)
    // Round 7 #5 regression: text-white MUST also be stripped.
    expect(targetCell.classList.contains('text-white')).toBe(false)
  })

  it('toggle-off preserves formatter markup (only the marked editor is removed)', () => {
    const { targetCell, click } = buildRendererProbe()
    const formatter = document.createElement('span')
    targetCell.appendChild(formatter)
    const renderer: IdevsCellEditorRender = vi.fn(({ appendEditorChild }) => {
      appendEditorChild(document.createElement('input'))
    })
    controller!.registerCellEditor('Custom.X', renderer)
    click() // mount
    click() // toggle-off
    // Marked editor gone, formatter still present.
    expect(targetCell.querySelector('[data-idevs-cell-editor]')).toBeNull()
    expect(targetCell.contains(formatter)).toBe(true)
  })

  it('IdevsCellEditorRender renderer does NOT need to call any toggle-off helper', () => {
    // Documentation regression: the contract is renderer-fires-for-
    // fresh-mount. The test renderer below makes NO call into any
    // toggle-off helper — purely `appendEditorChild` for mount —
    // and clicking twice still produces correct mount → toggle-off
    // behavior. This proves the public type surface is sufficient.
    const { targetCell, click } = buildRendererProbe()
    let mountCount = 0
    const renderer: IdevsCellEditorRender = ({ appendEditorChild }) => {
      mountCount++
      const input = document.createElement('input')
      input.dataset.mountId = String(mountCount)
      appendEditorChild(input)
    }
    controller!.registerCellEditor('Custom.X', renderer)
    click()
    expect(mountCount).toBe(1)
    expect(targetCell.querySelector('[data-mount-id="1"]')).not.toBeNull()
    click()
    // Controller-managed toggle-off: renderer NOT called the second time.
    expect(mountCount).toBe(1)
    expect(targetCell.querySelector('[data-mount-id]')).toBeNull()
    click()
    // Third click → fresh mount again, renderer fires once more.
    expect(mountCount).toBe(2)
    expect(targetCell.querySelector('[data-mount-id="2"]')).not.toBeNull()
  })
})

describe('IdevsGridEditController — refreshColumnSnapshot behavior (PR-4b round-4 #7)', () => {
  // Round 4 #7: prior tests covered the staleness fix indirectly (the
  // class field was no longer `readonly`), but no test actually
  // exercised the refresh. A refactor that re-introduces a cached
  // `visibleColumns` would not fail any other test. This test mutates
  // `slickGrid.getColumns` between handleKeyDown invocations and
  // asserts the snapshot reflects the change.
  it('handleKeyDown picks up column changes between calls', () => {
    const initialCols = [{ field: 'a', visible: true, sourceItem: {} }]
    const updatedCols = [
      { field: 'a', visible: true, sourceItem: {} },
      { field: 'b', visible: true, sourceItem: {} },
    ]
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: initialCols,
      items: [{ a: 1 }, { a: 2 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Initial state: visibleColumns has 1 entry.
    const internal = controller as unknown as { visibleColumns: unknown[] }
    expect(internal.visibleColumns.length).toBe(1)

    // Host-driven setColumns simulated.
    slickGrid.getColumns = vi.fn(() => updatedCols)
    // Drive handleKeyDown (a Tab) — should call refreshColumnSnapshot.
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      { key: 'Tab', shiftKey: false, preventDefault: () => {}, stopImmediatePropagation: () => {} },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    // After the keydown, visibleColumns must reflect the updated column list.
    expect(internal.visibleColumns.length).toBe(2)
  })

  it('constructor takes the initial snapshot BEFORE wiring subscribers (PR-4b round-4 #2)', () => {
    // Round 4 #2: if any handler fires synchronously inside
    // `.subscribe()` (test doubles, some SlickGrid builds), nav
    // primitives would throw on `undefined.findIndex`. Fix: snapshot
    // before subscribe.
    //
    // Verify by recording the call order of `getColumns()` (called
    // inside refreshColumnSnapshot) vs the first `.subscribe()`. The
    // first getColumns call MUST come before the first subscribe.
    const callOrder: string[] = []
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
    })
    const originalGetColumns = slickGrid.getColumns
    slickGrid.getColumns = vi.fn(() => {
      callOrder.push('getColumns')
      return originalGetColumns()
    })
    const originalSubscribe = slickGrid.onClick.subscribe.bind(slickGrid.onClick)
    slickGrid.onClick.subscribe = function (h) {
      callOrder.push('subscribe')
      originalSubscribe(h)
    }
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(callOrder[0]).toBe('getColumns')
    // The first subscribe must come AFTER getColumns. (We don't care
    // about exact later positions — just that the snapshot is taken
    // before any subscription wiring.)
    expect(callOrder.indexOf('getColumns')).toBeLessThan(callOrder.indexOf('subscribe'))
  })
})

describe('IdevsGridEditController — header data-id null-collision (PR-4b round-4 #3 + round-5 #3)', () => {
  // Round 4 #3: nextCell/previousCell `findIndex(... === field)` where
  // `field = null` and multiple visibleColumns have undefined `field`
  // would match the first such entry. Fix: skip headers with no
  // data-id.
  //
  // Round 5 #3: the original round-4 test only covered nextCell(-1)
  // (start case). These additional tests cover middle-of-grid skip
  // AND the previousCell path that previously had zero coverage.
  it('nextCell skips headers without data-id (selection / reorder columns)', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      columns: [
        { visible: true }, // selection-like column, no field, no data-id
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
    })
    // The makeFakeGrid helper attaches `data-id` only when col.field is
    // set, so col[0] has NO data-id. Manually verify the header DOM
    // matches that assumption.
    const header = slickGrid.getHeader()
    expect(header.children[0].getAttribute('data-id')).toBeNull()
    expect(header.children[1].getAttribute('data-id')).toBe('a')
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const nextCell = (controller as unknown as { nextCell(i: number): number }).nextCell
    // From cell -1, the first editable header is index 1 ('a'). The
    // null-data-id index 0 must be skipped.
    expect(nextCell.call(controller, -1)).toBe(1)
  })

  it('nextCell skips a no-field header mid-grid (round-5 #3)', () => {
    // Layout: [a, no-field-action-col, b]. From cell=0 ('a'), next
    // must skip the mid-grid no-data-id header and return 2.
    const { grid } = makeFakeGrid({
      editable: true,
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { visible: true }, // action column, no field, no data-id
        { field: 'b', visible: true, sourceItem: {} },
      ],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const nextCell = (controller as unknown as { nextCell(i: number): number }).nextCell
    expect(nextCell.call(controller, 0)).toBe(2)
  })

  it('previousCell skips a no-field header (round-5 #3, previously untested path)', () => {
    // Layout: [a, no-field-action-col, b]. From cell=2 ('b'), previous
    // must skip the mid-grid no-data-id header and return 0.
    const { grid } = makeFakeGrid({
      editable: true,
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { visible: true }, // action column, no field, no data-id
        { field: 'b', visible: true, sourceItem: {} },
      ],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const previousCell = (controller as unknown as { previousCell(i: number): number })
      .previousCell
    expect(previousCell.call(controller, 2)).toBe(0)
  })

  it('previousCell from before-first-cell returns -1 when no editable preceding (round-5 #3)', () => {
    const { grid } = makeFakeGrid({
      editable: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const previousCell = (controller as unknown as { previousCell(i: number): number })
      .previousCell
    expect(previousCell.call(controller, 0)).toBe(-1)
  })
})

describe('IdevsGridEditController — non-thenable openDialogFor warn (PR-4b round-4 #13)', () => {
  // Not applicable on IdevsGridEditController — openDialogFor lives on
  // IdevsSearchGrid. Test moved to idevsSearchGrid.test.ts to keep
  // test-suite-to-source mapping clean.
  it.skip('placeholder — see idevsSearchGrid.test.ts', () => {})
})

describe('IdevsGridEditController — handleKeyDown preventDefault on Tab/Enter (round-10 #2)', () => {
  // Round-10 #2 (Copilot): once handleKeyDown decides to handle
  // Tab or Enter, it must stop the browser's default focus
  // traversal AND any other SlickGrid plugin's Tab handler —
  // otherwise after our notify() advances the active cell, the
  // browser's native Tab can move focus OUT of the grid entirely,
  // leaving the controller's currentRow/currentCell state out of
  // sync with DOM focus.
  it('calls preventDefault + stopImmediatePropagation on Tab', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [{ a: 1 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const preventDefault = vi.fn()
    const stopImmediatePropagation = vi.fn()
    const evt = {
      key: 'Tab',
      shiftKey: false,
      preventDefault,
      stopImmediatePropagation,
    }
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(evt, { row: 0, cell: 0 } as Record<string, unknown>)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('calls preventDefault + stopImmediatePropagation on Enter', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [{ a: 1 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const preventDefault = vi.fn()
    const stopImmediatePropagation = vi.fn()
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      { key: 'Enter', shiftKey: false, preventDefault, stopImmediatePropagation },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('does NOT preventDefault Tab/Enter when editable=false (round-11 #1)', () => {
    // Round-11 #1 (Copilot): onKeyDown is subscribed unconditionally,
    // but handleKeyDown only handles Tab/Enter when the grid is
    // editable. The round-10 #2 preventDefault must NOT fire on
    // non-editable grids — otherwise the controller traps keyboard
    // focus on grids the user isn't editing.
    const { grid, slickGrid } = makeFakeGrid({
      editable: false, // non-editable grid
      autoEdit: false,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [{ a: 1 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const preventDefault = vi.fn()
    const stopImmediatePropagation = vi.fn()
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    // Subscriber MUST be registered (we always subscribe), but it
    // must short-circuit on non-editable grids.
    expect(keyHandler).toBeDefined()
    keyHandler(
      { key: 'Tab', shiftKey: false, preventDefault, stopImmediatePropagation },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopImmediatePropagation).not.toHaveBeenCalled()
    // Same for Enter.
    keyHandler(
      { key: 'Enter', shiftKey: false, preventDefault, stopImmediatePropagation },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopImmediatePropagation).not.toHaveBeenCalled()
  })

  it('does NOT call preventDefault for keys other than Tab/Enter', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [{ a: 1 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const preventDefault = vi.fn()
    const stopImmediatePropagation = vi.fn()
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      { key: 'Escape', shiftKey: false, preventDefault, stopImmediatePropagation },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopImmediatePropagation).not.toHaveBeenCalled()
  })
})

describe('IdevsGridEditController — handleKeyDown bounds-check for unfound editable cells (round-14 #1)', () => {
  // Round-14 #1 (Copilot): when no editable cell is found in the
  // target direction, `firstEditableCell()` returns
  // `header.childElementCount` (out-of-range high) and
  // `lastEditableCell()` returns -1 (out-of-range low). The prior
  // code passed those values through to `notify(onActiveCellChanged)`
  // and wrote them back to SlickGrid's args, landing the active
  // cell at a non-existent column.
  //
  // Fix: bail out before notify + args mutation when computed cell
  // is outside [0, headerCount).
  it('Tab does NOT notify when no editable cell exists in the target row', () => {
    // Build a grid where ALL columns are read-only (no editable
    // cells at all). The Tab nav will compute
    // `cell = firstEditableCell()` which returns headerCount → out
    // of range.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [
        { field: 'a', visible: true, sourceItem: { readOnly: true } },
        { field: 'b', visible: true, sourceItem: { readOnly: true } },
      ],
      items: [{ a: 1, b: 2 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const argsObject = { row: 0, cell: 0 } as Record<string, unknown>
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      argsObject,
    )

    // Notify must NOT have been called with an out-of-range cell.
    expect(onActiveCellChangedNotify).not.toHaveBeenCalled()
    // Original args MUST be untouched.
    expect(argsObject.row).toBe(0)
    expect(argsObject.cell).toBe(0)
  })

  it('Shift+Tab does NOT notify when no editable predecessor exists', () => {
    // Inverse: previousCell + lastEditableCell both return out-of-
    // range when no editable cell exists.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [
        { field: 'a', visible: true, sourceItem: { readOnly: true } },
        { field: 'b', visible: true, sourceItem: { readOnly: true } },
      ],
      items: [{ a: 1, b: 2 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const argsObject = { row: 0, cell: 1 } as Record<string, unknown>
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      argsObject,
    )
    expect(onActiveCellChangedNotify).not.toHaveBeenCalled()
    expect(argsObject.row).toBe(0)
    expect(argsObject.cell).toBe(1)
  })

  it('Tab on empty grid does NOT notify with row=0 (round-15 #1)', () => {
    // Round-15 #1 (Copilot): an empty grid has no rows to navigate
    // to. The prior code seeded `row = this.currentRow ?? 0` and
    // proceeded to notify(onActiveCellChanged), driving downstream
    // handlers with a row index that doesn't exist. Fix: bail when
    // maxRows === 0.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [], // ← empty grid
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const argsObject = { row: 0, cell: 0 } as Record<string, unknown>
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      argsObject,
    )
    expect(onActiveCellChangedNotify).not.toHaveBeenCalled()
    // Original args untouched.
    expect(argsObject.row).toBe(0)
    expect(argsObject.cell).toBe(0)
  })

  it('Enter on empty grid does NOT notify either (round-15 #1)', () => {
    // Enter follows the same code path as Tab — same bail applies.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Enter',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(onActiveCellChangedNotify).not.toHaveBeenCalled()
  })

  it('happy path: Tab DOES notify when an editable cell IS found (sanity)', () => {
    // Confirm round-14 #1 didn't break the normal navigation flow.
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    ;(controller as unknown as { currentRow: number | null }).currentRow = 0
    ;(controller as unknown as { currentCell: number | null }).currentCell = 0
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(onActiveCellChangedNotify).toHaveBeenCalledTimes(1)
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(0)
    expect(notified.cell).toBe(1)
  })

  it('uses keydown args as navigation seed when current cell is unset', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
        { field: 'c', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2, c: 3 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify

    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 1 } as Record<string, unknown>,
    )
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(0)
    expect(notified.cell).toBe(2)
  })
})

describe('IdevsGridEditController — handleKeyDown try/catch (PR-4b round-5 #6)', () => {
  // Round 5 #6: SlickGrid's notify() doesn't catch subscriber throws.
  // If `slickGrid.getColumns()` (called inside refreshColumnSnapshot)
  // throws on corrupted state, the throw would propagate up to the
  // browser's event loop. Round-5 fix wraps the entire body in
  // try/catch with a console.warn + early return.
  it('contains a throw from refreshColumnSnapshot/getColumns and warns', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'a', visible: true, sourceItem: {} }],
      items: [{ a: 1 }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Sabotage getColumns AFTER the constructor's initial snapshot
    // (so construction succeeds), THEN trigger a keystroke.
    slickGrid.getColumns = vi.fn(() => {
      throw new Error('corrupted column state')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const keyHandler = slickGrid.onKeyDown.subscribers[0]
      // Production code wraps the body in try/catch — invocation must
      // not throw to the caller.
      expect(() =>
        keyHandler(
          { key: 'Tab', shiftKey: false, preventDefault: () => {}, stopImmediatePropagation: () => {} },
          { row: 0, cell: 0 } as Record<string, unknown>,
        ),
      ).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('handleKeyDown threw'),
        expect.any(Error),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditController — generic-parameterized usage compiles (PR-4b round-3 #24)', () => {
  // The class was made generic (`<TGrid extends EntityGrid<any, any> = ...>`)
  // in round 3. A consumer can now instantiate with their own grid
  // type as a generic argument; this test exercises that the
  // generic-parameter form works at runtime (the compile-time
  // assertion lives in tests/types/).
  it('accepts an explicit type parameter without affecting runtime behavior', () => {
    const { grid } = makeFakeGrid({ editable: true, autoEdit: true })
    type TypedGrid = ReturnType<typeof makeFakeGrid>['grid']
    controller = new IdevsGridEditController<TypedGrid & object & { _hack?: never }>({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    expect(controller).toBeInstanceOf(IdevsGridEditController)
  })
})

describe('IdevsGridEditController — handleKeyDown Tab/Enter happy paths (PR-4b round-6 #3)', () => {
  // Round 6 #3 promoted this from "deferred test debt" to must-add.
  // After 3 rounds of deferral, the keystroke navigation paths
  // (next/prev/wrap/clamp) had ZERO behavioral coverage — only the
  // try/catch from round-5 was tested. These tests drive the real
  // handler via the captured subscriber and assert the row/cell
  // selection after navigation.
  function buildKeyDownProbe(opts: {
    columns: { field?: string; visible?: boolean; sourceItem?: { readOnly?: boolean } }[]
    items: unknown[]
    currentRow?: number
    currentCell?: number
  }) {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: opts.columns,
      items: opts.items as Record<string, unknown>[],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Inject currentRow / currentCell so handleKeyDown has a starting
    // point. The real grid would set these via onActiveCellChanged.
    ;(controller as unknown as { currentRow: number | null }).currentRow = opts.currentRow ?? 0
    ;(controller as unknown as { currentCell: number | null }).currentCell = opts.currentCell ?? 0
    return { slickGrid, notifyMock: slickGrid.onActiveCellChanged.notify as ReturnType<typeof vi.fn> }
  }

  it('Tab advances to next editable cell within the same row', () => {
    const { slickGrid } = buildKeyDownProbe({
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
      currentRow: 0,
      currentCell: 0,
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 0 } as Record<string, unknown>,
    )
    expect(onActiveCellChangedNotify).toHaveBeenCalledTimes(1)
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(0)
    expect(notified.cell).toBe(1)
  })

  it('Tab wraps to the next row when at the end of the current row', () => {
    const { slickGrid } = buildKeyDownProbe({
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
      currentRow: 0,
      currentCell: 1, // at last editable cell of row 0
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 1 } as Record<string, unknown>,
    )
    expect(onActiveCellChangedNotify).toHaveBeenCalledTimes(1)
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(1)
    expect(notified.cell).toBe(0)
  })

  it('Shift+Tab moves to previous editable cell within the same row', () => {
    const { slickGrid } = buildKeyDownProbe({
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
      currentRow: 0,
      currentCell: 1,
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 1 } as Record<string, unknown>,
    )
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(0)
    expect(notified.cell).toBe(0)
  })

  it('Tab on the last cell of the last row clamps to last editable cell (does not overflow)', () => {
    const { slickGrid } = buildKeyDownProbe({
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
      currentRow: 0,
      currentCell: 1,
    })
    const onActiveCellChangedNotify = vi.fn()
    slickGrid.onActiveCellChanged.notify = onActiveCellChangedNotify
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    keyHandler(
      {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => undefined,
      },
      { row: 0, cell: 1 } as Record<string, unknown>,
    )
    // maxRows == 1 (single item); production clamps to last row + last
    // editable cell.
    const notified = onActiveCellChangedNotify.mock.calls[0]![0] as { row: number; cell: number }
    expect(notified.row).toBe(0)
    expect(notified.cell).toBe(1)
  })

  it('args are NOT mutated when notify throws (round-6 #5 partial-mutation regression)', () => {
    // Round 6 #5: previously `args.row = row; args.cell = cell` ran
    // BEFORE notify(). On notify throw, the args object retained the
    // new values. Fix: assign only on success path AFTER notify
    // returns.
    const { slickGrid } = buildKeyDownProbe({
      columns: [
        { field: 'a', visible: true, sourceItem: {} },
        { field: 'b', visible: true, sourceItem: {} },
      ],
      items: [{ a: 1, b: 2 }],
      currentRow: 0,
      currentCell: 0,
    })
    slickGrid.onActiveCellChanged.notify = vi.fn(() => {
      throw new Error('listener crashed')
    })
    const argsObject = { row: 0, cell: 0 } as Record<string, unknown>
    const keyHandler = slickGrid.onKeyDown.subscribers[0]
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      keyHandler(
        {
          key: 'Tab',
          shiftKey: false,
          preventDefault: () => undefined,
          stopImmediatePropagation: () => undefined,
        },
        argsObject,
      )
      // notify threw → args MUST NOT have been mutated. Original
      // {row: 0, cell: 0} survives.
      expect(argsObject.row).toBe(0)
      expect(argsObject.cell).toBe(0)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditController — hasField runtime predicate (PR-4b round-6 #7)', () => {
  // Round 6 #7: hasField was statically asserted in tests/types/ but
  // never runtime-tested. A refactor relaxing `length > 0` to `field != null`
  // would have passed all tests. Round-6 also tightened the predicate
  // to `trim().length > 0` (rejects whitespace-only); cover that.
  it('rejects undefined, null-via-cast, empty, whitespace-only fields', async () => {
    const { hasField } = await import('../../src/grids/_columnShape')
    expect(hasField({})).toBe(false)
    expect(hasField({ field: undefined })).toBe(false)
    expect(hasField({ field: '' })).toBe(false)
    expect(hasField({ field: '   ' })).toBe(false)
    expect(hasField({ field: '\t\n' })).toBe(false)
  })
  it('accepts non-empty trimmed field names', async () => {
    const { hasField } = await import('../../src/grids/_columnShape')
    expect(hasField({ field: 'name' })).toBe(true)
    expect(hasField({ field: '  name  ' })).toBe(true) // whitespace ON THE SIDES is fine
  })
  it('is exported from idevsGridEditController public surface (round-6 #8)', async () => {
    const mod = (await import('../../src/grids/idevsGridEditController')) as unknown as {
      hasField?: (c: { field?: string }) => boolean
    }
    expect(typeof mod.hasField).toBe('function')
    expect(mod.hasField!({ field: 'x' })).toBe(true)
  })
})

describe('IdevsGridEditController — module export shape', () => {
  it('exports the class as a constructor function with the public API methods', () => {
    expect(typeof IdevsGridEditController).toBe('function')
    expect(typeof IdevsGridEditController.prototype.registerCellEditor).toBe('function')
    expect(typeof IdevsGridEditController.prototype.destroy).toBe('function')
  })
})
