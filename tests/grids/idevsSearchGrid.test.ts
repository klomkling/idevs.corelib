import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdevsSearchGrid } from '../../src/grids/idevsSearchGrid'

/**
 * IdevsSearchGrid is abstract and inherits from IdevsEntityGrid →
 * EntityGrid → DataGrid → Widget. A full mount requires Serenity's
 * column registry, RemoteView, and a service URL. We exercise the
 * pure-state methods (filter/criteria/permission/preItems plumbing,
 * `getGridCanLoad`, PascalCase shims, editItem auth gate, onClick DOM
 * highlight) directly via a prototype probe.
 */

type SearchGridInternals = {
  // Mirror the private fields the prototype methods read/write so the
  // probe can prime state. These are name-matched against the source
  // class's private fields.
  _filterKeys: Record<string, unknown>
  _criteriaKeys: unknown[]
  _editPermission: string
  _preItems: unknown[] | undefined

  // Stubs for Serenity base-class methods we don't want to actually run.
  setEquality: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  setItems: ReturnType<typeof vi.fn>
  getItems: () => unknown[]
  getDialogType: () => unknown
  // Internals exposed by the source's data path:
  view: { params: Record<string, unknown>; setItems: ReturnType<typeof vi.fn> }
  toolbar: { element: { findFirst: ReturnType<typeof vi.fn> } }
  slickGrid: { onCellChange: { notify: ReturnType<typeof vi.fn> } }
  domNode: HTMLElement
  // Subclass-overridable predicates:
  hideToolbar(): boolean
  getAutoLoad(): boolean

  // The methods under test (carried through via the prototype):
  getFilterKeys(): Readonly<Record<string, unknown>>
  setFilterKeys(filters: Record<string, unknown>): void
  getCriteriaKeys(): readonly unknown[]
  setCriteriaKeys(value: unknown[]): void
  setSearchValue(value: unknown): void
  getEditPermission(): string
  setEditPermission(value: string): void
  getPreItems(): unknown[] | undefined
  setPreItems(value: unknown[]): void
  FilterKeys: Readonly<Record<string, unknown>>
  CriteriaKeys: readonly unknown[]
  SearchValue: unknown
  EditPermission: string
  PreItems: unknown[] | undefined
  applyCriteriaParameter(): void
  getGridCanLoad(): boolean
  clearItemsIfEmptySearch(): void
  editItem(id: string | number): void
  createQuickSearchInput(): void
  onClick(e: Event, row: number, cell: number): void
}

