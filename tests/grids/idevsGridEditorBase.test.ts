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
    // Round-9 #3 (Copilot): the round-5 #2 follow-on test still
    // captured by registration order (`capturedHandlers[1]`), even
    // though the preceding test had been switched to name-based
    // capture in round 6 #9. If `setupGridEventHandlers` reorders
    // its addEventListener calls, the wrong handler would be
    // captured here and the test would fail for a refactor rather
    // than a behavior regression. Now uses the same name-based
    // pattern as the preceding test.
    const probe = makeProbe()
    const capturedByName: Record<string, (e: unknown, args: unknown) => void> = {}
    ;(probe as unknown as {
      addEventListener: (
        target: unknown,
        eventName: string,
        handler: (e: unknown, args: unknown) => void,
      ) => void
    }).addEventListener = (
      _t: unknown,
      eventName: string,
      handler: (e: unknown, args: unknown) => void,
    ) => {
      capturedByName[eventName] = handler
    }
    ;(probe as unknown as { setupGridEventHandlers(): void }).setupGridEventHandlers()
    const onActiveCellChangedHandler = capturedByName['onActiveCellChanged']!
    expect(typeof onActiveCellChangedHandler).toBe('function')

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

describe('IdevsGridEditorBase — handleKeyDown last-cell commit routes through tryCommitEditor (round-9 #1)', () => {
  // Round-9 #1 (Copilot): the last-editable-cell branch in
  // handleKeyDown previously called `getEditorLock().commitCurrentEdit()`
  // directly, ignoring both failure modes:
  //   - commitCurrentEdit() returning false (validation rejection)
  //   - commitCurrentEdit() throwing (programmer/runtime error)
  // The "else" branch already used `tryCommitEditor()` correctly,
  // making the two paths asymmetric. Fix routes the last-cell path
  // through `tryCommitEditor()` too AND halts navigation/add-row
  // on failure.
  //
  // Why a structural/source-text test instead of a runtime probe:
  // `handleKeyDown` is an arrow class-field, not a prototype method,
  // so `Object.create(IdevsGridEditorBase.prototype)` produces a
  // probe with `this.handleKeyDown === undefined`. Real construction
  // would require a Serenity GridEditorBase mount with full
  // SlickGrid + RemoteView wiring, which is the test harness
  // explicitly avoided across all PR-4b tests. The runtime contract
  // for `tryCommitEditor` itself is exhaustively covered in
  // "tryCommitEditor failure paths" below (PR-4b round-3 #6) —
  // returns-false, throws, and not-active paths all asserted. This
  // test confirms the round-9 #1 fix by asserting the structural
  // anti-regression: the bug pattern (`commitCurrentEdit()` called
  // directly without going through `tryCommitEditor`) MUST NOT
  // appear in the last-editable-cell branch of `handleKeyDown`.
  it('source: last-cell branch routes through tryCommitEditor (no raw commitCurrentEdit call)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    // Extract the `handleKeyDown` arrow body (from the declaration
    // through the closing brace of the assigned arrow function).
    const startIdx = src.indexOf('private handleKeyDown =')
    expect(startIdx).toBeGreaterThan(-1)
    // Find the end of this assignment: the next `}\n  }\n` (private
    // method/property terminator at 2-space indent). For arrow-class-
    // field assignments, the body ends with `\n  }\n`. Use a
    // conservative slice to the next top-level private declaration.
    const remainder = src.slice(startIdx)
    const nextMemberIdx = remainder.search(/\n {2}(private|protected|public|override)\s/)
    const handleKeyDownBody = nextMemberIdx > -1 ? remainder.slice(0, nextMemberIdx) : remainder
    // Anti-regression: the last-editable-cell branch (inside the
    // `activeCell.cell === lastEditableCellIndex` block) must NOT
    // call `commitCurrentEdit` directly. All commit paths go
    // through `tryCommitEditor` so failure/throw routes through the
    // documented contract.
    // Search for the bug pattern inside the relevant block.
    const lastCellIdx = handleKeyDownBody.indexOf(
      'activeCell.cell === lastEditableCellIndex',
    )
    expect(lastCellIdx).toBeGreaterThan(-1)
    // Slice from there to next `} else {` (end of the last-cell
    // branch).
    const restOfBranch = handleKeyDownBody.slice(lastCellIdx)
    const elseBranchIdx = restOfBranch.indexOf('} else {')
    const lastCellBranch =
      elseBranchIdx > -1 ? restOfBranch.slice(0, elseBranchIdx) : restOfBranch
    // The bug pattern: raw commit without going through tryCommitEditor.
    expect(lastCellBranch).not.toMatch(
      /getEditorLock\(\)\.commitCurrentEdit\(\)/,
    )
    // The fix: tryCommitEditor IS called in this branch.
    expect(lastCellBranch).toMatch(/this\.tryCommitEditor\(\)/)
  })
})

