import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `@serenity-is/extensions` is not on npm; mock the GridEditorBase
 * parent before importing the port. The mock is a no-op class with
 * stubs for the methods the port overrides via `super.X`. Per-test
 * stubbing of `view` / `slickGrid` / `toolbar` / `element` happens by
 * priming the probe instance directly.
 */
vi.mock('@serenity-is/extensions', () => {
  class FakeGridEditorBase {
    set_readOnly() {
      /* stubbed */
    }
    protected getSlickOptions() {
      return {}
    }
    protected getButtons(): unknown[] {
      return []
    }
    getIdProperty() {
      return 'id'
    }
    getColumns(): unknown[] {
      return []
    }
    destroy() {
      /* stubbed */
    }
  }
  return { GridEditorBase: FakeGridEditorBase }
})

type IdevsGridEditorBaseCtor = new (...args: never[]) => {
  // Type listed loosely — every accessed prototype member is asserted
  // structurally by the tests.
  [k: string]: unknown
} & { destroy(): void }

let IdevsGridEditorBase: IdevsGridEditorBaseCtor

beforeEach(async () => {
  const mod = (await import('../../src/grids/idevsGridEditorBase')) as unknown as {
    IdevsGridEditorBase: IdevsGridEditorBaseCtor
  }
  IdevsGridEditorBase = mod.IdevsGridEditorBase
})

afterEach(() => {
  document.body.replaceChildren()
})

type GridEditorProbe = {
  // Internals the tests prime directly. Names match the source's
  // private fields so the prototype methods read them naturally.
  _isFirstClicked: boolean
  _isExpanded: boolean
  _deletedRows: unknown[]
  _rowChangeSubscribers: ((...args: unknown[]) => void)[]
  _addButtonClickSubscribers: (() => void)[]
  _currentActiveRow: number | null
  _lastValidationFailed: boolean
  eventCleanup: (() => void)[]
  readOnly: boolean
  view: {
    getItems: () => unknown[]
    getItem: (row: number) => unknown
    getLength: () => number
    addItem: ReturnType<typeof vi.fn>
    deleteItem: ReturnType<typeof vi.fn>
  }
  toolbar: { findButton: ReturnType<typeof vi.fn> } | undefined
  element: { closest: ReturnType<typeof vi.fn> }
  domNode: HTMLElement
  slickGrid: {
    getActiveCell: ReturnType<typeof vi.fn>
    getDataItem: ReturnType<typeof vi.fn>
    getData: ReturnType<typeof vi.fn>
    invalidate: ReturnType<typeof vi.fn>
    invalidateAllRows: ReturnType<typeof vi.fn>
    updateRowCount: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    setActiveCell: ReturnType<typeof vi.fn>
    scrollRowIntoView: ReturnType<typeof vi.fn>
    editActiveCell: ReturnType<typeof vi.fn>
    getColumns: ReturnType<typeof vi.fn>
    getEditorLock: ReturnType<typeof vi.fn>
  }

  // Methods under test.
  getIsFirstClicked(): boolean
  setIsFirstClicked(v: boolean): void
  IsFirstClicked: boolean
  getDeletedRows(): readonly unknown[]
  DeletedRows: readonly unknown[]
  getOrderField(): string | null
  subscribeToRowChange(cb: (...args: unknown[]) => void): () => void
  subscribeToAddButtonClick(cb: () => void): () => void
  notifyAddButtonClick(): void
  notifyRowChange(...args: unknown[]): void
  validateRow(item: unknown, rowIndex: number): Record<string, string>[]
  validateRows(): Record<string, string>[]
  validate(item: unknown, row: number): boolean
  formatValidationMessage(errors: Record<string, string>[]): {
    text: string
    escapeHtml: boolean
  }
  getColumns(): unknown[]
  deleteCurrentRow(): void
  moveCurrentRowUp(): void
  moveCurrentRowDown(): void
  moveCurrentRow(delta: -1 | 1): void
  addButtonClick(): void
  isCellEditable(row: number, cell: number, columns: unknown[]): boolean
  setReadonlyElements(readOnly: boolean): void
  set_readOnly(v: boolean): void
  destroy(): void
  toggleGridExpansion(): void
  calculateAvailableHeight(): number | null
  initialNewRow(row: unknown): unknown
}

