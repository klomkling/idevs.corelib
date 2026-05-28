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
 * Subset of Serenity's `PropertyItem` that we actually consume from
 * `Column.sourceItem`. `editorType` is intentionally `unknown` to stay
 * structurally assignable from Serenity's wider
 * `string | EditorClass | PromiseLike<EditorClass>` union; narrow at
 * the use site with `typeof === 'string'`.
 */
export type GridColumnSourceItem = {
  readOnly?: boolean
  required?: boolean
  editorType?: unknown
  editorParams?: Record<string, unknown>
}

/**
 * Union of fields read across BOTH grid controllers. Keep this minimal —
 * adding a field here means every consumer of the alias inherits it.
 */
export type GridColumn = {
  field?: string
  name?: string
  visible?: boolean
  cssClass?: string
  /** Editor constructor reference. Typed `unknown` since the duplicate
   * sleekgrid resolution makes the real `EditorClass` non-assignable
   * across module boundaries; consumers only check truthiness. */
  editor?: unknown
  sourceItem?: GridColumnSourceItem
}