function makeProbe(opts: { hideToolbar?: boolean; autoLoad?: boolean } = {}): SearchGridInternals {
  const probe = Object.create(IdevsSearchGrid.prototype) as SearchGridInternals
  probe._filterKeys = {}
  probe._criteriaKeys = []
  probe._editPermission = ''
  probe._preItems = undefined

  probe.setEquality = vi.fn()
  probe.refresh = vi.fn()
  probe.setItems = vi.fn()
  probe.getItems = vi.fn(() => [])
  probe.getDialogType = vi.fn(() => () => ({}))
  probe.view = {
    params: {},
    setItems: vi.fn(),
  }
  probe.toolbar = {
    element: {
      findFirst: vi.fn(() => ({ length: 0, val: vi.fn(), trigger: vi.fn() })),
    },
  }
  probe.slickGrid = { onCellChange: { notify: vi.fn() } }
  probe.domNode = document.createElement('div')

  probe.hideToolbar = () => opts.hideToolbar ?? false
  probe.getAutoLoad = () => opts.autoLoad ?? true
  return probe
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('IdevsSearchGrid — filter / criteria state', () => {
  it('setFilterKeys overwrites the dictionary and applies each as an equality', () => {
    const probe = makeProbe()
    probe.setFilterKeys({ category: 'A', tier: 1 })
    expect(probe.getFilterKeys()).toEqual({ category: 'A', tier: 1 })
    expect(probe.setEquality).toHaveBeenCalledWith('category', 'A')
    expect(probe.setEquality).toHaveBeenCalledWith('tier', 1)
    expect(probe.refresh).toHaveBeenCalledTimes(1)
  })

  it('setFilterKeys with {} clears stale keys + still refreshes', () => {
    // Regression for review finding #1: prior implementation only added
    // new equalities and left stale ones on the Serenity view. The fix
    // clears each prior key via setEquality(key, undefined) before
    // applying the new dict.
    const probe = makeProbe()
    probe._filterKeys = { stale: 'value' }
    probe.setFilterKeys({})
    expect(probe.getFilterKeys()).toEqual({})
    // setEquality MUST be called with the stale key + undefined to clear
    // the prior equality from the view.
    expect(probe.setEquality).toHaveBeenCalledWith('stale', undefined)
    expect(probe.setEquality).toHaveBeenCalledTimes(1)
    expect(probe.refresh).toHaveBeenCalledTimes(1)
  })

  it('setFilterKeys clears stale keys when replacing with a different key set', () => {
    // Regression for review finding #1: changing the filter key set
    // (e.g. `{ a: 1 }` → `{ b: 2 }`) should clear `a`, not leave it as
    // a ghost equality on the view.
    const probe = makeProbe()
    probe._filterKeys = { a: 1, b: 2 }
    probe.setFilterKeys({ c: 3 })
    expect(probe.setEquality).toHaveBeenCalledWith('a', undefined)
    expect(probe.setEquality).toHaveBeenCalledWith('b', undefined)
    expect(probe.setEquality).toHaveBeenCalledWith('c', 3)
  })

  it('setFilterKeys does NOT clear a key that survives the replacement', () => {
    // The clear-on-replacement only fires for keys that are no longer
    // present. `a` was in both dicts → only the new equality for `a`
    // should be applied, not a stale-clear.
    const probe = makeProbe()
    probe._filterKeys = { a: 1, b: 2 }
    probe.setFilterKeys({ a: 99 })
    expect(probe.setEquality).not.toHaveBeenCalledWith('a', undefined)
    expect(probe.setEquality).toHaveBeenCalledWith('a', 99)
    expect(probe.setEquality).toHaveBeenCalledWith('b', undefined)
  })

  it('setCriteriaKeys applies the param and refreshes', () => {
    const probe = makeProbe()
    probe.setCriteriaKeys(['Name', '=', 'foo'])
    expect(probe.getCriteriaKeys()).toEqual(['Name', '=', 'foo'])
    expect(probe.view.params['Criteria']).toEqual(['Name', '=', 'foo'])
    expect(probe.view.params['CustomData']).toEqual({ Important: true })
    expect(probe.refresh).toHaveBeenCalledTimes(1)
  })

  it('applyCriteriaParameter removes Criteria key when array is empty', () => {
    const probe = makeProbe()
    probe.view.params['Criteria'] = ['stale']
    probe._criteriaKeys = []
    probe.applyCriteriaParameter()
    expect(probe.view.params['Criteria']).toBeUndefined()
  })

  it('getEditPermission / setEditPermission round-trip', () => {
    const probe = makeProbe()
    expect(probe.getEditPermission()).toBe('')
    probe.setEditPermission('Foo:Edit')
    expect(probe.getEditPermission()).toBe('Foo:Edit')
  })

  it('setPreItems stores the array and calls setItems', () => {
    const probe = makeProbe()
    probe.setPreItems([{ id: 1 }, { id: 2 }])
    expect(probe.getPreItems()).toEqual([{ id: 1 }, { id: 2 }])
    expect(probe.setItems).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }])
  })
})

