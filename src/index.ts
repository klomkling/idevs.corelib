// Core modules
export * from './editors'
export * from './dialogs'
export * from './formatters'
export * from './grids'
export * from './panels'
export * from './ui'
export * from './helpers'

// Utility modules
export * from './utils'
export * from './types'

/**
 * @deprecated since 1.1.0 — prototype extensions auto-load via the root entry
 * point for backwards compatibility, but this will be removed in 2.0.0.
 *
 * To prepare your code for 2.0.0:
 *
 *   // Replace existing usage with explicit imports of the utility functions:
 *   import { toSqlDateString } from '@idevs/corelib'   // instead of date.toSqlDate()
 *
 *   // Or, if you still want the prototype patches, opt in explicitly:
 *   import '@idevs/corelib/globals'
 */
import './globals'
