import { Decorators, SelectEditor, SelectEditorOptions, indexOf } from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'

@Decorators.registerEditor('DateMonthEditor')
export class DateMonthEditor<
  P extends DateMonthEditorOptions = DateMonthEditorOptions,
> extends SelectEditor<P> {
  private months: string[]

  constructor(props: EditorProps<P>) {
    super(props)

    this.updateItems()
  }

  get valueAsMonth() {
    return indexOf(this.months, x => x === this.value)
  }

  getItems() {
    const opt = this.options as DateMonthEditorOptions

    if (opt.items != null && opt.items.length >= 1) {
      return opt.items
    }

    const today = new Date()
    this.months = []
    const locale = opt.locale ?? 'en'
    const options = { month: opt.display ?? '2-digit' }
    const upperCase = opt.upperCase ?? false

    for (let i = 0; i <= 11; i++) {
      let m = new Date(today.getFullYear(), i, 1).toLocaleDateString(locale, options)
      if (upperCase) {
        m = m.toUpperCase()
      }
      this.months.push(m)
    }

    return this.months
  }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface DateMonthEditorOptions extends SelectEditorOptions {
  display?: '2-digit' | 'short' | 'long'
  locale?: 'en' | 'th'
  upperCase?: boolean
}
