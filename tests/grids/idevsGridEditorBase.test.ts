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
    ).toBe(true === false ? true : false) // keep eslint happy with explicit ternary
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
