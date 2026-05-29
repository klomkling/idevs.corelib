/**
 * Shared structural SlickGrid `Column` shape, used by IdevsGridEditController
 * and IdevsGridEditorBase to avoid the duplicate-`@serenity-is/sleekgrid`
 * type-incompatibility issue at our type-boundary.
 *
 * Background:
 *
 *   - Our `@serenity-is/sleekgrid` devDep resolves to 1.9.8 at the top
 *     level, but `@serenity-is/corelib` (npm) bundles a nested copy at
 *     `node_modules/@serenity-is/corelib/node_modules/@serenity-is/sleekgrid`
 *     pinned to 1.9.6. The two `Column<any>` types declare separate
 *     private fields, so a value of one is not structurally assignable
 *     to the other across module boundaries.
 *
 *   - Methods from corelib (e.g. `slickGrid.getColumns()`) return
 *     `Column[]` typed against the NESTED copy. If we annotate our
 *     local references with the top-level Column type, every cross-
 *     boundary assignment fails. If we annotate with the nested type,
 *     consumers can't import it without nominally walking corelib's
 *     internal node_modules.
 *
 *   - The pragmatic workaround is to declare a local structural alias
 *     covering only the Column fields our code reads. This file is the
 *     single source of truth so the alias doesn't drift between the
 *     controller and the editor base.
 *
 * Long-term fix: dedupe sleekgrid via `package.json#overrides`. Until
 * then, this shared alias is the supported shape both port files MUST
 * import (do not re-declare locally).
 *
 * @internal — Not exported from the `@idevs/corelib` barrel; consumers
 * should not depend on this shape.
 */

/**
 * Editor constructor shape used for narrowing `editorType` without
 * importing the real `EditorClass` from the nested-corelib sleekgrid
 * copy (which would re-introduce the duplicate-type incompatibility).
 * Structural minimum: any function-like value invokable as `new`.
 */
export type GridEditorCtor = new (...args: never[]) => unknown

/**
 * Subset of Serenity's `PropertyItem` that we actually consume from
 * `Column.sourceItem`.
 *
 * `editorType` is typed as the union it really takes in Serenity
 * (`string | EditorClass | PromiseLike<EditorClass>`) so consumers
 * don't need to widen to `unknown`. The dispatcher narrows to the
 * string case via `typeof === 'string'`. The union stays structurally
 * assignable from Serenity's `PropertyItem.editorType` because the
 * latter's `EditorClass` is itself a `new (...) => unknown`-shaped
 * value, satisfying `GridEditorCtor`.
 */
export type GridColumnSourceItem = {
  readOnly?: boolean
  required?: boolean
  editorType?: string | GridEditorCtor | PromiseLike<GridEditorCtor>
  editorParams?: Record<string, unknown>
}

/**
 * Union of fields read across BOTH grid controllers. Keep this minimal —
 * adding a field here means every consumer of the alias inherits it.
 */
export type GridColumn = {
  /** SlickGrid's canonical column identifier. SlickGrid headers store
   * this in `data-id`, NOT the column's `field`. In many setups
   * `id === field`, but they CAN diverge — Serenity column factories
   * may set `id` to something other than `field` for compatibility
   * reasons. Header → column lookups must compare against `id`. */
  id?: string
  field?: string
  name?: string
  visible?: boolean
  cssClass?: string
  /** Editor constructor reference. Typed `unknown` since the duplicate
   * sleekgrid resolution makes the real `EditorClass` non-assignable
   * across module boundaries; consumers check truthiness (`!!col.editor`)
   * — NOT `!== undefined` (which admits `null` / `false`). */
  editor?: unknown
  sourceItem?: GridColumnSourceItem
}

/**
 * Variant of `GridColumn` where `field` is guaranteed defined and
 * non-empty. The `IdevsGridEditController` dispatcher checks
 * `column.field` before invoking a renderer (a column without `field`
 * writes to `item["undefined"]` silently); the renderer signature uses
 * this narrowed type so the implementation doesn't need `column.field as
 * string` casts at every write site.
 */
export type GridColumnWithField = GridColumn & { field: string }

/**
 * Type predicate for `GridColumnWithField`. Centralizes the field-
 * validity rule (non-empty string) so the dispatcher and any custom
 * editor code can share the same check + type narrowing without
 * resorting to `as GridColumnWithField` casts.
 *
 * Usage:
 *
 *     if (!hasField(column)) {
 *       // column.field is undefined / empty
 *       return
 *     }
 *     // column is GridColumnWithField here — column.field: string
 *     item[column.field] = value
 */
export function hasField(column: GridColumn): column is GridColumnWithField {
  // `trim().length > 0` (not just `length > 0`) so whitespace-only
  // field names like `'   '` are rejected too — `item['   '] = value`
  // is structurally the same silent-write bug as `item["undefined"]`,
  // just with a different bogus key. The `trim()` cost is negligible
  // (called once per cell-edit dispatch, not per render).
  return typeof column.field === 'string' && column.field.trim().length > 0
}