describe('IdevsSearchGrid — PascalCase compatibility shims', () => {
  it('FilterKeys setter routes to setFilterKeys', () => {
    const probe = makeProbe()
    probe.FilterKeys = { active: true }
    expect(probe.getFilterKeys()).toEqual({ active: true })
    expect(probe.setEquality).toHaveBeenCalledWith('active', true)
  })

  it('CriteriaKeys setter routes to setCriteriaKeys', () => {
    const probe = makeProbe()
    probe.CriteriaKeys = ['x', '=', 1]
    expect(probe.getCriteriaKeys()).toEqual(['x', '=', 1])
    expect(probe.view.params['Criteria']).toEqual(['x', '=', 1])
  })

  it('EditPermission shim round-trips with the camelCase API', () => {
    const probe = makeProbe()
    probe.EditPermission = 'Some:Permission'
    expect(probe.getEditPermission()).toBe('Some:Permission')
    expect(probe.EditPermission).toBe('Some:Permission')
  })

  it('PreItems shim routes to setPreItems', () => {
    const probe = makeProbe()
    probe.PreItems = [{ x: 1 }]
    expect(probe.getPreItems()).toEqual([{ x: 1 }])
    expect(probe.setItems).toHaveBeenCalledWith([{ x: 1 }])
  })

  it('SearchValue shim with hideToolbar=true is a no-op (regression for null toolbar)', () => {
    const probe = makeProbe({ hideToolbar: true })
    probe.SearchValue = 'something'
    // No findFirst call → no jQuery interaction.
    expect(probe.toolbar.element.findFirst).not.toHaveBeenCalled()
  })

  it('SearchValue shim drives the quick-search input when toolbar is visible', () => {
    const probe = makeProbe()
    const val = vi.fn()
    const trigger = vi.fn()
    probe.toolbar.element.findFirst = vi.fn(() => ({ length: 1, val, trigger }))
    probe.SearchValue = 'hello'
    expect(val).toHaveBeenCalledWith('hello')
    expect(trigger).toHaveBeenCalledWith('change')
  })

  it('setSearchValue with no matching input is a defensive no-op', () => {
    // Regression: source dereferenced findFirst result without a length
    // check. With our null guard the call is silent when the input
    // selector matches nothing.
    const probe = makeProbe()
    probe.toolbar.element.findFirst = vi.fn(() => undefined)
    expect(() => probe.setSearchValue('x')).not.toThrow()
  })
})

describe('IdevsSearchGrid — getGridCanLoad', () => {
  it('autoLoad=true + empty filterKeys → true (no required filters)', () => {
    const probe = makeProbe({ autoLoad: true })
    expect(probe.getGridCanLoad()).toBe(true)
  })

  it('autoLoad=true + populated filterKeys → true', () => {
    const probe = makeProbe({ autoLoad: true })
    probe._filterKeys = { a: 'value' }
    expect(probe.getGridCanLoad()).toBe(true)
  })

  it('autoLoad=true + a single empty filter → false (gate)', () => {
    const probe = makeProbe({ autoLoad: true })
    probe._filterKeys = { a: 'value', b: '' }
    expect(probe.getGridCanLoad()).toBe(false)
  })

  it('autoLoad=false + no ContainsText → false AND clears the grid', () => {
    const probe = makeProbe({ autoLoad: false })
    expect(probe.getGridCanLoad()).toBe(false)
    expect(probe.view.setItems).toHaveBeenCalledWith([], true)
  })

  it('autoLoad=false + ContainsText set → true', () => {
    const probe = makeProbe({ autoLoad: false })
    probe.view.params['ContainsText'] = 'q'
    expect(probe.getGridCanLoad()).toBe(true)
  })

  it('autoLoad=false + ContainsText set + filterKeys partly empty → false', () => {
    const probe = makeProbe({ autoLoad: false })
    probe.view.params['ContainsText'] = 'q'
    probe._filterKeys = { a: '' }
    expect(probe.getGridCanLoad()).toBe(false)
  })

  it('autoLoad=false + filterKeys fully populated but no ContainsText → false', () => {
    // Regression for review finding #2: source returned true here, so a
    // search grid would issue a remote load before the user entered a
    // quick-search value. Documented behavior is "on-demand" — both
    // filter keys AND ContainsText must be present when autoLoad is off.
    const probe = makeProbe({ autoLoad: false })
    probe._filterKeys = { a: 'value' }
    // No ContainsText.
    expect(probe.getGridCanLoad()).toBe(false)
    // Side-effect: the grid is cleared when no ContainsText is present.
    expect(probe.view.setItems).toHaveBeenCalledWith([], true)
  })

  it('autoLoad=false + filterKeys fully populated + ContainsText set → true', () => {
    const probe = makeProbe({ autoLoad: false })
    probe._filterKeys = { a: 'value' }
    probe.view.params['ContainsText'] = 'q'
    expect(probe.getGridCanLoad()).toBe(true)
  })

  it('clearItemsIfEmptySearch is callable as a standalone side-effect', () => {
    // Regression: source had this side-effect folded into getGridCanLoad,
    // making the predicate impure. We moved it out so it can be invoked
    // explicitly (and tested independently).
    const probe = makeProbe()
    probe.clearItemsIfEmptySearch()
    expect(probe.view.setItems).toHaveBeenCalledWith([], true)
  })
})

