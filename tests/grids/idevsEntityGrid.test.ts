import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridOptions } from '@serenity-is/sleekgrid'
import { IdevsEntityGrid } from '../../src/grids/idevsEntityGrid'

/**
 * IdevsEntityGrid is a thin wrapper that only overrides getSlickOptions.
 * A full Serenity DataGrid/EntityGrid mount requires SlickGrid + a service
 * URL + a column collection, which is more harness than this 1-method
 * class warrants. We exercise the override directly via the prototype.
 *
 * Because the override calls `super.getSlickOptions()`, the runtime walks
 * up to EntityGrid.prototype to find the inherited method. We stub that
 * inherited method per-test and restore in afterEach to keep tests
 * isolated from each other (and from any other test file that touches
 * EntityGrid).
 */

// EntityGrid.prototype — the [[Prototype]] of IdevsEntityGrid.prototype.
// Walking this dynamically (rather than importing EntityGrid directly)
// keeps the test resilient if Serenity ever inserts an intermediate
// abstract base between IdevsEntityGrid and EntityGrid.
const ENTITY_GRID_PROTO = Object.getPrototypeOf(IdevsEntityGrid.prototype) as {
  getSlickOptions?: () => GridOptions
}
let originalGetSlickOptions: (() => GridOptions) | undefined

beforeEach(() => {
  originalGetSlickOptions = ENTITY_GRID_PROTO.getSlickOptions
})

afterEach(() => {
  // Restore (or delete if there was no original — defensive in case the
  // npm dist doesn't include the method on a particular Serenity version).
  if (originalGetSlickOptions) {
    ENTITY_GRID_PROTO.getSlickOptions = originalGetSlickOptions
  } else {
    delete ENTITY_GRID_PROTO.getSlickOptions
  }
})

function makeGridProbe(parentOptions: GridOptions): { getSlickOptions(): GridOptions } {
  ENTITY_GRID_PROTO.getSlickOptions = vi.fn(() => parentOptions)
  return Object.create(IdevsEntityGrid.prototype) as { getSlickOptions(): GridOptions }
}

describe('IdevsEntityGrid', () => {
  it('returns renderAllRows: true layered on top of super.getSlickOptions()', () => {
    const probe = makeGridProbe({ enableCellNavigation: true } as GridOptions)
    const result = probe.getSlickOptions()
    expect(result).toMatchObject({ enableCellNavigation: true, renderAllRows: true })
  })

  it('does not mutate the parent options object (regression for cached-singleton parents)', () => {
    // If a future Serenity EntityGrid returns a shared cached options
    // object, mutating it in-place would leak state across grid instances.
    // The implementation must spread.
    const parentOptions: GridOptions = { autoEdit: false } as GridOptions
    const probe = makeGridProbe(parentOptions)
    probe.getSlickOptions()
    expect(
      (parentOptions as GridOptions & { renderAllRows?: boolean }).renderAllRows,
    ).toBeUndefined()
  })

  it('forwards any parent option keys unchanged', () => {
    const probe = makeGridProbe({
      enableCellNavigation: true,
      autoEdit: true,
      editable: false,
    } as GridOptions)
    const result = probe.getSlickOptions()
    expect(result.enableCellNavigation).toBe(true)
    expect(result.autoEdit).toBe(true)
    expect(result.editable).toBe(false)
    expect((result as GridOptions & { renderAllRows: boolean }).renderAllRows).toBe(true)
  })
})

describe('IdevsEntityGrid — module export shape', () => {
  it('exports the class as a constructor function with the override on its prototype', () => {
    expect(typeof IdevsEntityGrid).toBe('function')
    expect(typeof IdevsEntityGrid.prototype.getSlickOptions).toBe('function')
  })
})
