import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridOptions } from '@serenity-is/sleekgrid'

/**
 * `@serenity-is/extensions` is not on npm — it only ships via Serenity's
 * .NET install. Our test harness doesn't have it resolvable, so we mock
 * the module at the import boundary with a minimal SelectableEntityGrid
 * surface that mirrors the ambient declaration in
 * `src/types/serenityExtensions.d.ts`.
 *
 * The mock must be installed BEFORE importing the source file, hence the
 * dynamic import inside the test setup.
 */
vi.mock('@serenity-is/extensions', () => {
  class FakeSelectableEntityGrid {
    protected getSlickOptions(): GridOptions {
      // Default fake parent options; per-test stubbing happens by
      // overwriting this method on the prototype before each test.
      return {} as GridOptions
    }
  }
  return { SelectableEntityGrid: FakeSelectableEntityGrid }
})

// Dynamic import deferred until after vi.mock above is registered.
// Top-level imports would resolve before the mock factory runs.
type IdevsSelectableEntityGridCtor = new (...args: unknown[]) => {
  getSlickOptions(): GridOptions
}
let IdevsSelectableEntityGrid: IdevsSelectableEntityGridCtor
let SelectableEntityGrid: { prototype: { getSlickOptions(): GridOptions } }

beforeEach(async () => {
  const mod = (await import('../../src/grids/idevsSelectableEntityGrid')) as unknown as {
    IdevsSelectableEntityGrid: IdevsSelectableEntityGridCtor
  }
  IdevsSelectableEntityGrid = mod.IdevsSelectableEntityGrid
  const ext = (await import('@serenity-is/extensions')) as unknown as {
    SelectableEntityGrid: { prototype: { getSlickOptions(): GridOptions } }
  }
  SelectableEntityGrid = ext.SelectableEntityGrid
})

afterEach(() => {
  // Reset the mocked parent's getSlickOptions between tests so leaked
  // stubs from one test can't influence another.
  SelectableEntityGrid.prototype.getSlickOptions = function () {
    return {} as GridOptions
  }
})

function makeGridProbe(parentOptions: GridOptions): { getSlickOptions(): GridOptions } {
  SelectableEntityGrid.prototype.getSlickOptions = vi.fn(() => parentOptions)
  return Object.create(IdevsSelectableEntityGrid.prototype) as {
    getSlickOptions(): GridOptions
  }
}

describe('IdevsSelectableEntityGrid', () => {
  it('returns renderAllRows: true layered on top of super.getSlickOptions()', () => {
    const probe = makeGridProbe({ enableCellNavigation: true } as GridOptions)
    const result = probe.getSlickOptions()
    expect(result).toMatchObject({ enableCellNavigation: true, renderAllRows: true })
  })

  it('does not mutate the parent options object', () => {
    const parentOptions: GridOptions = { autoEdit: false } as GridOptions
    const probe = makeGridProbe(parentOptions)
    probe.getSlickOptions()
    expect(
      (parentOptions as GridOptions & { renderAllRows?: boolean }).renderAllRows,
    ).toBeUndefined()
  })

  it('drops the dead csiUpdateInterface method (regression vs PowerACC source)', () => {
    // Source had `protected csiUpdateInterface(domNode)` with an
    // empty-body setTimeout — pure dead code. The port should not
    // carry it forward.
    expect(
      (IdevsSelectableEntityGrid.prototype as unknown as Record<string, unknown>)[
        'csiUpdateInterface'
      ],
    ).toBeUndefined()
  })
})

describe('IdevsSelectableEntityGrid — module export shape', () => {
  it('exports the class as a constructor function with the override on its prototype', () => {
    expect(typeof IdevsSelectableEntityGrid).toBe('function')
    expect(typeof IdevsSelectableEntityGrid.prototype.getSlickOptions).toBe('function')
  })
})