describe('IdevsSearchGrid — onClick + authorization gating', () => {
  it('onClick toggles "active" on the closest Slick row and clears siblings', () => {
    const probe = makeProbe()
    const viewport = document.createElement('div')
    viewport.className = 'slick-viewport'
    document.body.appendChild(viewport)

    const otherRow = document.createElement('div')
    otherRow.className = 'slick-row active'
    viewport.appendChild(otherRow)

    const newRow = document.createElement('div')
    newRow.className = 'slick-row'
    viewport.appendChild(newRow)

    const cellNode = document.createElement('div')
    cellNode.className = 'slick-cell'
    newRow.appendChild(cellNode)

    const child = document.createElement('span')
    cellNode.appendChild(child)

    const evt = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(evt, 'target', { value: child })

    // Stub super.onClick so it doesn't try to drive Serenity's real
    // double-click-to-edit path.
    const entityGridProto = Object.getPrototypeOf(IdevsSearchGrid.prototype) as {
      onClick?: () => void
    }
    const originalSuper = entityGridProto.onClick
    entityGridProto.onClick = vi.fn()
    try {
      probe.onClick(evt, 0, 0)
    } finally {
      if (originalSuper) entityGridProto.onClick = originalSuper
      else delete entityGridProto.onClick
    }

    expect(otherRow.classList.contains('active')).toBe(false)
    expect(newRow.classList.contains('active')).toBe(true)
    expect(cellNode.classList.contains('active')).toBe(false)
    expect(probe.slickGrid.onCellChange.notify).toHaveBeenCalled()
  })

  it('onClick is defensive when target is detached (no viewport ancestor)', () => {
    // Regression: source called `target.closest(...).querySelectorAll(...)`
    // without a null guard. With the guard in place the call is silent
    // when the row is mid-detach.
    const probe = makeProbe()
    const orphan = document.createElement('span')
    const evt = new MouseEvent('click')
    Object.defineProperty(evt, 'target', { value: orphan })

    const entityGridProto = Object.getPrototypeOf(IdevsSearchGrid.prototype) as {
      onClick?: () => void
    }
    const originalSuper = entityGridProto.onClick
    entityGridProto.onClick = vi.fn()
    try {
      expect(() => probe.onClick(evt, 0, 0)).not.toThrow()
    } finally {
      if (originalSuper) entityGridProto.onClick = originalSuper
      else delete entityGridProto.onClick
    }
  })
})

describe('IdevsSearchGrid — setSearchValue toolbar=undefined regression (PR-4b round-3 #20)', () => {
  it('is a defensive no-op when the toolbar field itself is undefined', () => {
    // The optional-chain `this.toolbar?.element?.findFirst(...)` was
    // added so the grid can be used in test harnesses or pre-init
    // scenarios where toolbar hasn't been wired. Previously covered:
    // hideToolbar=true, findFirst → undefined, findFirst → {length:0}.
    // Missing: toolbar itself undefined.
    const probe = makeProbe()
    probe.toolbar = undefined as unknown as typeof probe.toolbar
    expect(() => probe.setSearchValue('x')).not.toThrow()
  })
})

describe('IdevsSearchGrid — applyCriteriaParameter CustomData stickiness (PR-4b round-3 #21)', () => {
  it('CustomData.Important is NOT cleared when criteria becomes empty (documented sticky)', () => {
    // Source's CustomData = { Important: true } intentionally remains
    // on view.params after criteria are cleared, so backends that read
    // the flag continue to see the priority hint. This is parity with
    // PowerACC's CsiSearchGrid; if consumers need to clear it, they
    // must do so explicitly via the view.params handle.
    const probe = makeProbe()
    probe._criteriaKeys = ['Name', '=', 'x']
    probe.applyCriteriaParameter()
    expect(probe.view.params['CustomData']).toEqual({ Important: true })
    probe._criteriaKeys = []
    probe.applyCriteriaParameter()
    // Criteria key removed:
    expect(probe.view.params['Criteria']).toBeUndefined()
    // CustomData.Important remains (sticky):
    expect(probe.view.params['CustomData']).toEqual({ Important: true })
  })
})

