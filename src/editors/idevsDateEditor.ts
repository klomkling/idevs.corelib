import {
  DateEditor,
  DateEditorOptions,
  Decorators,
  Fluent,
  formatDate,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'
// Type-only import: this file references flatpickr exclusively in type
// positions (flatpickr.Instance, flatpickr.Options.Options). A value-position
// import would be elided by tsc under CommonJS output anyway, so making the
// type-only intent explicit avoids the misleading appearance of a runtime
// dependency from this subpath alone. The parent class (Serenity's
// `DateEditor`) is what actually pulls flatpickr in at runtime.
import type flatpickr from 'flatpickr'

export type IdevsDateEditorOptions = DateEditorOptions & {
  format?: string
}

type FlatpickrAttachedElement = HTMLInputElement & {
  _flatpickr?: flatpickr.Instance
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const ERROR_CLASSES = ['error', 'invalid', 'validation-error'] as const

@Decorators.registerEditor('Idevs.CoreLib.IdevsDateEditor')
export class IdevsDateEditor<
  P extends IdevsDateEditorOptions = IdevsDateEditorOptions,
> extends DateEditor<P> {
  private classObserver?: MutationObserver

  constructor(props: EditorProps<P>) {
    super(props)
    this.initialize()
    this.updateElementReadOnly()
  }

  destroy() {
    this.classObserver?.disconnect()
    this.classObserver = undefined
    if (this.domNode) {
      Fluent(this.domNode).off('validationerror.idevsdate')
    }
    super.destroy()
  }

  set_value(value: string) {
    const fp = this.getFlatpickr()
    if (!fp) return
    const oldValue = this.get_value()

    // Route through flatpickr's API so `selectedDates` stays in sync and the
    // calendar UI reflects the programmatic value. `false` suppresses
    // flatpickr's own onChange — we fire the Serenity change event below
    // exactly once if the resolved value actually changed.
    if (value) {
      fp.setDate(value, false, fp.config.dateFormat)
    } else {
      fp.clear(false)
    }

    const newValue = this.get_value()
    if (oldValue !== newValue && this.domNode) {
      Fluent.trigger(this.domNode, 'change')
    }
  }

  get_value(): string {
    if (!this.domNode || !this.domNode.value) {
      return ''
    }

    const fp = this.getFlatpickr()
    if (ISO_DATE_REGEX.test(this.domNode.value)) {
      return this.domNode.value
    }

    if (fp) {
      const userFormat = this.props.format ?? 'd/m/Y'
      const parsedDate = fp.parseDate(this.domNode.value, userFormat)
      if (parsedDate) {
        return formatDate(parsedDate, 'yyyy-MM-dd')
      }
    }

    return this.domNode.value
  }

  protected initialize(): void {
    if (!this.domNode) return

    this.classObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
          this.syncValidationClasses()
        }
      })
    })
    this.classObserver.observe(this.domNode, { attributes: true })

    Fluent(this.domNode).on('validationerror.idevsdate', () => {
      this.syncValidationClasses()
    })

    this.element.parent().findFirst('button').addClass('order-last')
  }

  private syncValidationClasses(): void {
    const fp = this.getFlatpickr()
    if (!fp?.altInput) return

    const originalClasses = this.domNode.className.split(' ')
    const altInput = fp.altInput

    ERROR_CLASSES.forEach(cls => altInput.classList.remove(cls))
    ERROR_CLASSES.forEach(cls => {
      if (originalClasses.includes(cls)) {
        altInput.classList.add(cls)
      }
    })
  }

  public getFlatpickrOptions(_input: HTMLElement): flatpickr.Options.Options {
    const userFormat = this.props.format ?? 'd/m/Y'
    const opt: flatpickr.Options.Options = {
      clickOpens: false,
      allowInput: true,
      altInput: true,
      altFormat: userFormat,
      dateFormat: 'Y-m-d',
      onOpen: (_sd, _ds, instance) => {
        setTimeout(() => {
          this.focusCalendarSelection(instance, userFormat)
        }, 0)
      },
      onReady: (_sd, _ds, instance) => {
        this.attachKeyboardHandlers(instance)
      },
      onChange: () => {
        if (this.domNode) {
          Fluent.trigger(this.domNode, 'change')
        }
        this.syncValidationClasses()
      },
      onClose: (_sd, _ds, instance) => {
        this.domNode.value = instance.input.value
      },
      disable: [
        // In read-only mode, disable every date EXCEPT the currently selected
        // one. Compare full yyyy-MM-dd against `get_value()` (which normalises
        // user-format input back to ISO) so unrelated days in other months or
        // years can no longer be selected just because they share a day number.
        (d: Date) =>
          this.get_readOnly() && formatDate(d, 'yyyy-MM-dd') !== this.get_value(),
      ],
    }

    const modal = this.domNode.closest('.modal')
    if (modal) {
      opt.appendTo = modal as HTMLElement
    } else {
      setTimeout(() => {
        const lateModal = this.domNode?.closest('.modal')
        const fp = this.getFlatpickr()
        if (
          lateModal &&
          !opt.static &&
          !opt.appendTo &&
          fp?.calendarContainer &&
          fp.calendarContainer.parentElement !== lateModal
        ) {
          lateModal.appendChild(fp.calendarContainer)
        }
        this.syncValidationClasses()
      }, 0)
    }

    setTimeout(() => {
      this.updateAltInputReadOnly()
      this.syncValidationClasses()
    }, 50)

    return opt
  }

  protected updateAltInputReadOnly(): void {
    const fp = this.getFlatpickr()
    if (!fp?.altInput) return

    const readOnly = this.get_readOnly()
    const altInput = fp.altInput as HTMLInputElement
    altInput.readOnly = readOnly
    altInput.classList.toggle('readonly', readOnly)
  }

  protected updateElementReadOnly(): void {
    const fp = this.getFlatpickr()
    if (!fp) return

    const readOnly = this.get_readOnly()
    if (fp.altInput) {
      ;(fp.altInput as HTMLInputElement).readOnly = readOnly
    }

    fp.set('clickOpens', false)
    fp.set('allowInput', !readOnly)

    fp.altInput?.classList.toggle('idevs-readonly-altinput', readOnly)
  }

  protected attachKeyboardHandlers(fp: flatpickr.Instance): void {
    const target = (fp.altInput ?? fp.input) as HTMLInputElement
    target.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowDown':
            event.preventDefault()
            event.stopPropagation()
            if (!fp.isOpen) fp.open()
            if (fp.isOpen) {
              setTimeout(() => {
                const el = fp.calendarContainer.querySelector<HTMLElement>(
                  '.flatpickr-day.selected, .flatpickr-day.today, .flatpickr-day:not(.flatpickr-disabled)',
                )
                if (el) {
                  el.focus()
                  el.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }))
                }
              }, 50)
            }
            break
          case 'Escape':
            if (fp.isOpen) {
              event.preventDefault()
              event.stopPropagation()
              fp.close()
              setTimeout(() => target.focus(), 50)
            }
            break
          case 'Enter':
            if (fp.isOpen) {
              event.preventDefault()
              event.stopPropagation()
              // fp.close() triggers the onClose callback, which syncs
              // domNode.value to fp.input.value (the ISO `Y-m-d` value).
              // Don't reassign from target.value here — target is altInput
              // (user-format), and overwriting would replace the canonical
              // ISO with the display string.
              fp.close()
              Fluent.trigger(this.domNode, 'change')
            }
            break
        }
      },
      true,
    )
  }

  private getFlatpickr(): flatpickr.Instance | undefined {
    return (this.domNode as FlatpickrAttachedElement)._flatpickr
  }

  private focusCalendarSelection(instance: flatpickr.Instance, userFormat: string) {
    const days = instance.calendarContainer.querySelectorAll<HTMLElement>(
      '.flatpickr-day, .flatpickr-day:not(.flatpickr-disabled)',
    )
    const selected = Array.from(days).filter(d => d.classList.contains('selected'))

    if (instance.input.value) {
      if (selected.length === 0) {
        const isoMatch = instance.input.value.match(ISO_DATE_REGEX)
        const parsedDate = isoMatch
          ? instance.parseDate(instance.input.value, 'Y-m-d')
          : instance.parseDate(instance.input.value, userFormat)
        if (parsedDate) {
          // Match by flatpickr's `dateObj` property on each day cell rather
          // than by day-of-month text — calendars include prev/next-month
          // spillover cells that share day numbers, and matching on text
          // alone could highlight the wrong cell (e.g. picking the previous
          // month's "1st" instead of the current month's).
          const match = Array.from(days).find(d => {
            const dateObj = (d as HTMLElement & { dateObj?: Date }).dateObj
            return (
              !!dateObj &&
              dateObj.getFullYear() === parsedDate.getFullYear() &&
              dateObj.getMonth() === parsedDate.getMonth() &&
              dateObj.getDate() === parsedDate.getDate()
            )
          })
          match?.classList.add('selected')
        }
      }
    } else if (selected.length === 0) {
      const today = instance.calendarContainer.querySelector('.flatpickr-day.today')
      today?.classList.add('selected')
    }
  }
}