function makeProbe(opts: { columns?: unknown[]; items?: Record<string, unknown>[] } = {}): GridEditorProbe {
  const probe = Object.create(IdevsGridEditorBase.prototype) as GridEditorProbe
  probe._isFirstClicked = false
  probe._isExpanded = false
  probe._deletedRows = []
  probe._rowChangeSubscribers = []
  probe._addButtonClickSubscribers = []
  probe._currentActiveRow = null
  probe._lastValidationFailed = false
  probe.eventCleanup = []
  probe.readOnly = false

  const items = opts.items ?? []
  probe.view = {
    getItems: () => items,
    getItem: (row: number) => items[row],
    getLength: () => items.length,
    addItem: vi.fn(),
    deleteItem: vi.fn(),
  }
  probe.toolbar = { findButton: vi.fn(() => undefined) }
  probe.element = { closest: vi.fn(() => null) }
  probe.domNode = document.createElement('div')
  probe.slickGrid = {
    getActiveCell: vi.fn(() => null),
    getDataItem: vi.fn((row: number) => items[row]),
    getData: vi.fn(() => ({
      getItems: () => items,
      // The source's moveCurrentRow mutates `items` in place THEN calls
      // setItems(items) — same reference. A naive `items.length = 0;
      // items.push(...newItems)` empties both because newItems IS items.
      // Defensive copy if the caller passes the same reference.
      setItems: vi.fn((newItems: Record<string, unknown>[]) => {
        if (newItems === items) return
        items.length = 0
        items.push(...newItems)
      }),
    })),
    invalidate: vi.fn(),
    invalidateAllRows: vi.fn(),
    updateRowCount: vi.fn(),
    render: vi.fn(),
    setActiveCell: vi.fn(),
    scrollRowIntoView: vi.fn(),
    editActiveCell: vi.fn(),
    getColumns: vi.fn(() => opts.columns ?? []),
    getEditorLock: vi.fn(() => ({ isActive: () => false, commitCurrentEdit: vi.fn() })),
    // For tests that invoke setupGridEventHandlers, these emitters
    // need stub objects so addEventListener has something to subscribe
    // to. The wrapped addEventListener in those tests no-ops the
    // actual subscribe.
    onBeforeEditCell: { subscribe: vi.fn(), unsubscribe: vi.fn() },
    onActiveCellChanged: { subscribe: vi.fn(), unsubscribe: vi.fn() },
    onClick: { subscribe: vi.fn(), unsubscribe: vi.fn() },
    onDblClick: { subscribe: vi.fn(), unsubscribe: vi.fn() },
    onKeyDown: { subscribe: vi.fn(), unsubscribe: vi.fn() },
  }
  // The captured `_opts` is read by setupGridEventHandlers. We add a
  // simple default snapshot that resembles a basic editable+autoEdit
  // configuration for tests that need it. Tests can override
  // `probe['_opts']` directly if they need different settings.
  ;(probe as unknown as { _opts: { editable?: boolean; autoEdit?: boolean } })['_opts'] = {
    editable: true,
    autoEdit: true,
  }

  return probe
}