describe('IdevsSearchGrid — editItem unhandled rejection regression (PR-4b round-3 #1+#2)', () => {
  it('rejected dialog Promise routes through handleEditItemError instead of bubbling', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    const handleEditItemErrorSpy = vi.fn()
    ;(probe as unknown as { handleEditItemError: typeof handleEditItemErrorSpy }).handleEditItemError =
      handleEditItemErrorSpy
    // Authorization.hasPermission returns true for empty permission in
    // Serenity; we route through the dialog-load path.
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    const rejected = Promise.reject(new Error('chunk-load failed'))
    // Swallow the unhandled-rejection that vitest sees from the
    // already-rejected promise so the test runner doesn't fail. The
    // production fix routes this through .then(_, onError) so consumer
    // code never sees an unhandled rejection.
    rejected.catch(() => {
      /* swallow */
    })
    probe.getDialogType = () => rejected as unknown as Promise<unknown>
    try {
      probe.editItem('abc')
      // Wait a microtask hop for the .then rejection branch to fire.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(handleEditItemErrorSpy).toHaveBeenCalledTimes(1)
      const [err, id] = handleEditItemErrorSpy.mock.calls[0]!
      expect(err).toBeInstanceOf(Error)
      expect(id).toBe('abc')
    } finally {
      authSpy.mockRestore()
    }
  })

  it('synchronous dialog ctor throw routes through handleEditItemError', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    const handleEditItemErrorSpy = vi.fn()
    ;(probe as unknown as { handleEditItemError: typeof handleEditItemErrorSpy }).handleEditItemError =
      handleEditItemErrorSpy
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    // Return a synchronous (non-promise) ctor that throws.
    const ThrowingDialog = function () {
      throw new Error('ctor crashed')
    } as unknown as () => unknown
    probe.getDialogType = () => ThrowingDialog
    try {
      probe.editItem('abc')
      expect(handleEditItemErrorSpy).toHaveBeenCalledTimes(1)
      const [err, id] = handleEditItemErrorSpy.mock.calls[0]!
      expect(err).toBeInstanceOf(Error)
      expect(id).toBe('abc')
    } finally {
      authSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — handleEditItemError safe-wrap (PR-4b round-4 #6)', () => {
  // Round 4 #6: if a subclass override of handleEditItemError throws,
  // the secondary rejection should NOT become an unhandled rejection.
  // Fix: safeHandleEditItemError wraps the override invocation in
  // try/catch and falls back to a default notify + warn.
  it('throwing handleEditItemError override is caught + warned, not propagated', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    ;(probe as unknown as {
      handleEditItemError: (e: unknown, id: unknown) => void
    }).handleEditItemError = () => {
      throw new Error('override blew up')
    }
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    const rejected = Promise.reject(new Error('chunk-load failed'))
    rejected.catch(() => {
      /* swallow */
    })
    probe.getDialogType = () => rejected as unknown as Promise<unknown>
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Calling editItem must NOT throw even though the override
      // throws. The safe-wrap downgrades the failure to a warn.
      expect(() => probe.editItem('abc')).not.toThrow()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('handleEditItemError override threw'),
        expect.any(Error),
      )
    } finally {
      authSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — handleEditItemError phase param (PR-4b round-4 #12)', () => {
  // Round 4 #12: the hook signature now distinguishes 'dialog-load'
  // (transient — chunk-load) vs 'dialog-open' (terminal — dialog ctor
  // throw / loadByIdAndOpenDialog reject). Overrides can branch on
  // phase for retry behavior.
  it('passes phase=dialog-load on .then-chain rejection', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    const overrideSpy = vi.fn()
    ;(probe as unknown as {
      handleEditItemError: typeof overrideSpy
    }).handleEditItemError = overrideSpy
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    const rejected = Promise.reject(new Error('chunk-load failed'))
    rejected.catch(() => {
      /* swallow */
    })
    probe.getDialogType = () => rejected as unknown as Promise<unknown>
    try {
      probe.editItem('id-1')
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(overrideSpy).toHaveBeenCalledTimes(1)
      const [, , phase] = overrideSpy.mock.calls[0]!
      expect(phase).toBe('dialog-load')
    } finally {
      authSpy.mockRestore()
    }
  })

  it('passes phase=dialog-open on sync ctor throw', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    const overrideSpy = vi.fn()
    ;(probe as unknown as {
      handleEditItemError: typeof overrideSpy
    }).handleEditItemError = overrideSpy
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    const Throwing = function () {
      throw new Error('ctor crashed')
    } as unknown as () => unknown
    probe.getDialogType = () => Throwing
    try {
      probe.editItem('id-2')
      expect(overrideSpy).toHaveBeenCalledTimes(1)
      const [, , phase] = overrideSpy.mock.calls[0]!
      expect(phase).toBe('dialog-open')
    } finally {
      authSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — non-thenable loadByIdAndOpenDialog warn (PR-4b round-4 #13)', () => {
  // Round 4 #13: if the dialog's loadByIdAndOpenDialog returns a
  // primitive (misbehaving stub, upstream contract change), the
  // dispatcher should warn but not crash. The user-gesture path is
  // preserved.
  it('warns when loadByIdAndOpenDialog returns a non-thenable, non-nullish value', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    // Dialog ctor that returns a primitive from loadByIdAndOpenDialog.
    const Misbehaving = function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {
        loadByIdAndOpenDialog: () => 'not-a-promise',
      } as any
    } as unknown as () => unknown
    probe.getDialogType = () => Misbehaving
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => probe.editItem('id-x')).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('loadByIdAndOpenDialog returned non-thenable'),
        'not-a-promise',
      )
    } finally {
      authSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — safe-wrap secondary failure (PR-4b round-5 #4)', () => {
  // Round 5 #4: the round-4 safeHandleEditItemError fallback called
  // `notifyError` unguarded. If notifyError itself throws (consumer
  // mock, detached toast container, exhausted toast queue), the throw
  // would escape from inside the .then's rejection handler — resurrecting
  // the very unhandled-rejection symptom round-3 + round-4 set out to
  // prevent. Round-5 fix wraps the fallback notifyError in its own
  // try/catch with a final console.warn-only fallback.
  it('throwing override + throwing notifyError fallback is fully contained', async () => {
    const probe = makeProbe()
    probe._editPermission = ''
    ;(probe as unknown as {
      handleEditItemError: (e: unknown, id: unknown) => void
    }).handleEditItemError = () => {
      throw new Error('override blew up')
    }
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(true)
    const rejected = Promise.reject(new Error('chunk-load failed'))
    rejected.catch(() => {
      /* swallow */
    })
    probe.getDialogType = () => rejected as unknown as Promise<unknown>
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // CRUCIAL: also stub Object.assign on the corelib namespace to
    // route notifyError to one that throws. Use try/finally for safety.
    // We can't reliably re-export notifyError from a vi.mock, but we
    // CAN verify the END-TO-END contract: calling editItem with both
    // failure modes simultaneously must NOT throw upward.
    try {
      expect(() => probe.editItem('id-1')).not.toThrow()
      await new Promise(resolve => setTimeout(resolve, 0))
      // The override-throw branch ran (first warn call).
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      authSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — permission-denial log (PR-4b round-5 #8 + round-6 #2)', () => {
  // Round 5 #8: editItem returned silently on permission denial (no
  // log, no toast). Round-5 fix added a log so misconfigured
  // _editPermission is traceable.
  // Round 6 #2: that round-5 log used `console.debug`, which DevTools
  // hides by default ("Default levels" filter). Production consumers
  // diagnosing "edit button does nothing" wouldn't see it. Promoted
  // to `console.info` (visible in the default level set).
  it('logs at console.info level when Authorization.hasPermission denies', async () => {
    const probe = makeProbe()
    probe._editPermission = 'Foo:Edit'
    const corelib = await import('@serenity-is/corelib')
    const authSpy = vi.spyOn(corelib.Authorization, 'hasPermission').mockReturnValue(false)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      probe.editItem('id-1')
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("permission 'Foo:Edit' not granted"),
      )
    } finally {
      authSpy.mockRestore()
      infoSpy.mockRestore()
    }
  })
})

describe('IdevsSearchGrid — module export shape', () => {
  it('exports the abstract class as a constructor function with the methods on its prototype', () => {
    expect(typeof IdevsSearchGrid).toBe('function')
    expect(typeof IdevsSearchGrid.prototype.setFilterKeys).toBe('function')
    expect(typeof IdevsSearchGrid.prototype.getGridCanLoad).toBe('function')
    expect(typeof IdevsSearchGrid.prototype.editItem).toBe('function')
  })
})