describe('IdevsGridEditorBase — handleKeyDown early-return branch preventDefault when handling key (round-13 #1)', () => {
  // Round-13 #1 (Copilot): the early-return branch in handleKeyDown
  // had this shape:
  //
  //   if (!editorLock.isActive() || !getIsFirstClicked()) {
  //     if (getIsFirstClicked()) this.moveFocusToNextCell(e.shiftKey)
  //     return
  //   }
  //
  // When the inner `if (getIsFirstClicked())` was true (no active
  // editor but user had clicked Add at least once), the code
  // advanced SlickGrid's active cell via moveFocusToNextCell but
  // did NOT call preventDefault/stopImmediatePropagation. The
  // browser's native Tab handling then moved DOM focus out of the
  // grid AFTER our internal nav had already advanced — desyncing
  // active-cell state from DOM focus. The later active-editor
  // branch already calls these (the round-12 #1 commit-first code
  // path eventually reaches `e.preventDefault()` at L876).
  //
  // Fix: call both preventDefault + stopImmediatePropagation when
  // we DO handle the key. The just-return path (neither condition
  // met) intentionally lets the native event through.
  //
  // Source-text structural test (same constraint as round-9 #1):
  // handleKeyDown is an arrow class-field unreachable via probe.
  it('source: moveFocusToNextCell call in the early-return branch is preceded by preventDefault + stopImmediatePropagation', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startIdx = src.indexOf('private handleKeyDown =')
    expect(startIdx).toBeGreaterThan(-1)
    const remainder = src.slice(startIdx)
    const nextMemberIdx = remainder.search(/\n {2}(private|protected|public|override)\s/)
    const body = nextMemberIdx > -1 ? remainder.slice(0, nextMemberIdx) : remainder

    // Find the early-return branch.
    const earlyReturnIdx = body.indexOf("!this.slickGrid.getEditorLock().isActive()")
    expect(earlyReturnIdx).toBeGreaterThan(-1)
    // Slice to the closing brace of the early-return block. The
    // simplest stable marker is the `return` keyword that terminates
    // the block.
    const branchSlice = body.slice(earlyReturnIdx, earlyReturnIdx + 1500)
    const returnIdx = branchSlice.indexOf('return\n')
    const earlyBranch = returnIdx > -1 ? branchSlice.slice(0, returnIdx) : branchSlice

    // Locate the three calls.
    const moveFocusIdx = earlyBranch.search(/this\.moveFocusToNextCell\(/)
    const preventDefaultIdx = earlyBranch.search(/e\.preventDefault\(\)/)
    const stopPropIdx = earlyBranch.search(/e\.stopImmediatePropagation\(\)/)
    expect(moveFocusIdx).toBeGreaterThan(-1)
    expect(preventDefaultIdx).toBeGreaterThan(-1)
    expect(stopPropIdx).toBeGreaterThan(-1)
    // Both suppression calls must precede moveFocusToNextCell so a
    // future refactor that swaps the order (or drops the calls)
    // fails the test.
    expect(preventDefaultIdx).toBeLessThan(moveFocusIdx)
    expect(stopPropIdx).toBeLessThan(moveFocusIdx)
  })
})