describe('IdevsGridEditorBase — IsFirstClicked / DeletedRows API', () => {
  it('camelCase getIsFirstClicked / setIsFirstClicked round-trip', () => {
    const probe = makeProbe()
    expect(probe.getIsFirstClicked()).toBe(false)
    probe.setIsFirstClicked(true)
    expect(probe.getIsFirstClicked()).toBe(true)
  })

  it('PascalCase IsFirstClicked shim routes to camelCase setter', () => {
    const probe = makeProbe()
    probe.IsFirstClicked = true
    expect(probe.getIsFirstClicked()).toBe(true)
    expect(probe.IsFirstClicked).toBe(true)
  })

  it('getDeletedRows returns the internal array as readonly', () => {
    const probe = makeProbe()
    probe._deletedRows = [{ id: 1 }, { id: 2 }]
    expect(probe.getDeletedRows()).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('DeletedRows shim returns the same value as getDeletedRows', () => {
    const probe = makeProbe()
    probe._deletedRows = [{ id: 3 }]
    expect(probe.DeletedRows).toEqual([{ id: 3 }])
  })
})

describe('IdevsGridEditorBase — subscriber registries', () => {
  it('subscribeToAddButtonClick returns a cleanup function that removes the subscriber', () => {
    const probe = makeProbe()
    const cb = vi.fn()
    const unsub = probe.subscribeToAddButtonClick(cb)
    expect(probe._addButtonClickSubscribers.length).toBe(1)
    unsub()
    expect(probe._addButtonClickSubscribers.length).toBe(0)
  })

  it('notifyAddButtonClick invokes subscribers + isolates throws', () => {
    const probe = makeProbe()
    const good = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    probe.subscribeToAddButtonClick(bad)
    probe.subscribeToAddButtonClick(good)
    // Silence the console.warn from the catch block.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    probe.notifyAddButtonClick()
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('subscribeToRowChange returns a cleanup function', () => {
    const probe = makeProbe()
    const cb = vi.fn()
    const unsub = probe.subscribeToRowChange(cb)
    expect(probe._rowChangeSubscribers.length).toBe(1)
    unsub()
    expect(probe._rowChangeSubscribers.length).toBe(0)
  })

  it('notifyRowChange isolates subscriber throws', () => {
    const probe = makeProbe()
    const bad = vi.fn(() => {
      throw new Error('row throw')
    })
    probe.subscribeToRowChange(bad)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => probe.notifyRowChange(0, 1, {}, {})).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('IdevsGridEditorBase — validation', () => {
  it('validateRow reports required-and-empty visible columns', () => {
    const probe = makeProbe()
    // Stub getColumns at the prototype level so validateRow can pick it up.
    const origGetColumns = (
      Object.getPrototypeOf(probe) as { getColumns?: () => unknown[] }
    ).getColumns
    Object.getPrototypeOf(probe).getColumns = () => [
      { field: 'name', name: 'Name', visible: true, sourceItem: { required: true } },
      { field: 'age', name: 'Age', visible: true, sourceItem: { required: false } },
    ]
    try {
      const errors = probe.validateRow({ name: '', age: 30 }, 0)
      expect(errors).toEqual([{ name: 'Name is required' }])
    } finally {
      Object.getPrototypeOf(probe).getColumns = origGetColumns
    }
  })

  it('validateRow skips hidden columns', () => {
    const probe = makeProbe()
    Object.getPrototypeOf(probe).getColumns = () => [
      { field: 'name', name: 'Name', visible: false, sourceItem: { required: true } },
    ]
    expect(probe.validateRow({ name: '' }, 0)).toEqual([])
  })

  it('formatValidationMessage produces XSS-safe defaults', () => {
    // Regression: source called notifyError with `escapeHtml: false`
    // and joined messages with literal `<br />`. With user-controlled
    // column names, that's an XSS sink. We now default to
    // `escapeHtml: true` + `\n` separator.
    const probe = makeProbe()
    const result = probe.formatValidationMessage([
      { name: '<img src=x onerror=alert(1)> is required' },
      { email: 'Email is required' },
    ])
    expect(result.escapeHtml).toBe(true)
    expect(result.text).toBe('<img src=x onerror=alert(1)> is required\nEmail is required')
    // Crucially the join is NOT '<br />'.
    expect(result.text).not.toContain('<br')
  })

  it('validateRows returns the first non-empty error list', () => {
    const probe = makeProbe()
    let callCount = 0
    Object.getPrototypeOf(probe).validateRow = function (_item: unknown, _row: number) {
      callCount++
      // Row 0 + 1 valid, row 2 invalid.
      return callCount < 3 ? [] : [{ field: 'bad' }]
    }
    probe._items = [1, 2, 3]
    probe.view.getItems = () => [1, 2, 3]
    const errors = probe.validateRows()
    expect(errors).toEqual([{ field: 'bad' }])
  })
})

describe('IdevsGridEditorBase — moveCurrentRow with overridable order field', () => {
  it('default getOrderField is "ItemNo" (PowerACC parity)', () => {
    const probe = makeProbe()
    expect(probe.getOrderField()).toBe('ItemNo')
  })

  it('moveCurrentRow swaps ItemNo between adjacent rows by default', () => {
    const items = [
      { id: 1, ItemNo: 10 },
      { id: 2, ItemNo: 20 },
    ]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 1, cell: 0 }))
    probe.moveCurrentRowUp()
    // After the swap, items[0] is the previous items[1] (id=2) but with
    // ItemNo=10. items[1] is the previous items[0] (id=1) with ItemNo=20.
    expect(items[0]).toEqual({ id: 2, ItemNo: 10 })
    expect(items[1]).toEqual({ id: 1, ItemNo: 20 })
  })

  it('moveCurrentRow with getOrderField()=null reorders the items array only (no field swap)', () => {
    // Regression: hardcoded "ItemNo" in source meant rows without an
    // ItemNo property silently kept the wrong order. Now overridable.
    const items = [
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ]
    const probe = makeProbe({ items })
    Object.getPrototypeOf(probe).getOrderField = () => null
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 1, cell: 0 }))
    probe.moveCurrentRowUp()
    // After the swap, rows are reordered but no field was touched.
    expect(items[0]).toEqual({ id: 2, label: 'B' })
    expect(items[1]).toEqual({ id: 1, label: 'A' })
  })

  it('moveCurrentRowUp on the first row is a no-op', () => {
    const items = [
      { id: 1, ItemNo: 10 },
      { id: 2, ItemNo: 20 },
    ]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.moveCurrentRowUp()
    expect(items[0]).toEqual({ id: 1, ItemNo: 10 })
    expect(items[1]).toEqual({ id: 2, ItemNo: 20 })
  })

  it('moveCurrentRowDown on the last row is a no-op', () => {
    const items = [
      { id: 1, ItemNo: 10 },
      { id: 2, ItemNo: 20 },
    ]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 1, cell: 0 }))
    probe.moveCurrentRowDown()
    expect(items[0]).toEqual({ id: 1, ItemNo: 10 })
    expect(items[1]).toEqual({ id: 2, ItemNo: 20 })
  })

  it('moveCurrentRow is a no-op when readOnly', () => {
    const items = [
      { id: 1, ItemNo: 10 },
      { id: 2, ItemNo: 20 },
    ]
    const probe = makeProbe({ items })
    probe.readOnly = true
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 1, cell: 0 }))
    probe.moveCurrentRowUp()
    expect(items[0]).toEqual({ id: 1, ItemNo: 10 })
  })
})

describe('IdevsGridEditorBase — deleteCurrentRow', () => {
  it('pushes onto _deletedRows and calls view.deleteItem by idProperty', () => {
    const items = [{ id: 5, name: 'A' }]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.deleteCurrentRow()
    expect(probe._deletedRows).toEqual([{ id: 5, name: 'A' }])
    expect(probe.view.deleteItem).toHaveBeenCalledWith(5)
  })

  it('deleteCurrentRow is a no-op when readOnly', () => {
    const items = [{ id: 5, name: 'A' }]
    const probe = makeProbe({ items })
    probe.readOnly = true
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.deleteCurrentRow()
    expect(probe._deletedRows).toEqual([])
  })
})

describe('IdevsGridEditorBase — set_readOnly toolbar mirror', () => {
  it('toggling readOnly disables / enables the delete + move buttons', () => {
    const probe = makeProbe()
    const addClass = vi.fn()
    const removeClass = vi.fn()
    probe.toolbar = {
      findButton: vi.fn(() => ({ addClass, removeClass })),
    }
    probe.setReadonlyElements(true)
    expect(addClass).toHaveBeenCalledWith('disabled')
    probe.setReadonlyElements(false)
    expect(removeClass).toHaveBeenCalledWith('disabled')
  })

  it('setReadonlyElements is defensive when toolbar is not initialized', () => {
    const probe = makeProbe()
    probe.toolbar = undefined
    expect(() => probe.setReadonlyElements(true)).not.toThrow()
  })
})

