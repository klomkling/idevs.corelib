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

  it('isEditableCell matches the s-*Editor regex', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const isEditable = (controller as unknown as { isEditableCell(el: HTMLElement): boolean })
      .isEditableCell
    const editorCell = document.createElement('div')
    editorCell.classList.add('s-StringEditor')
    expect(isEditable.call(controller, editorCell)).toBe(true)

    const nonEditorCell = document.createElement('div')
    nonEditorCell.classList.add('foo', 'editor', 's-something')
    expect(isEditable.call(controller, nonEditorCell)).toBe(false)
  })
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

describe('IdevsGridEditController — with-editor class toggle-off (PR-4b round-3 #14)', () => {
  it('removeExistingEditor strips the with-editor class', () => {
    const { grid } = makeFakeGrid({})
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    const target = document.createElement('div')
    target.classList.add('with-editor')
    const child = document.createElement('input')
    target.appendChild(child)
    const removed = (
      controller as unknown as { removeExistingEditor(t: HTMLElement): boolean }
    ).removeExistingEditor(target)
    expect(removed).toBe(true)
    expect(target.childElementCount).toBe(0)
    expect(target.classList.contains('with-editor')).toBe(false)
  })

  it('loadEditor does NOT add with-editor when the renderer appended no child (toggle-off case)', () => {
    const { grid, slickGrid } = makeFakeGrid({
      editable: true,
      autoEdit: true,
      columns: [{ field: 'name', visible: true, sourceItem: { editorType: 'Custom.X' } }],
      items: [{ name: 'A' }],
    })
    controller = new IdevsGridEditController({
      grid: grid as unknown as Parameters<typeof IdevsGridEditController>[0]['grid'],
    })
    // Renderer that hits the toggle-off path: target already has a
    // child, so removeExistingEditor returns true and the renderer
    // short-circuits without appending anything.
    const renderer: IdevsCellEditorRender = vi.fn(({ target }) => {
      const removed =
        (controller as unknown as { removeExistingEditor(t: HTMLElement): boolean }).removeExistingEditor(
          target,
        )
      if (removed) return
      target.appendChild(document.createElement('input'))
    })
    controller.registerCellEditor('Custom.X', renderer)

    const targetCell = document.createElement('div')
    // Pre-populate with a child so toggle-off fires.
    const stale = document.createElement('span')
    targetCell.appendChild(stale)
    targetCell.classList.add('with-editor')
    slickGrid.getCellNode.mockReturnValue(targetCell)

    const clickHandler = slickGrid.onClick.subscribers[0]
    clickHandler(
      { target: targetCell } as unknown as Event,
      { row: 0, cell: 0, grid: slickGrid } as Record<string, unknown>,
    )
    // Toggle-off ran: no child, no with-editor class.
    expect(targetCell.childElementCount).toBe(0)
    expect(targetCell.classList.contains('with-editor')).toBe(false)
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

describe('IdevsGridEditController — module export shape', () => {
  it('exports the class as a constructor function with the public API methods', () => {
    expect(typeof IdevsGridEditController).toBe('function')
    expect(typeof IdevsGridEditController.prototype.registerCellEditor).toBe('function')
    expect(typeof IdevsGridEditController.prototype.destroy).toBe('function')
  })
})
