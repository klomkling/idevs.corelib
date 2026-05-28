import type { EntityGrid } from '@serenity-is/corelib'
import type { IdevsGridEditControllerOptions } from '../../src/grids/idevsGridEditController'

type MyRow = {
  id: number
  name: string
}

type MyOptions = {
  readOnly?: boolean
}

declare const typedGrid: EntityGrid<MyRow, MyOptions>

const options: IdevsGridEditControllerOptions = {
  grid: typedGrid,
}

void options