describe('IdevsGridEditorBase — isCellEditable', () => {
  it('returns false when the column has no editor', () => {
    const probe = makeProbe()
    expect(probe.isCellEditable(0, 0, [{}])).toBe(false)
  })
  it('returns false when the column is hidden', () => {
    const probe = makeProbe()
    expect(probe.isCellEditable(0, 0, [{ editor: () => undefined, visible: false }])).toBe(false)
  })
  it('returns false when the column is a slick-reorder cell', () => {
    const probe = makeProbe()
    expect(
      probe.isCellEditable(0, 0, [{ editor: () => undefined, cssClass: 'foo slick-reorder-cell' }]),
    ).toBe(false)
  })
  it('returns false when sourceItem.readOnly is true', () => {
    const probe = makeProbe()
    expect(
      probe.isCellEditable(0, 0, [{ editor: () => undefined, sourceItem: { readOnly: true } }]),
    ).toBe(false)
  })
  it('returns true when the column is editable + visible + not read-only', () => {
    const probe = makeProbe()
    expect(probe.isCellEditable(0, 0, [{ editor: () => undefined, visible: true }])).toBe(true)
  })
})

describe('IdevsGridEditorBase — destroy', () => {
  it('drains eventCleanup and clears subscriber arrays', () => {
    const probe = makeProbe()
    const cleanup = vi.fn()
    probe.eventCleanup.push(cleanup)
    probe.subscribeToRowChange(() => {})
    probe.subscribeToAddButtonClick(() => {})
    probe.destroy()
    expect(cleanup).toHaveBeenCalled()
    expect(probe.eventCleanup.length).toBe(0)
    expect(probe._rowChangeSubscribers.length).toBe(0)
    expect(probe._addButtonClickSubscribers.length).toBe(0)
  })

  it('survives a cleanup that throws (idempotent + logged)', () => {
    const probe = makeProbe()
    probe.eventCleanup.push(() => {
      throw new Error('bad cleanup')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => probe.destroy()).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('IdevsGridEditorBase — calculateAvailableHeight', () => {
  it('returns null when not inside a form (defensive: test harness path)', () => {
    // Regression: source dereferenced `form.getBoundingClientRect()`
    // without a null guard. Now returns null cleanly.
    const probe = makeProbe()
    probe.domNode = document.createElement('div')
    document.body.appendChild(probe.domNode)
    expect(probe.calculateAvailableHeight()).toBe(null)
  })
})

describe('IdevsGridEditorBase — toggleGridExpansion null-guard', () => {
  it('bails gracefully when there is no .category / .field ancestor', () => {
    const probe = makeProbe()
    probe.element = {
      closest: vi.fn(() => null),
    }
    expect(() => probe.toggleGridExpansion()).not.toThrow()
  })

  it('does NOT flip _isExpanded when the ancestor guard bails (round-8 #1 Copilot)', () => {
    // Round-8 #1: prior code flipped `_isExpanded` BEFORE the ancestor
    // guard. When the guard bailed, internal state was toggled with
    // no DOM update — the next successful call would then run the
    // restore branch even though the grid was never expanded. Fix:
    // only flip state once the action is actually committed.
    const probe = makeProbe()
    probe._isExpanded = false
    probe.element = { closest: vi.fn(() => null) }
    probe.toggleGridExpansion()
    expect(probe._isExpanded).toBe(false)

    // Same check with starting state `true` — the bail must not
    // toggle in either direction.
    probe._isExpanded = true
    probe.toggleGridExpansion()
    expect(probe._isExpanded).toBe(true)
  })
})

describe('IdevsGridEditorBase — destroy idempotency (round-8 #2 Copilot)', () => {
  // Round-8 #2: prior destroy() set _destroyed but didn't guard
  // against re-entry. A second call would re-execute the cleanup loop
  // AND call super.destroy() again — under Serenity's widget
  // hierarchy that can throw or double-cleanup DOM/plugin state. Fix
  // matches the sibling pattern in IdevsGridEditController.destroy().
  it('second destroy() call is a no-op', () => {
    const probe = makeProbe()
    const cleanup = vi.fn()
    probe.eventCleanup.push(cleanup)
    probe.destroy()
    expect(cleanup).toHaveBeenCalledTimes(1)
    // Second call must NOT re-invoke cleanups, must NOT throw.
    expect(() => probe.destroy()).not.toThrow()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('subscribers added between destroy calls do not fire on the second destroy', () => {
    // Defensive corollary: even if some subscriber-adding code path
    // races between the two destroy() calls (unlikely but possible
    // under async teardown), the second destroy must not be a
    // back-door for re-running cleanup.
    const probe = makeProbe()
    probe.destroy()
    // After first destroy, subscribeToRowChange returns a no-op per
    // round-6 #6 — but the test confirms the subscribers array stays
    // empty, and a second destroy() is a no-op.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      probe.subscribeToRowChange(() => {})
      expect(probe._rowChangeSubscribers.length).toBe(0)
      expect(() => probe.destroy()).not.toThrow()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditorBase — expandGrid identity comparison (review finding #3)', () => {
  // The source compared `field.className === currentField.className`,
  // which marked every `.field` sibling sharing the standard "field"
  // class as the current field, so `field-hidden` never got applied.
  // The port compares element identity (`field === currentField`).
  function buildCategoryFixture(): { category: HTMLElement; current: HTMLElement; other: HTMLElement } {
    const category = document.createElement('div')
    category.classList.add('category')
    document.body.appendChild(category)

    const current = document.createElement('div')
    current.className = 'field'
    current.setAttribute('data-itemname', 'CurrentField')
    category.appendChild(current)

    const other = document.createElement('div')
    other.className = 'field' // SAME className as `current`
    other.setAttribute('data-itemname', 'OtherField')
    category.appendChild(other)

    return { category, current, other }
  }

  it('expandGrid hides sibling fields that share the standard "field" class', () => {
    const probe = makeProbe()
    const { category, current, other } = buildCategoryFixture()
    // Stub `Element.getBoundingClientRect` so expandGrid's height read
    // doesn't NaN under jsdom (jsdom always returns 0 for bounding
    // rects, which is fine — we only care about the field-hidden
    // classList mutation).
    const protoCallProbe = probe as unknown as {
      expandGrid(container: HTMLElement, currentField: HTMLElement): void
    }
    protoCallProbe.expandGrid(category, current)
    expect(other.classList.contains('field-hidden')).toBe(true)
    expect(current.classList.contains('field-hidden')).toBe(false)
  })

  it('restoreGrid removes field-hidden from sibling fields with the standard "field" class', () => {
    const probe = makeProbe()
    const { category, current, other } = buildCategoryFixture()
    other.classList.add('field-hidden')
    current.classList.add('field-hidden')
    const protoCallProbe = probe as unknown as {
      restoreGrid(container: HTMLElement, currentField: HTMLElement): void
    }
    protoCallProbe.restoreGrid(category, current)
    expect(other.classList.contains('field-hidden')).toBe(false)
    // currentField was already in the "skip" set in the source; the
    // identity comparison preserves that — current is excluded from
    // the removal because it IS the current field. (Its prior
    // field-hidden was set by us in the fixture; restoreGrid would
    // ordinarily NOT have applied it. The point is: restoreGrid
    // doesn't touch the current field, so the bit stays.)
    expect(current.classList.contains('field-hidden')).toBe(true)
  })
})

describe('IdevsGridEditorBase — updateExpandButton icon swap (review finding #4)', () => {
  // Source assigned icons inverted relative to title — when `_isExpanded`
  // was true it showed the outward-arrows icon ("click to expand") while
  // the title said "Restore grid". Icon + title agreed only when
  // collapsed. Fixed so the icon matches what the click WILL do.
  function makeIconProbe(initialExpanded: boolean): {
    probe: GridEditorProbe
    icon: { classList: Set<string>; addClass(c: string): void; removeClass(c: string): void }
    button: { attr: ReturnType<typeof vi.fn> }
  } {
    const probe = makeProbe()
    probe._isExpanded = initialExpanded
    const iconClasses = new Set<string>(['fa', 'fa-expand-arrows-alt'])
    const icon = {
      classList: iconClasses,
      addClass(c: string) {
        iconClasses.add(c)
      },
      removeClass(c: string) {
        iconClasses.delete(c)
      },
    }
    const button = {
      attr: vi.fn(),
      findFirst: vi.fn(() => icon),
    }
    probe.toolbar = { findButton: vi.fn(() => button) }
    return { probe, icon, button }
  }

  it('shows the compress (restore) icon when expanded', () => {
    const { probe, icon, button } = makeIconProbe(true)
    ;(probe as unknown as { updateExpandButton(): void }).updateExpandButton()
    expect(icon.classList.has('fa-compress-arrows-alt')).toBe(true)
    expect(icon.classList.has('fa-expand-arrows-alt')).toBe(false)
    expect(button.attr).toHaveBeenCalledWith('title', 'Restore grid')
  })

  it('shows the expand icon when collapsed', () => {
    const { probe, icon, button } = makeIconProbe(false)
    ;(probe as unknown as { updateExpandButton(): void }).updateExpandButton()
    expect(icon.classList.has('fa-expand-arrows-alt')).toBe(true)
    expect(icon.classList.has('fa-compress-arrows-alt')).toBe(false)
    expect(button.attr).toHaveBeenCalledWith('title', 'Expand grid')
  })
})

describe('IdevsGridEditorBase — validate() XSS-safe contract (PR-4b round-3 #9)', () => {
  // The gating `validate()` method (not the underlying validateRow) is
  // what actually calls notifyError. We can't spy on notifyError under
  // the ESM-namespace import constraint, so we exercise the
  // `formatValidationMessage` contract directly: it returns the
  // `{ text, escapeHtml }` payload that `validate()` forwards to
  // notifyError verbatim.
  it('formatValidationMessage default escapeHtml=true blocks the round-1 XSS sink', () => {
    const probe = makeProbe()
    const result = probe.formatValidationMessage([
      { name: '<img src=x onerror=alert(1)> is required' },
      { email: 'Email is required' },
    ])
    expect(result.escapeHtml).toBe(true)
    // No `<br />` in the join — defends against the source's `<br />`
    // + escapeHtml=false combination which would have parsed user
    // input as HTML.
    expect(result.text).not.toContain('<br')
    expect(result.text).toBe('<img src=x onerror=alert(1)> is required\nEmail is required')
  })

  it('validate() with no errors returns true (and would NOT call notifyError)', () => {
    const probe = makeProbe()
    const proto = Object.getPrototypeOf(probe) as { validateRow?: () => unknown[] }
    const original = proto.validateRow
    proto.validateRow = () => []
    try {
      const result = (probe as unknown as { validate(i: unknown, r: number): boolean }).validate(
        {},
        0,
      )
      expect(result).toBe(true)
    } finally {
      proto.validateRow = original
    }
  })

  it('validate() with errors returns false (and would call notifyError with escapeHtml=true)', () => {
    const probe = makeProbe()
    const proto = Object.getPrototypeOf(probe) as { validateRow?: () => unknown[] }
    const original = proto.validateRow
    proto.validateRow = () => [{ field: 'Field is required' }]
    try {
      const result = (probe as unknown as { validate(i: unknown, r: number): boolean }).validate(
        {},
        0,
      )
      expect(result).toBe(false)
    } finally {
      proto.validateRow = original
    }
  })
})

describe('IdevsGridEditorBase — _lastValidationFailed regression (PR-4b round-3 #3)', () => {
  // Until the round-3 fix, _lastValidationFailed was read but never
  // assigned `true`, so the intended "block row-change notify on failed
  // validate" was never triggered. These tests verify the flag is set
  // by the click-handler's failed-validate branch.
  it('subsequent onActiveCellChanged after failed-validate does NOT advance _currentActiveRow (PR-4b round-5 #2)', () => {
    // Round-4 #4 said "rewrite the test to drive the follow-on
    // behavior" but the previous rewrite STILL inlined the handler
    // body manually. Round 5 #2: drive the ACTUAL production handler
    // by capturing it during setupGridEventHandlers — that way a
    // refactor that flips the condition (e.g. `&& this._lastValidationFailed`)
    // would fail this test.
    const probe = makeProbe()
    // Round-6 #9: replaced the round-5 index-based capture
    // (`capturedHandlers[1]`) with a name-based map. The previous
    // approach assumed `setupGridEventHandlers` registered handlers
    // in a fixed order; reordering the source would silently capture
    // the wrong handler and let the test pass for the wrong reason.
    const capturedByName: Record<string, (e: unknown, args: unknown) => void> = {}
    ;(probe as unknown as {
      addEventListener: (
        target: unknown,
        eventName: string,
        handler: (e: unknown, args: unknown) => void,
      ) => void
    }).addEventListener = (
      _target: unknown,
      eventName: string,
      handler: (e: unknown, args: unknown) => void,
    ) => {
      capturedByName[eventName] = handler
    }
    ;(probe as unknown as { setupGridEventHandlers(): void }).setupGridEventHandlers()
    const onActiveCellChangedHandler = capturedByName['onActiveCellChanged']!
    expect(typeof onActiveCellChangedHandler).toBe('function')

    // Prime state + subscribers.
    probe._currentActiveRow = 5
    probe._lastValidationFailed = true
    const rowChangeCb = vi.fn()
    probe.subscribeToRowChange(rowChangeCb)
    probe.slickGrid.getDataItem = vi.fn((row: number) => ({ row }))

    // Fire the REAL production handler.
    onActiveCellChangedHandler({}, { row: 7 })

    // Production behavior: flag was true → no notify, no advance.
    expect(rowChangeCb).not.toHaveBeenCalled()
    expect(probe._currentActiveRow).toBe(5)
    // AND the flag must have been reset to false at the end of the
    // handler so the NEXT cell-change is honored.
    expect(probe._lastValidationFailed).toBe(false)
  })

  it('next onActiveCellChanged after the flag resets DOES advance + notify (PR-4b round-5 #2)', () => {
    // Captures the REAL handler (same pattern as above) and verifies
    // the post-reset path: flag=false → notify fires + active row
    // advances.
    const probe = makeProbe()
    const capturedHandlers: ((e: unknown, args: unknown) => void)[] = []
    ;(probe as unknown as {
      addEventListener: (
        target: unknown,
        eventName: string,
        handler: (e: unknown, args: unknown) => void,
      ) => void
    }).addEventListener = (_t: unknown, _n: string, handler: (e: unknown, args: unknown) => void) => {
      capturedHandlers.push(handler)
    }
    ;(probe as unknown as { setupGridEventHandlers(): void }).setupGridEventHandlers()
    const onActiveCellChangedHandler = capturedHandlers[1]!

    probe._currentActiveRow = 5
    probe._lastValidationFailed = false
    const rowChangeCb = vi.fn()
    probe.subscribeToRowChange(rowChangeCb)
    probe.slickGrid.getDataItem = vi.fn((row: number) => ({ row }))

    onActiveCellChangedHandler({}, { row: 7 })

    // Production behavior: flag was false → notify fires + row advances.
    expect(rowChangeCb).toHaveBeenCalledWith(5, 7, { row: 5 }, { row: 7 })
    expect(probe._currentActiveRow).toBe(7)
  })
})

describe('IdevsGridEditorBase — tryCommitEditor failure paths (PR-4b round-3 #6)', () => {
  type TryCommitProbe = GridEditorProbe & { tryCommitEditor(): boolean }
  it('returns true when editor lock is not active', () => {
    const probe = makeProbe() as TryCommitProbe
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => false,
      commitCurrentEdit: vi.fn(),
      cancelCurrentEdit: vi.fn(),
    }))
    expect(probe.tryCommitEditor()).toBe(true)
  })
  it('returns false + logs when commitCurrentEdit returns false (validation rejection)', () => {
    const probe = makeProbe() as TryCommitProbe
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => false),
      cancelCurrentEdit: vi.fn(),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(probe.tryCommitEditor()).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('commitCurrentEdit returned false'),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
  it('returns false + cancels current edit when commitCurrentEdit throws', () => {
    const probe = makeProbe() as TryCommitProbe
    const cancel = vi.fn()
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => {
        throw new Error('editor crashed')
      }),
      cancelCurrentEdit: cancel,
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // The throw branch returns false. The user-facing notifyError
      // call is exercised by the source code path but we can't spy on
      // it under the ESM-namespace import constraint — relying on the
      // observable side-effects (cancel was called + warn logged) to
      // pin the contract.
      expect(probe.tryCommitEditor()).toBe(false)
      expect(cancel).toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('commitCurrentEdit threw'),
        expect.any(Error),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditorBase — deleteCurrentRow repositioning', () => {
  it('after deleting row 1 of 2, setActiveCell(0, cell) is called', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 1, cell: 0 }))
    // After delete, view.getLength returns 1 (we mutate items array).
    probe.view.deleteItem = vi.fn(() => {
      items.splice(1, 1)
    })
    probe.deleteCurrentRow()
    expect(probe.slickGrid.setActiveCell).toHaveBeenCalledWith(0, 0)
  })

  it('after deleting row 0 of 2, setActiveCell(0, cell) is called (Math.max floor)', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.view.deleteItem = vi.fn(() => {
      items.splice(0, 1)
    })
    probe.deleteCurrentRow()
    expect(probe.slickGrid.setActiveCell).toHaveBeenCalledWith(0, 0)
  })
})

describe('IdevsGridEditorBase — getDeletedRows defensive copy (PR-4b round-3 #16 + round-4 #14)', () => {
  it('returns a fresh array so array-level mutations do not leak', () => {
    const probe = makeProbe()
    probe._deletedRows = [{ id: 1 }, { id: 2 }]
    const returned = probe.getDeletedRows()
    expect(returned).toEqual([{ id: 1 }, { id: 2 }])
    // Cast through unknown to mutate — this is the contract-breaker we
    // want to prove the defensive copy blocks.
    ;(returned as unknown as { push(x: unknown): void }).push({ id: 3 })
    // Internal state is unaffected.
    expect(probe._deletedRows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('returns a DEEP copy so per-row field mutations do not leak (round-4)', () => {
    // Round 4 #14: prior shallow `[...arr]` shared entity references.
    // Round-4 fix uses structuredClone for true deep copy.
    if (typeof structuredClone !== 'function') {
      // Skip when structuredClone is unavailable — the fallback is
      // shallow copy by design.
      return
    }
    const probe = makeProbe()
    probe._deletedRows = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]
    const returned = probe.getDeletedRows() as { id: number; name: string }[]
    returned[0]!.id = 999
    returned[0]!.name = 'mutated'
    expect((probe._deletedRows as { id: number; name: string }[])[0]).toEqual({
      id: 1,
      name: 'A',
    })
  })

  it('falls back to shallow copy + warns when structuredClone throws DataCloneError (PR-4b round-5 #1)', () => {
    // Round 5 #1: round-4 only guarded `typeof === 'function'`
    // (undefined-availability). If structuredClone exists but THROWS
    // on a non-cloneable TEntity (functions, DOM refs, class privates),
    // the call would crash the caller. Round-5 fix wraps in try/catch
    // and falls back to shallow spread.
    const probe = makeProbe()
    // Inject an entity with a function property — structuredClone
    // throws DataCloneError on functions.
    const fn = () => 'computed'
    probe._deletedRows = [{ id: 1, name: 'A', onChange: fn }]
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const returned = probe.getDeletedRows() as { id: number; name: string }[]
      // The result is a SHALLOW copy (fallback path) — array is fresh
      // but elements are shared. Verify the call returned something
      // sensible and didn't throw.
      expect(returned.length).toBe(1)
      expect(returned[0]!.id).toBe(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('structuredClone failed'),
        expect.any(Error),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('falls back to shallow copy when structuredClone is undefined (PR-4b round-5 #10)', () => {
    // Round 5 #10: the shallow-fallback path (line 176 of source) is
    // dead under Node 18+ tests because structuredClone is always
    // available. Stub it to undefined to exercise the fallback branch.
    const probe = makeProbe()
    probe._deletedRows = [{ id: 1, name: 'A' }]
    const originalStructuredClone = (globalThis as { structuredClone?: typeof structuredClone })
      .structuredClone
    ;(globalThis as { structuredClone?: typeof structuredClone }).structuredClone = undefined
    try {
      const returned = probe.getDeletedRows() as { id: number; name: string }[]
      expect(returned).toEqual([{ id: 1, name: 'A' }])
      // Verify it IS a shallow copy: same element reference, different array.
      expect(returned).not.toBe(probe._deletedRows as unknown)
      expect(returned[0]).toBe(
        (probe._deletedRows as { id: number; name: string }[])[0],
      )
    } finally {
      ;(globalThis as { structuredClone?: typeof structuredClone }).structuredClone =
        originalStructuredClone
    }
  })
})

describe('IdevsGridEditorBase — addButtonClick first-editable-cell respects isCellEditable (PR-4b round-7 #2)', () => {
  // Round 7 #2: prior code used a weaker predicate (`!!col.editor && visible !== false`)
  // that ignored slick-reorder-cell + sourceItem.readOnly. Grids with
  // a leading reorder/read-only column would land the post-add focus
  // on a non-editable cell. Round-7 fix routes through the same
  // `isCellEditable` predicate the keyboard navigation uses.
  // Helper: addButtonClick calls `view.addItem(newRow)`. The test's
  // makeProbe mock for `addItem` doesn't actually mutate the items
  // array, so we have to seed items with one placeholder so that
  // `view.getLength() - 1` returns 0 (the row index addButtonClick
  // expects).
  it('skips a leading slick-reorder column when picking first editable cell', () => {
    const items: Record<string, unknown>[] = [{}] // seeded — see helper note
    const probe = makeProbe({
      columns: [
        // Leading reorder column — has editor but cssClass marks it as
        // a Slick reorder cell that should NOT receive focus.
        { editor: () => undefined, visible: true, cssClass: 'slick-reorder-cell' },
        { editor: () => undefined, field: 'name', visible: true, sourceItem: {} },
      ],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => null)
    probe.addButtonClick()
    // The new active cell MUST be index 1 (the real editable column),
    // NOT index 0 (the reorder cell).
    expect(probe.slickGrid.setActiveCell).toHaveBeenCalledWith(0, 1)
  })

  it('skips a leading sourceItem.readOnly column when picking first editable cell', () => {
    const items: Record<string, unknown>[] = [{}]
    const probe = makeProbe({
      columns: [
        // Read-only column — has editor + visible, but sourceItem.readOnly
        // marks it as non-editable. The weaker prior filter accepted it.
        { editor: () => undefined, field: 'id', visible: true, sourceItem: { readOnly: true } },
        { editor: () => undefined, field: 'name', visible: true, sourceItem: {} },
      ],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => null)
    probe.addButtonClick()
    expect(probe.slickGrid.setActiveCell).toHaveBeenCalledWith(0, 1)
  })

  it('falls back to cell 0 when NO column is editable (prior behavior preserved)', () => {
    const items: Record<string, unknown>[] = [{}]
    const probe = makeProbe({
      columns: [
        // No editor at all on any column.
        { visible: true, sourceItem: {} },
        { visible: true, sourceItem: {} },
      ],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => null)
    probe.addButtonClick()
    // findIndex returns -1 → fall back to cell 0 (the source's
    // pattern; this is the "no editable cell" edge case).
    expect(probe.slickGrid.setActiveCell).toHaveBeenCalledWith(0, 0)
  })
})

describe('IdevsGridEditorBase — subscribe-after-destroy guard (PR-4b round-6 #6)', () => {
  // Round 6 #6: subscribeToRowChange/subscribeToAddButtonClick
  // previously pushed into arrays cleared by destroy() — silent
  // never-fires. Round-6 fix adds a destroyed flag check.
  it('subscribeToRowChange after destroy warns + returns no-op unsubscribe', () => {
    const probe = makeProbe()
    probe.destroy()
    const cb = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const unsub = probe.subscribeToRowChange(cb)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subscribeToRowChange called after destroy()'),
      )
      // Returned function is a no-op (must not throw).
      expect(() => unsub()).not.toThrow()
      // Callback was NOT pushed onto the internal array.
      expect(probe._rowChangeSubscribers.length).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('subscribeToAddButtonClick after destroy warns + returns no-op unsubscribe', () => {
    const probe = makeProbe()
    probe.destroy()
    const cb = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const unsub = probe.subscribeToAddButtonClick(cb)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subscribeToAddButtonClick called after destroy()'),
      )
      expect(() => unsub()).not.toThrow()
      expect(probe._addButtonClickSubscribers.length).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsGridEditorBase — deleteCurrentRow transactional rollback (PR-4b round-6 #1)', () => {
  // Round 6 #1 (the most-severe finding): prior ordering pushed onto
  // `_deletedRows` BEFORE `view.deleteItem`. If view.deleteItem (or
  // any subsequent grid mutation) threw, the controller kept a
  // phantom delete entry → on save, the server got a delete request
  // for an entity the user could still see in the grid.
  //
  // Round-6 fix: push onto `_deletedRows` AFTER all view/grid
  // mutations succeed. On throw, _deletedRows stays unchanged + the
  // caller sees the original error.
  it('does NOT add row to _deletedRows when view.deleteItem throws', () => {
    const items = [{ id: 5, name: 'A' }]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.view.deleteItem = vi.fn(() => {
      throw new Error('view corrupt')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => probe.deleteCurrentRow()).toThrow(/view corrupt/)
      // _deletedRows must NOT contain the phantom row.
      expect(probe._deletedRows).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('view/grid mutation failed'),
        expect.any(Error),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('adds row to _deletedRows when view.deleteItem succeeds', () => {
    // Sanity: the rollback fix must not break the happy path.
    const items = [{ id: 5, name: 'A' }]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.deleteCurrentRow()
    expect(probe._deletedRows).toEqual([{ id: 5, name: 'A' }])
    expect(probe.view.deleteItem).toHaveBeenCalledWith(5)
  })
})

describe('IdevsGridEditorBase — module export shape', () => {
  it('exports the class as a constructor function with all public + protected hooks', () => {
    expect(typeof IdevsGridEditorBase).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.getIsFirstClicked).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.getDeletedRows).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.getOrderField).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.subscribeToRowChange).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.subscribeToAddButtonClick).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.validateRows).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.destroy).toBe('function')
    expect(typeof IdevsGridEditorBase.prototype.toggleGridExpansion).toBe('function')
  })

  it('drops the dead validateCell private method (regression vs PowerACC source)', () => {
    expect(
      (IdevsGridEditorBase.prototype as unknown as Record<string, unknown>)['validateCell'],
    ).toBeUndefined()
  })
})
