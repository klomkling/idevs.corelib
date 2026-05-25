import { vi } from 'vitest'

/**
 * Minimal stub satisfying the SlickGrid surface that SearchButtonEditor's
 * Slick adapter touches: editor-lock commit, navigation, cell change.
 */
export type StubSlickGrid = {
  getEditorLock: () => { commitCurrentEdit: () => boolean }
  getActiveCell: () => { row: number; cell: number } | null
  navigateNext: () => boolean
  editActiveCell: () => void
  getDataItem: (row: number) => Record<string, unknown> | undefined
  onCellChange: {
    notify: (event: { row: number; cell: number; item: Record<string, unknown> }) => void
  }
}

export function createEntityGridStub(opts: { items?: Record<string, unknown>[] } = {}) {
  const items = opts.items ?? []
  let activeCell: { row: number; cell: number } | null = { row: 0, cell: 0 }

  const slickGrid: StubSlickGrid = {
    getEditorLock: vi.fn(() => ({ commitCurrentEdit: vi.fn(() => true) })),
    getActiveCell: vi.fn(() => activeCell),
    navigateNext: vi.fn(() => {
      if (activeCell) activeCell = { row: activeCell.row, cell: activeCell.cell + 1 }
      return true
    }),
    editActiveCell: vi.fn(),
    getDataItem: vi.fn((row: number) => items[row]),
    onCellChange: { notify: vi.fn() },
  }

  return {
    slickGrid,
    setActiveCell(cell: { row: number; cell: number } | null) {
      activeCell = cell
    },
  }
}
