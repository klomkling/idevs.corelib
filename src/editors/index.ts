export * from './checkboxButtonEditor'
export * from './dateMonthEditor'
export * from './idevsTagEditor'

// IdevsDateEditor is intentionally NOT re-exported from this barrel.
// It depends on `flatpickr` (an OPTIONAL peer dependency). Re-exporting
// here would force flatpickr resolution for every consumer of the main
// entry, even those who never use the date editor. Import it directly:
//
//   import { IdevsDateEditor } from '@idevs/corelib/editors/idevsDateEditor'
//
// Consumers using this subpath are responsible for installing flatpickr.
