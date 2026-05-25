/**
 * Minimal dialog stub for IdevsSearchButtonEditor tests. The editor resolves
 * the dialog class via the global registry — for tests we register a stub
 * class on a known type-name string and the editor instantiates it via
 * `new DialogClass({...})`.
 *
 * The stub exposes a `dialogOpen()` no-op and an `emitSelection()` helper that
 * tests call to simulate the user picking a row.
 */

export class SearchDialogStub {
  static lastInstance: SearchDialogStub | null = null

  public FilterKeys?: Record<string, unknown>
  public CriteriaKeys?: unknown[]
  public SearchValue?: string
  public DialogSize?: string
  public DialogType?: string
  public DialogPermission?: string
  public preItems?: unknown[]
  public element: [HTMLElement]

  constructor(public opts: Record<string, unknown> = {}) {
    this.element = [document.createElement('div')]
    SearchDialogStub.lastInstance = this
  }

  dialogOpen(): void {
    // no-op for tests
  }

  /**
   * Helper invoked by tests to simulate selection. Dispatches the
   * `dataSelected` CustomEvent the editor listens for.
   */
  emitSelection(target: HTMLElement, payload: Record<string, unknown>): void {
    target.dispatchEvent(new CustomEvent('dataSelected', { detail: payload }))
  }
}

/**
 * Install the stub on the global type registry so the editor's
 * `resolveDialogClass()` returns this class. Returns a teardown function the
 * afterEach should call.
 */
export function installSearchDialogStub(): () => void {
  const globalAny = globalThis as unknown as Record<string, unknown>
  const previous = globalAny.SearchDialogStub
  globalAny.SearchDialogStub = SearchDialogStub
  return () => {
    if (previous === undefined) {
      delete globalAny.SearchDialogStub
    } else {
      globalAny.SearchDialogStub = previous
    }
    SearchDialogStub.lastInstance = null
  }
}
