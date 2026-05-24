import { Column } from '@serenity-is/sleekgrid'
import { indexOf, tryFirst } from '@serenity-is/corelib'
import { EntityGrid, ToolButton } from '@serenity-is/corelib'

/**
 * Use GetGridHelper within function layout()
 * Put the line before super.layout()
 * In case of master/detail form use this function within function getButtons() or getColumns()
 * @param helper
 * @constructor
 */
export function GetGridHelper(helper: GridHelper): GridHelper {
  if (helper) {
    return helper
  }

  return new GridHelper()
}

export class GridHelper {
  /**
   * Use this function within function getColumns()
   * @param columns
   * @param removeColumns
   */
  public getColumns(columns: Column[], ...removeColumns: string[]): Column[] {
    for (const column of removeColumns) {
      columns.splice(
        indexOf(columns, c => c.field === column),
        1
      )
    }

    const id = tryFirst(columns, c => c.field === 'Id')
    if (id) {
      columns.splice(
        indexOf(columns, c => c.field === 'Id'),
        1
      )
    }

    return columns
  }

  /**
   * Use this function within function getButtons()
   * @param buttons
   * @param removeButtons
   */
  public getButtons(buttons: ToolButton[], ...removeButtons: string[]): ToolButton[] {
    for (const btn of removeButtons) {
      const id = indexOf(buttons, x => x.cssClass === btn)
      if (id >= 0) {
        buttons.splice(id, 1)
      }
    }

    return buttons
  }

  /**
   * Use this function within updateInterface method
   * Put below super.updateInterface() line
   * @param columns
   */
  public setHeaderAlignment(...columns: IHeaderAlignment[]): void {
    for (let c = 0; c < columns.length; c++) {
      const column: IHeaderAlignment = columns[c]
      const header = document.querySelector(
        `.slick-header-columns div[id$="${column.column}"] .slick-column-name`
      )
      if (header) {
        header.classList.add('text-center')
      }
    }
  }

  /**
   * Use this function within constructor
   * @param grid
   * @param options
   */
  public initGrid<TItem, TOptions>(
    grid: EntityGrid<TItem, TOptions>,
    options?: IInitGridOptions
  ): void {
    // Set auto column width
    if (options?.autoColumnWidth ?? true) {
      const g = grid.getGrid()
      g.autosizeColumns()
    }

    // get dialog mode
    grid.openDialogsAsPanel = (options?.dialogMode ?? true) === false
  }
}

export type IInitGridOptions = {
  autoColumnWidth?: boolean
  dialogMode?: boolean
}

export type IHeaderAlignment = {
  column: string
  textAlign: HeaderTextAlignments
}

export enum HeaderTextAlignments {
  Left = 0,
  Center = 1,
  Right = 2,
}
