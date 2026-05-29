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

// Round-19 #9 (type-design-analyzer): the `id?: string` field on
// GridColumn was added in round-17 #4 to model SlickGrid's
// header `data-id` attribute correctly (which stores `column.id`,
// not `column.field`). The strict-TS compile gate had no assertion
// proving the shape includes `id` — so a future inadvertent removal
// would surface as a runtime failure in `findColumnByDataId` rather
// than at type-check.
//
// These assertions require:
//   1. `id` is optional (assigning `undefined` must compile).
//   2. `id` is a string when defined.
//   3. `hasField` narrowing does NOT widen / strip `id`.
declare const withId: GridColumn

// (1) Optional — undefined assignment must compile.
const idMaybe: string | undefined = withId.id
void idMaybe

// (2) Object literal with explicit `id: string` must satisfy GridColumn.
const explicitId: GridColumn = { id: 'my-col', field: 'myField' }
void explicitId

// (3) Object literal WITHOUT `id` must still satisfy GridColumn (back-compat
// for columns that don't set `id`).
const noId: GridColumn = { field: 'myField' }
void noId

// (4) Round-17 #4 contract: `id` stays optional on GridColumnWithField too
// (the predicate narrows `field`, not `id`).
if (hasField(withId)) {
  const narrowedId: string | undefined = withId.id
  void narrowedId
}
