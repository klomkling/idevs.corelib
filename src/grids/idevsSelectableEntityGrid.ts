import { Decorators } from '@serenity-is/corelib'
import { SelectableEntityGrid } from '@serenity-is/extensions'

/**
 * Selectable entity grid wrapper with full-row rendering enabled.
 *
 * Replaces PowerACC's `CsiSelectableEntityGrid`. Behavior parity:
 *   - Inherits Serenity's `SelectableEntityGrid` selection-checkbox column
 *     and selected-row tracking.
 *   - Forces `renderAllRows: true` so selection state is preserved across
 *     scrolls and selection-aware editor descendants can rely on every row
 *     existing in the DOM.
 *
 * Hardening vs source:
 *   - Source had a `protected csiUpdateInterface(domNode)` method with a
 *     `setTimeout` callback whose body was empty except for a commented-out
 *     `parseInt(.replace(...))` line — pure dead code. Dropped.
 *   - Bare `@Decorators.registerClass()` → explicit
 *     `Idevs.CoreLib.IdevsSelectableEntityGrid` full-name (see
 *     IdevsEntityGrid for rationale).
 *   - `getSlickOptions` does not mutate the parent's return.
 *
 * Subpath import note:
 *   - This file lives at `@idevs/corelib/grids/idevsSelectableEntityGrid`
 *     (subpath export). It is NOT re-exported from the main barrel because
 *     it depends on `@serenity-is/extensions`, which is an OPTIONAL peer
 *     dependency. Consumers must have `@serenity-is/extensions` resolvable
 *     (typically via Serenity's .NET install + local file reference in
 *     their own `package.json`).
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsSelectableEntityGrid')
export class IdevsSelectableEntityGrid<TItem, P = unknown> extends SelectableEntityGrid<
  TItem,
  P
> {
  // Return type inferred — see IdevsEntityGrid for the duplicate-sleekgrid
  // rationale; same constraint applies here.
  protected override getSlickOptions() {
    const options = super.getSlickOptions()
    return { ...options, renderAllRows: true }
  }
}
