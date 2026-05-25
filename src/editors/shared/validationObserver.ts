/**
 * Wraps the MutationObserver pattern used by editors that need to mirror
 * validation classes (`error`, `invalid`, `validation-error`) from a hidden
 * Serenity input to a visible "alt" element (flatpickr altInput, the
 * SearchButton's displayInput, etc.).
 *
 * Returns start/stop/syncOnce handles. The consumer is responsible for calling
 * `stop()` in `destroy()`.
 */

export type ValidationClassSync = {
  start(): void
  stop(): void
  syncOnce(): void
}

export type ValidationObserverOptions = {
  source: HTMLElement
  target: HTMLElement | (() => HTMLElement | null | undefined)
  classes: readonly string[]
}

export function createValidationObserver(opts: ValidationObserverOptions): ValidationClassSync {
  const { source, classes } = opts
  let observer: MutationObserver | undefined

  const resolveTarget = (): HTMLElement | null => {
    if (typeof opts.target === 'function') {
      return opts.target() ?? null
    }
    return opts.target
  }

  const syncOnce = () => {
    const target = resolveTarget()
    if (!target) return
    for (const cls of classes) {
      if (source.classList.contains(cls)) {
        target.classList.add(cls)
      } else {
        target.classList.remove(cls)
      }
    }
  }

  const start = () => {
    if (observer) return // idempotent
    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          syncOnce()
          return
        }
      }
    })
    observer.observe(source, { attributes: true, attributeFilter: ['class'] })
  }

  const stop = () => {
    observer?.disconnect()
    observer = undefined
  }

  return { start, stop, syncOnce }
}