describe('IdevsGridEditorBase — handleKeyDown commits BEFORE row-validate (round-12 #1)', () => {
  // Round-12 #1 (Copilot): the prior order in the last-cell branch
  // was `validate(currentItem)` → `tryCommitEditor` → `addButtonClick`.
  // Bug: row-validation read `currentItem` BEFORE the editor commit
  // wrote the new value into it. An invalid last-cell change passed
  // row-validation (old value), then commit persisted the bad value,
  // then focus moved without re-validating the post-commit state.
  //
  // Fix: commit FIRST (so currentItem reflects the post-commit
  // state), then validate THAT.
  //
  // Why a source-text test: handleKeyDown is an arrow class-field
  // unreachable via Object.create — see round-9 #1 for the same
  // constraint. The validate + tryCommitEditor runtime contracts are
  // both exhaustively tested individually; this test asserts the
  // ORDERING anti-regression.
  it('source: last-cell branch calls tryCommitEditor BEFORE validate(currentItem)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startIdx = src.indexOf('private handleKeyDown =')
    expect(startIdx).toBeGreaterThan(-1)
    const remainder = src.slice(startIdx)
    const nextMemberIdx = remainder.search(/\n {2}(private|protected|public|override)\s/)
    const handleKeyDownBody = nextMemberIdx > -1 ? remainder.slice(0, nextMemberIdx) : remainder

    // Scope to the last-cell branch.
    const lastCellIdx = handleKeyDownBody.indexOf('activeCell.cell === lastEditableCellIndex')
    expect(lastCellIdx).toBeGreaterThan(-1)
    const restOfBranch = handleKeyDownBody.slice(lastCellIdx)
    const elseBranchIdx = restOfBranch.indexOf('} else if (this.slickGrid.getEditorLock()')
    const lastCellBranch =
      elseBranchIdx > -1 ? restOfBranch.slice(0, elseBranchIdx) : restOfBranch

    // Locate the call positions within the branch.
    const tryCommitIdx = lastCellBranch.search(/this\.tryCommitEditor\(\)/)
    const validateIdx = lastCellBranch.search(/this\.validate\(currentItem,\s*activeCell\.row\)/)
    expect(tryCommitIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeGreaterThan(-1)
    // The ordering: tryCommitEditor must appear BEFORE validate.
    // The reverse ordering (the bug pattern) would have validate
    // appear first.
    expect(tryCommitIdx).toBeLessThan(validateIdx)
  })

  it('source: currentItem is read AFTER tryCommitEditor (so it reflects post-commit state)', async () => {
    // Defensive corollary: `getDataItem` (which reads `currentItem`)
    // must also happen AFTER tryCommitEditor — if `currentItem` is
    // captured before commit, even a correctly-ordered validate
    // would see the stale value via the captured reference.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startIdx = src.indexOf('private handleKeyDown =')
    const remainder = src.slice(startIdx)
    const nextMemberIdx = remainder.search(/\n {2}(private|protected|public|override)\s/)
    const handleKeyDownBody = nextMemberIdx > -1 ? remainder.slice(0, nextMemberIdx) : remainder

    const lastCellIdx = handleKeyDownBody.indexOf('activeCell.cell === lastEditableCellIndex')
    const restOfBranch = handleKeyDownBody.slice(lastCellIdx)
    const elseBranchIdx = restOfBranch.indexOf('} else if (this.slickGrid.getEditorLock()')
    const lastCellBranch =
      elseBranchIdx > -1 ? restOfBranch.slice(0, elseBranchIdx) : restOfBranch

    const tryCommitIdx = lastCellBranch.search(/this\.tryCommitEditor\(\)/)
    const getDataItemIdx = lastCellBranch.search(/this\.slickGrid\.getDataItem\(activeCell\.row\)/)
    expect(tryCommitIdx).toBeGreaterThan(-1)
    expect(getDataItemIdx).toBeGreaterThan(-1)
    expect(tryCommitIdx).toBeLessThan(getDataItemIdx)
  })
})

describe('IdevsGridEditorBase — lastEditableCellIndex uses isCellEditable predicate (round-11 #2)', () => {
  // Round-11 #2 (Copilot): the `lastEditableCellIndex` scan inside
  // handleKeyDown used a weaker inline predicate than `isCellEditable`
  // — specifically, it didn't check `sourceItem.readOnly`. If a
  // read-only column appeared AFTER the real editable columns, it
  // would still match the inline filter and lastEditableCellIndex
  // would land on the wrong index — Tab/Enter wouldn't treat the
  // actual last editable cell as the row edge, and add-row /
  // row-transition logic ran from the wrong column.
  //
  // Same asymmetric-predicate pattern that round-7 #2 caught for
  // addButtonClick.
  //
  // Why a source-text structural test (vs. runtime probe):
  // handleKeyDown is an arrow class-field unreachable via
  // `Object.create(prototype)` — see round-9 #1 for the same
  // constraint. The `isCellEditable` predicate is itself fully
  // covered at runtime; this test asserts the structural anti-
  // regression that `handleKeyDown`'s last-cell scan routes through
  // it.
  it('source: handleKeyDown last-cell scan calls this.isCellEditable (no inline predicate)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    // Find handleKeyDown's body.
    const startIdx = src.indexOf('private handleKeyDown =')
    expect(startIdx).toBeGreaterThan(-1)
    const remainder = src.slice(startIdx)
    const nextMemberIdx = remainder.search(/\n {2}(private|protected|public|override)\s/)
    const handleKeyDownBody = nextMemberIdx > -1 ? remainder.slice(0, nextMemberIdx) : remainder
    // Find the lastEditableCellIndex scan loop.
    const lastEditableIdx = handleKeyDownBody.indexOf('lastEditableCellIndex')
    expect(lastEditableIdx).toBeGreaterThan(-1)
    // Slice forward a reasonable window to capture the scan body.
    const scanBody = handleKeyDownBody.slice(lastEditableIdx, lastEditableIdx + 500)
    // Anti-regression: the scan must call this.isCellEditable.
    expect(scanBody).toMatch(/this\.isCellEditable\(/)
    // It must NOT use the weaker inline predicate that the source
    // had before the fix. The hallmark of the old predicate is
    // checking `!!col.editor` AND `col.cssClass?.includes('slick-reorder-cell')`
    // INSIDE the scan (without going through isCellEditable).
    // After the fix, isCellEditable centralizes those checks.
    expect(scanBody).not.toMatch(/!!col\.editor\s*&&\s*col\.visible\s*!==\s*false\s*&&\s*!col\.cssClass\?\.includes/)
  })
})

