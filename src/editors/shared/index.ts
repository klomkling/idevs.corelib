/**
 * Internal shared helpers for editors. Not re-exported from
 * `src/editors/index.ts` — consumers should depend on editors, not these
 * utilities. (PR-3b's SelfSearch reuses these via the same internal path.)
 */
export * from './maskedPattern'
export * from './requiredMarker'
export * from './validationObserver'
