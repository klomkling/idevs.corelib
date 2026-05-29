/**
 * Ambient module declaration for `@serenity-is/extensions`.
 *
 * Why this file exists:
 *   - `@serenity-is/extensions` is NOT published on the public npm registry.
 *     It ships only with Serenity's .NET install, under
 *     `node_modules/.dotnet/serenity.extensions`, and consumer projects link
 *     it via a local file reference (e.g.
 *     `"@serenity-is/extensions": "./node_modules/.dotnet/serenity.extensions"`).
 *   - That means `npm install @idevs/corelib` followed by `npm install` of a
 *     pure-Node project (no Serenity .NET install) cannot resolve the
 *     extensions package. We expose it as an OPTIONAL peer dependency so
 *     consumers without it installed are not forced to error at install
 *     time — only at import time of the extensions-dependent subpath
 *     (`@idevs/corelib/grids/idevsSelectableEntityGrid` or
 *     `@idevs/corelib/grids/idevsGridEditorBase`).
 *   - But our own `tsc` build + vitest harness need the types to be present
 *     for the grid files that extend `SelectableEntityGrid` / `GridEditorBase`.
 *     This ambient declaration provides the MINIMAL surface area we extend,
 *     keyed off the real corelib base classes. Tests in `tests/grids/` mock
 *     the runtime side at the prototype level.
 *
 * Hardening note:
 *   - Declared as the minimal subset of the upstream API our wrappers
 *     actually use. Don't expand without need; over-declaring would couple
 *     this package to internal extensions-API choices it does not actually
 *     depend on, and would silently mask upstream breaking changes.
 *   - If/when `@serenity-is/extensions` is published to npm, delete this
 *     shim and let the real types resolve via node_modules.
 */

declare module '@serenity-is/extensions' {
  import {
    EditorProps,
    EntityGrid,
    IGetEditValue,
    ISetEditValue,
  } from '@serenity-is/corelib'
  import { GridOptions } from '@serenity-is/sleekgrid'

  /**
   * Minimal `SelectableEntityGrid` surface.
   *
   * Real upstream type: `class SelectableEntityGrid<TItem, TOptions> extends EntityGrid<TItem, TOptions>`.
   * We only depend on the protected `getSlickOptions()` override hook in the
   * port; constructor / protected member exposure is delegated to
   * `EntityGrid` (its real parent).
   */
  export class SelectableEntityGrid<TItem, TOptions = unknown> extends EntityGrid<
    TItem,
    TOptions
  > {
    protected getSlickOptions(): GridOptions
  }

  /**
   * Minimal `GridEditorBase` surface.
   *
   * Real upstream type:
   *   `abstract class GridEditorBase<TEntity, P = {}> extends EntityGrid<TEntity, P>
   *      implements IGetEditValue, ISetEditValue`
   *
   * We list only the protected/public members the port directly invokes
   * via super.X() or override. Everything else flows from `EntityGrid`.
   */
  export abstract class GridEditorBase<TEntity, P = unknown>
    extends EntityGrid<TEntity, P>
    implements IGetEditValue, ISetEditValue
  {
    constructor(props: EditorProps<P>)
    protected getSlickOptions(): GridOptions
    /** Toggle the readOnly state. The port overrides this to mirror the
     * disabled state onto specific toolbar buttons. */
    set_readOnly(value: boolean): void
    getEditValue(property: unknown, target: unknown): void
    setEditValue(source: unknown, property: unknown): void
  }
}
