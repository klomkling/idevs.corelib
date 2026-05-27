import { EditorUtils, Fluent, type QuickFilter, type Widget } from '@serenity-is/corelib'

/**
 * Filter-criteria helpers for Serenity QuickFilter chains.
 */

/**
 * Reset all LookupEditor quick filters to null and strip the active marker.
 * Other editor types are left alone (the source only special-cased
 * LookupEditor; if non-lookup filter reset is needed, add per-type
 * handling here).
 */
export function clearFilter(filters: QuickFilter<Widget<unknown>, unknown>[]): void {
  for (const filter of filters) {
    if (!filter.type || filter.type.name !== 'LookupEditor') continue
    const el = document.querySelector<HTMLInputElement>(`input[id*="_QuickFilter_${filter.field}"]`)
    if (!el) continue
    const widget = Fluent(el).getWidget(filter.type)
    EditorUtils.setValue(widget, null)
    const root = el.closest('.quick-filter-item')
    root?.classList.remove('quick-filter-active')
  }
}