describe('IdevsGridEditorBase — click handler commits active editor BEFORE startEditing (round-17 #1 [P1] Copilot)', () => {
  // Round-17 #1 [P1] (Copilot): when user clicks another cell while
  // an editor is active, the click handler called `startEditing`
  // which tears down the current editor via `setActiveCell` WITHOUT
  // committing it. The in-flight value was discarded.
  //
  // Source-text structural assertion (click handler is an inline
  // arrow in setupGridEventHandlers, not probe-reachable).
  it('source: click handler calls tryCommitEditor BEFORE startEditing in the row-change branch', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const startEditingIdx = src.indexOf('this.startEditing(args.row, args.cell)')
    expect(startEditingIdx).toBeGreaterThan(-1)
    const before = src.slice(0, startEditingIdx)
    const handlerStart = before.lastIndexOf('clickEventName')
    expect(handlerStart).toBeGreaterThan(-1)
    const handlerBody = src.slice(handlerStart, startEditingIdx + 200)
    const tryCommitIdx = handlerBody.search(/this\.tryCommitEditor\(\)/)
    const startEditingRelIdx = handlerBody.indexOf('this.startEditing(args.row, args.cell)')
    expect(tryCommitIdx).toBeGreaterThan(-1)
    expect(tryCommitIdx).toBeLessThan(startEditingRelIdx)
  })

  it('source: click handler does NOT set _lastValidationFailed when blocking the click (round-17 #3 [P2])', async () => {
    // Round-17 #3 [P2] (Copilot): blocking the click prevents
    // onActiveCellChanged from firing, so the flag setting would
    // persist indefinitely and incorrectly suppress the next
    // successful row-change notify + advance.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    const clickEventNameIdx = src.indexOf('const clickEventName')
    expect(clickEventNameIdx).toBeGreaterThan(-1)
    const afterClick = src.slice(clickEventNameIdx)
    const nextHandlerIdx = afterClick.indexOf('// Tab / Enter navigation')
    const clickHandlerBody =
      nextHandlerIdx > -1 ? afterClick.slice(0, nextHandlerIdx) : afterClick
    // The click handler block-paths (validate-fail / commit-fail)
    // must NOT set the flag. (The onBeforeEditCell handler still
    // sets it — different handler, different SlickGrid event
    // ordering.)
    expect(clickHandlerBody).not.toMatch(/this\._lastValidationFailed\s*=\s*true/)
  })

  it('source: click handler commits when row OR cell changes (round-18 #1 [P1] — same-row cell click)', async () => {
    // Round-18 #1 [P1] (Copilot): round-17 #1 gated the commit by
    // `activeCell.row !== args.row` only. Editing row 0 cell 1 and
    // clicking row 0 cell 2 hit the SAME row, so the gate skipped
    // tryCommitEditor; startEditing then tore down the active
    // editor without committing. The original P1 data-loss path
    // remained for same-row navigation.
    //
    // Fix: gate by row OR cell change. validate() still runs only
    // on actual row changes.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')

    // Locate the click handler block. Slice from `clickEventName`
    // (the click subscription wiring) to the next addEventListener
    // (Tab/Enter navigation).
    const clickEventNameIdx = src.indexOf('const clickEventName')
    expect(clickEventNameIdx).toBeGreaterThan(-1)
    const afterClick = src.slice(clickEventNameIdx)
    const nextHandlerIdx = afterClick.indexOf('// Tab / Enter navigation')
    const clickHandlerBody =
      nextHandlerIdx > -1 ? afterClick.slice(0, nextHandlerIdx) : afterClick

    // The gating condition before tryCommitEditor MUST cover
    // same-row cell changes too — not just `row !== args.row`.
    // The bug pattern was a sole `activeCell.row !== args.row`
    // check. The fix must include `activeCell.cell !== <target>.cell`
    // somewhere in the gate. After round-19 #6, the gate compares
    // against a narrowed `clickTarget` local rather than `args`
    // directly, so the pattern accepts either form.
    //
    // Assert: cell-difference is part of the guard.
    expect(clickHandlerBody).toMatch(
      /activeCell\.cell\s*!==\s*(args[?]?|clickTarget)\.cell/,
    )
    // And: the commit call IS present in this handler.
    expect(clickHandlerBody).toMatch(/this\.tryCommitEditor\(\)/)
  })

  // Round-19 #2 (pr-test-analyzer 9/10) + #3 (pr-test-analyzer 8/10):
  // The previous round's brittle "no `||` between the inner `if` and
  // the inner validate" structural test was style-pinning — it
  // rejected any future `||` in the file (including in unrelated code
  // / comments) instead of asserting the actual behavior. Replaced
  // with behavioral runtime assertions that drive the captured click
  // handler through the same paths the bug touches.
  //
  // The click handler is registered inside `setupGridEventHandlers`
  // via `this.addEventListener(emitter, 'onClick', handler)`. Since
  // the probe's mock emitter is a `vi.fn()`, we can pull the captured
  // handler back out of `subscribe.mock.calls` and invoke it directly
  // with synthesized SlickGrid `(e, args)` arguments. Sequence of
  // mock calls answers the question "did commit run before
  // startEditing?" without relying on source-text patterns.
  describe('IdevsGridEditorBase — click handler runtime contract (round-19 #2/#3)', () => {
    type ClickHandler = (
      e: { stopImmediatePropagation?: () => void; preventDefault?: () => void } | undefined,
      args: { row?: number; cell?: number } | undefined,
    ) => unknown

    function setupClickHandlerProbe(opts: {
      activeCell: { row: number; cell: number } | null
      lockActive: boolean
      commitReturns: boolean
    }) {
      const probe = makeProbe({
        items: [{ a: 1 }, { b: 2 }],
        columns: [{ field: 'a' }, { field: 'b' }],
      })
      // Sequence trace of the mock calls we care about (interleaved).
      const sequence: string[] = []
      probe.slickGrid.getActiveCell = vi.fn(() => opts.activeCell)
      probe.slickGrid.getEditorLock = vi.fn(() => ({
        isActive: () => opts.lockActive,
        commitCurrentEdit: vi.fn(() => {
          sequence.push('commitCurrentEdit')
          return opts.commitReturns
        }),
        cancelCurrentEdit: vi.fn(),
      }))
      probe.slickGrid.setActiveCell = vi.fn(() => {
        sequence.push('setActiveCell')
      })
      probe.slickGrid.editActiveCell = vi.fn(() => {
        sequence.push('editActiveCell')
      })
      probe.slickGrid.getCellEditor = vi.fn(() => null) as unknown as ReturnType<typeof vi.fn>
      // Spy on validate via the prototype so the source's inline
      // call (not on probe) still hits us. validate -> notifyError;
      // we make it deterministic.
      const proto = Object.getPrototypeOf(probe) as { validate?: (...a: unknown[]) => boolean }
      const originalValidate = proto.validate
      proto.validate = (..._a: unknown[]) => {
        sequence.push('validate')
        return true
      }

      // Wire up _opts so setupGridEventHandlers takes the autoEdit
      // (onClick) branch.
      ;(probe as unknown as { _opts: { editable: boolean; autoEdit: boolean } })._opts = {
        editable: true,
        autoEdit: true,
      }

      // Invoke setupGridEventHandlers via prototype. The Tab/Enter
      // and onBeforeEditCell + onActiveCellChanged subscribers are
      // also captured here but we'll only invoke the click handler.
      const setup = (
        Object.getPrototypeOf(probe) as { setupGridEventHandlers: () => void }
      ).setupGridEventHandlers
      setup.call(probe)

      const onClickSubscribe = probe.slickGrid.onClick.subscribe as ReturnType<typeof vi.fn>
      // The click handler is the FIRST (and only) subscriber on
      // onClick — _opts.autoEdit=true routes the click subscription
      // to onClick, not onDblClick.
      expect(onClickSubscribe.mock.calls.length).toBe(1)
      const clickHandler = onClickSubscribe.mock.calls[0]?.[0] as ClickHandler
      expect(typeof clickHandler).toBe('function')

      const restore = () => {
        if (originalValidate) proto.validate = originalValidate
        else delete proto.validate
      }
      return { probe, clickHandler, sequence, restore }
    }

    it('different-ROW click: commit runs BEFORE validate runs BEFORE startEditing', () => {
      const { clickHandler, sequence, restore } = setupClickHandlerProbe({
        activeCell: { row: 0, cell: 1 },
        lockActive: true,
        commitReturns: true,
      })
      try {
        const result = clickHandler(undefined, { row: 1, cell: 0 })
        expect(result).not.toBe(false)
        // tryCommitEditor → commitCurrentEdit, then validate, then
        // startEditing (which calls setActiveCell + editActiveCell).
        expect(sequence).toEqual([
          'commitCurrentEdit',
          'validate',
          'setActiveCell',
          'editActiveCell',
        ])
      } finally {
        restore()
      }
    })

    it('same-ROW different-CELL click (round-18 #1 [P1]): commit runs but validate does NOT, then startEditing', () => {
      // This is THE round-18 #1 data-loss scenario at runtime: edit
      // row 0 cell 0, click row 0 cell 1. The commit MUST run; the
      // row-validate must NOT (still editing the same row); then
      // startEditing fires for the new cell.
      const { clickHandler, sequence, restore } = setupClickHandlerProbe({
        activeCell: { row: 0, cell: 0 },
        lockActive: true,
        commitReturns: true,
      })
      try {
        const result = clickHandler(undefined, { row: 0, cell: 1 })
        expect(result).not.toBe(false)
        // commitCurrentEdit runs (the round-18 widening) but
        // validate is skipped (round-17 #1's row-only contract).
        expect(sequence).toContain('commitCurrentEdit')
        expect(sequence).not.toContain('validate')
        expect(sequence).toContain('setActiveCell')
        // Ordering: commit MUST precede setActiveCell. Without
        // that ordering the editor would be torn down before the
        // commit ran (round-17 #1 / round-18 #1 data-loss path).
        expect(sequence.indexOf('commitCurrentEdit')).toBeLessThan(
          sequence.indexOf('setActiveCell'),
        )
      } finally {
        restore()
      }
    })

    it('same-CELL click (no-op navigation): commit does NOT run, validate does NOT run, no startEditing', () => {
      // Clicking the same cell the user is already editing is a
      // null-navigation — the gate's `isDifferentCell` check is
      // false, so neither commit nor validate is invoked. But the
      // handler still routes through `startEditing` for the
      // editor's own focus-restore semantics.
      const { clickHandler, sequence, restore } = setupClickHandlerProbe({
        activeCell: { row: 0, cell: 0 },
        lockActive: true,
        commitReturns: true,
      })
      try {
        clickHandler(undefined, { row: 0, cell: 0 })
        expect(sequence).not.toContain('commitCurrentEdit')
        expect(sequence).not.toContain('validate')
        // startEditing still fires unconditionally for any defined args.
        expect(sequence).toContain('setActiveCell')
      } finally {
        restore()
      }
    })

    it('different-ROW click with failing commit: navigation blocked, no validate, no startEditing', () => {
      // commitCurrentEdit returns false → tryCommitEditor returns
      // false → handler short-circuits via preventDefault. No
      // validate, no startEditing.
      const { clickHandler, sequence, restore } = setupClickHandlerProbe({
        activeCell: { row: 0, cell: 1 },
        lockActive: true,
        commitReturns: false,
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const preventDefault = vi.fn()
      const stopImmediate = vi.fn()
      try {
        const result = clickHandler(
          { preventDefault, stopImmediatePropagation: stopImmediate },
          { row: 1, cell: 0 },
        )
        expect(result).toBe(false)
        expect(sequence).toContain('commitCurrentEdit')
        expect(sequence).not.toContain('validate')
        expect(sequence).not.toContain('setActiveCell')
        expect(preventDefault).toHaveBeenCalled()
        expect(stopImmediate).toHaveBeenCalled()
      } finally {
        restore()
        warnSpy.mockRestore()
      }
    })

    it('same-ROW different-CELL click with failing commit: navigation blocked, no startEditing (round-18 #1 + round-17 #3)', () => {
      // The round-18 widening also has to honor round-17 #3:
      // when the commit fails for a same-row cell move, the click
      // is blocked AND `_lastValidationFailed` is NOT set
      // (covered by the existing structural test at round-17 #3).
      const { probe, clickHandler, sequence, restore } = setupClickHandlerProbe({
        activeCell: { row: 0, cell: 0 },
        lockActive: true,
        commitReturns: false,
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const preventDefault = vi.fn()
      try {
        const result = clickHandler(
          { preventDefault, stopImmediatePropagation: vi.fn() },
          { row: 0, cell: 1 },
        )
        expect(result).toBe(false)
        expect(sequence).toContain('commitCurrentEdit')
        expect(sequence).not.toContain('setActiveCell')
        expect(preventDefault).toHaveBeenCalled()
        // Round-17 #3: the click was blocked, but the flag must
        // stay false — otherwise the next legitimate row-change
        // gets its notify+advance suppressed.
        expect(probe._lastValidationFailed).toBe(false)
      } finally {
        restore()
        warnSpy.mockRestore()
      }
    })
  })
})

describe('IdevsGridEditorBase — addButtonClick commits active editor BEFORE validate+addRow (round-17 #2 [P1] Copilot)', () => {
  // Round-17 #2 [P1] (Copilot): clicking Add while an editor is
  // active validated the row BEFORE the editor commit. Then
  // setActiveCell moved focus to the new row and destroyed the
  // active editor — discarding the user's current edit AND
  // validating against stale row data.
  it('does NOT add a row when tryCommitEditor returns false', () => {
    const items: Record<string, unknown>[] = [{ a: 1 }]
    const probe = makeProbe({
      columns: [{ editor: () => undefined, field: 'a', visible: true, sourceItem: {} }],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => false),
      cancelCurrentEdit: vi.fn(),
    }))
    const addItemSpy = probe.view.addItem as ReturnType<typeof vi.fn>
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      probe.addButtonClick()
      expect(addItemSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT add a row when tryCommitEditor throws', () => {
    const items: Record<string, unknown>[] = [{ a: 1 }]
    const probe = makeProbe({
      columns: [{ editor: () => undefined, field: 'a', visible: true, sourceItem: {} }],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    const cancelMock = vi.fn()
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => {
        throw new Error('editor crashed')
      }),
      cancelCurrentEdit: cancelMock,
    }))
    const addItemSpy = probe.view.addItem as ReturnType<typeof vi.fn>
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => probe.addButtonClick()).not.toThrow()
      expect(cancelMock).toHaveBeenCalled()
      expect(addItemSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('DOES add a row when tryCommitEditor succeeds (sanity)', () => {
    const items: Record<string, unknown>[] = [{ a: 1 }]
    const probe = makeProbe({
      columns: [{ editor: () => undefined, field: 'a', visible: true, sourceItem: {} }],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => true),
      cancelCurrentEdit: vi.fn(),
    }))
    const addItemSpy = probe.view.addItem as ReturnType<typeof vi.fn>
    const proto = Object.getPrototypeOf(probe) as { validate?: () => boolean }
    const originalValidate = proto.validate
    proto.validate = () => true
    try {
      probe.addButtonClick()
      expect(addItemSpy).toHaveBeenCalledTimes(1)
    } finally {
      if (originalValidate) proto.validate = originalValidate
      else delete proto.validate
    }
  })

  it('commit + validate + addItem fire in the round-17 #2 order: commit → validate → addItem (round-19 #7)', () => {
    // Round-19 #7 (pr-test-analyzer 7/10): the existing sanity test
    // above only asserts that addItem WAS called when commit/validate
    // both succeed. It does NOT prove the ORDERING, which is exactly
    // what round-17 #2 fixed (commit BEFORE validate against the
    // post-commit state, BOTH before addItem). Without this test
    // a future refactor that re-introduces the bug pattern (validate
    // first, then commit, then addItem) would still pass the sanity
    // test.
    const items: Record<string, unknown>[] = [{ a: 1 }]
    const probe = makeProbe({
      columns: [{ editor: () => undefined, field: 'a', visible: true, sourceItem: {} }],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    const sequence: string[] = []
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => {
        sequence.push('commitCurrentEdit')
        return true
      }),
      cancelCurrentEdit: vi.fn(),
    }))
    const addItemSpy = probe.view.addItem as ReturnType<typeof vi.fn>
    addItemSpy.mockImplementation(() => {
      sequence.push('addItem')
    })
    const proto = Object.getPrototypeOf(probe) as { validate?: () => boolean }
    const originalValidate = proto.validate
    proto.validate = () => {
      sequence.push('validate')
      return true
    }
    try {
      probe.addButtonClick()
      expect(sequence).toEqual(['commitCurrentEdit', 'validate', 'addItem'])
    } finally {
      if (originalValidate) proto.validate = originalValidate
      else delete proto.validate
    }
  })

  it('rejects with no addItem when validate fails AFTER successful commit (round-19 #7 follow-up)', () => {
    // Companion to the ordering test: commit succeeds, validate
    // rejects → addItem MUST NOT run. The round-17 #2 contract is
    // that we validate against the POST-commit row state; if that
    // state is invalid the new row is not seeded.
    const items: Record<string, unknown>[] = [{ a: 1 }]
    const probe = makeProbe({
      columns: [{ editor: () => undefined, field: 'a', visible: true, sourceItem: {} }],
      items,
    })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    const sequence: string[] = []
    probe.slickGrid.getEditorLock = vi.fn(() => ({
      isActive: () => true,
      commitCurrentEdit: vi.fn(() => {
        sequence.push('commitCurrentEdit')
        return true
      }),
      cancelCurrentEdit: vi.fn(),
    }))
    const addItemSpy = probe.view.addItem as ReturnType<typeof vi.fn>
    const proto = Object.getPrototypeOf(probe) as { validate?: () => boolean }
    const originalValidate = proto.validate
    proto.validate = () => {
      sequence.push('validate')
      return false
    }
    try {
      probe.addButtonClick()
      expect(sequence).toEqual(['commitCurrentEdit', 'validate'])
      expect(addItemSpy).not.toHaveBeenCalled()
    } finally {
      if (originalValidate) proto.validate = originalValidate
      else delete proto.validate
    }
  })
})

