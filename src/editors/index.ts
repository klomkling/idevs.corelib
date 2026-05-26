export * from './checkboxButtonEditor'
export * from './dateMonthEditor'
export * from './idevsTagEditor'
export * from './idevsSearchButtonEditor'
export * from './idevsSelfSearchButtonEditor'
export * from './idevsNumericTagEditor'
export * from './slickEditorBase'
export * from './slickSearchButtonEditor'
export * from './slickSelfSearchButtonEditor'

// IdevsDateEditor is intentionally NOT re-exported from this barrel.
// It depends on `flatpickr` (an OPTIONAL peer dependency). Re-exporting
// here would force flatpickr resolution for every consumer of the main
// entry, even those who never use the date editor. Import it directly:
//
//   import { IdevsDateEditor } from '@idevs/corelib/editors/idevsDateEditor'
//
// Consumers using this subpath are responsible for installing flatpickr.

// Internal helpers under shared/ are NOT exported publicly. They exist for
// use by other editors in this package (and PR-3b's SelfSearch). Consumers
// should depend on the editor classes, not these utilities.
