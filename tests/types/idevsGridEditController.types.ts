import type { EntityGrid } from '@serenity-is/corelib'
import type { IdevsGridEditControllerOptions } from '../../src/grids/idevsGridEditController'
import {
  hasField,
  type GridColumn,
  type GridColumnWithField,
} from '../../src/grids/_columnShape'

type MyRow = {
  id: number
  name: string
}

type MyOptions = {
  readOnly?: boolean
}

declare const typedGrid: EntityGrid<MyRow, MyOptions>

// Variance regression: typed EntityGrid must assign to the options'
// generic-parameterized grid field without casting.
const options: IdevsGridEditControllerOptions = {
  grid: typedGrid,
}

void options

// `hasField` type-predicate narrowing assertion. After the call returns
// true in the if-branch, `column.field` must be `string` (not optional).
declare const someColumn: GridColumn
if (hasField(someColumn)) {
  // `someColumn` is narrowed to GridColumnWithField — `.field` is now
  // unambiguously a string. The following line must type-check without
  // a cast.
  const fieldName: string = someColumn.field
  void fieldName
  // And `someColumn` itself is assignable to GridColumnWithField.
  const narrowed: GridColumnWithField = someColumn
  void narrowed
}