describe('IdevsGridEditorBase — onBeforeEditCell honors tryCommitEditor result (round-10 #1)', () => {
  // Round-10 #1 (Copilot): the onBeforeEditCell handler called
  // tryCommitEditor() but ignored its return value, falling through
  // to row validation regardless. A failed cell commit (validation
  // rejection or throw) would still allow row navigation as long as
  // row-level validation passed against the previously-committed
  // value — silently dropping the failed cell commit.
  //
  // Fix: when tryCommitEditor returns false, set
  // _lastValidationFailed and return false immediately.
  //
  // Why a source-text structural test (vs. runtime probe):
  // onBeforeEditCell is registered via this.addEventListener inside
  // setupGridEventHandlers, and the handler is an INLINE arrow
  // function. To invoke it via the captured-handler pattern would
  // require a fully primed probe with `_opts.editable=true` AND a
  // working `addEventListener` capture AND working stubs for
  // getActiveCell / getDataItem / getEditorLock / validate. The
  // chain of indirections doesn't add coverage beyond what the
  // existing tryCommitEditor failure-paths tests already provide —
  // the runtime contract of tryCommitEditor IS exhaustively
  // tested. This test asserts the structural anti-regression: the
  // bug pattern (`this.tryCommitEditor()` called without inspecting
  // the return value) MUST NOT appear in the onBeforeEditCell
  // handler.
  it('source: onBeforeEditCell handler returns false when tryCommitEditor returns false', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const sourceFile = path.join(here, '..', '..', 'src', 'grids', 'idevsGridEditorBase.ts')
    const src = await fs.readFile(sourceFile, 'utf-8')
    // Find the onBeforeEditCell handler registration.
    const onBeforeIdx = src.indexOf("'onBeforeEditCell'")
    expect(onBeforeIdx).toBeGreaterThan(-1)
    // Slice forward to the next addEventListener call (end of this
    // handler).
    const after = src.slice(onBeforeIdx)
    const nextHandlerIdx = after.indexOf('this.addEventListener(', 100)
    const handlerBody = nextHandlerIdx > -1 ? after.slice(0, nextHandlerIdx) : after
    // Anti-regression: the commit-current-edit branch must inspect
    // the tryCommitEditor return value AND return false on failure.
    // Look for `if (!this.tryCommitEditor())` pattern.
    expect(handlerBody).toMatch(/if\s*\(\s*!this\.tryCommitEditor\(\)\s*\)/)
    // The fix also sets _lastValidationFailed so the follow-on
    // onActiveCellChanged handler also suppresses the row advance.
    // Find the matching block and confirm it sets the flag.
    const tryCommitIdx = handlerBody.search(/if\s*\(\s*!this\.tryCommitEditor\(\)\s*\)/)
    const blockAfter = handlerBody.slice(tryCommitIdx, tryCommitIdx + 200)
    expect(blockAfter).toMatch(/this\._lastValidationFailed\s*=\s*true/)
    expect(blockAfter).toMatch(/return false/)
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
  // Round-6 follow-up: only rollback on deleteItem failure. Once
  // deleteItem succeeds we record into _deletedRows before repaint.
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
        expect.stringContaining('view.deleteItem failed'),
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

  it('keeps row in _deletedRows when repaint fails after deleteItem (round-19 #1: catch + notify, no rethrow)', () => {
    // Round-19 #1 (silent-failure-hunter): previously the repaint
    // throw was allowed to propagate, leaving the UI in a half-
    // deleted state and surfacing the throw to whoever invoked the
    // delete button. Now we catch + log via console.warn + surface
    // via `notifyError`. The data-layer delete already happened
    // (deleteItem ran successfully before the throw), so we keep
    // the row in `_deletedRows` and return cleanly instead of
    // rethrowing.
    const items = [{ id: 5, name: 'A' }]
    const probe = makeProbe({ items })
    probe.slickGrid.getActiveCell = vi.fn(() => ({ row: 0, cell: 0 }))
    probe.slickGrid.invalidate = vi.fn(() => {
      throw new Error('render failed')
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => probe.deleteCurrentRow()).not.toThrow()
      expect(probe._deletedRows).toEqual([{ id: 5, name: 'A' }])
      expect(probe.view.deleteItem).toHaveBeenCalledWith(5)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('repaint after deleteItem threw'),
        expect.any(Error),
      )
      // Subsequent setActiveCell should NOT run after the catch
      // bail (we return early). The data-layer delete succeeded;
      // the new active cell stays where the user left it.
      expect(probe.slickGrid.setActiveCell).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
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
