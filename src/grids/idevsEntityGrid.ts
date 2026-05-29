import { Decorators, EntityGrid } from '@serenity-is/corelib'

/**
 * Minimal EntityGrid wrapper that enables full-row rendering by default.
 *
 * Replaces PowerACC's `CsiEntityGrid`. Behavior parity:
 *   - `renderAllRows: true` in the SlickGrid options — disables row
 *     virtualization, which the PowerACC UI relies on for the
 *     IdevsSearchGrid / IdevsGridEditorBase descendants (some downstream
 *     features like in-row editor focus assume all rows are present in the
 *     DOM at all times).
 *
 * Hardening vs source:
 *   - Source used a bare `@Decorators.registerClass()` without an explicit
 *     full-name. Serenity falls back to deriving a name from the class +
 *     enclosing namespace, which is fine for compile-time but produces
 *     decorator metadata that's harder to spot in client decorators
 *     registry diagnostics. We use an explicit `Idevs.CoreLib.IdevsEntityGrid`
 *     full-name string, matching the rest of the @idevs/corelib widget
 *     family (IdevsEntityDialog, IdevsPropertyDialog, IdevsTabControl …).
 *   - Generic constraint `<P = unknown>` (not `<P = {}>`) — `{}` is the
 *     anti-pattern type that matches every non-null/undefined value;
 *     `unknown` keeps the parameter overridable without secretly accepting
 *     primitives. Subclasses can still tighten via `<P extends ... >`.
 *   - `getSlickOptions` returns from a `super.getSlickOptions()` clone with
 *     the `renderAllRows` flag set; we don't mutate the parent's return
 *     value if Serenity ever changes to a cached singleton.
 */
@Decorators.registerClass('Idevs.CoreLib.IdevsEntityGrid')
export class IdevsEntityGrid<TItem, P = unknown> extends EntityGrid<TItem, P> {
  // Return type intentionally inferred from `super.getSlickOptions()` rather
  // than annotated with `GridOptions` from `@serenity-is/sleekgrid`. The
  // direct annotation triggers a duplicate-module type-incompatibility
  // error when the consumer's `@serenity-is/corelib` install pins a
  // different sleekgrid minor than `@idevs/corelib`'s own devDep tree —
  // the two `GridOptions` types have separate private-field declarations
  // even though the public shape is identical. Letting TS infer keeps the
  // override's return assignable to whatever the parent's signature uses.
  protected override getSlickOptions() {
    const options = super.getSlickOptions()
    return { ...options, renderAllRows: true }
  }
}
