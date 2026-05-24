// Minimal jsdom shims. jQuery is provided as a global by Serenity in real apps;
// stub it here so DOM-only helper tests do not need the full jQuery dependency.
import { vi } from 'vitest'

;(globalThis as unknown as { $?: unknown }).$ = vi.fn()
