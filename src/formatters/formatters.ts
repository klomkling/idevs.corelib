import { Decorators } from '@serenity-is/corelib'
import { FormatterContext } from '@serenity-is/sleekgrid'
import { getLookup, htmlEncode } from '@serenity-is/corelib'

export type Formatter = {
  format(ctx: FormatterContext): string
}

@Decorators.registerFormatter('Idevs.ZeroDisplayFormatter')
export class ZeroDisplayFormatter implements Formatter {
  constructor(public readonly props: { displayText?: string } = {}) {
    this.props ??= {}
    this.props.displayText ??= ''
  }

  get displayText() {
    return this.props.displayText ?? ''
  }
  set displayText(value: string) {
    this.props.displayText = value
  }

  format(ctx: FormatterContext): string {
    return ZeroDisplayFormatter.format(ctx.value, this.displayText)
  }

  static format(src: string, displayText?: string): string {
    const value = parseFloat(String(src || '0').replace(',', ''))
    if (value === 0) {
      return htmlEncode(displayText ?? '')
    }

    return htmlEncode(src)
  }
}

@Decorators.registerFormatter('Idevs.CheckboxFormatter')
export class CheckboxFormatter implements Formatter {
  constructor(
    public readonly props: {
      trueText?: string
      falseText?: string
      cssClass?: string
      trueValueIcon?: string
      falseValueIcon?: string
    }
  ) {
    this.props.cssClass ??= 'text-center fs-2 text-gray-1'
    this.props.trueText ??= '1'
    this.props.falseText ??= '0'
    this.props.trueValueIcon ??= 'mdi mdi-checkbox-marked-outline'
    this.props.falseValueIcon ??= 'mdi mdi-checkbox-blank-outline'
  }

  get cssClass() {
    return this.props.cssClass ?? ''
  }
  set cssClass(value: string) {
    this.props.cssClass = value
  }

  get trueText() {
    return this.props.trueText ?? ''
  }
  set trueText(value: string) {
    this.props.trueText = value
  }

  get falseText() {
    return this.props.falseText ?? ''
  }
  set falseText(value: string) {
    this.props.falseText = value
  }

  get trueValueIcon() {
    return this.props.trueValueIcon ?? ''
  }
  set trueValueIcon(value: string) {
    this.props.trueValueIcon = value
  }

  get falseValueIcon() {
    return this.props.falseValueIcon ?? ''
  }
  set falseValueIcon(value: string) {
    this.props.falseValueIcon = value
  }

  format(ctx: FormatterContext): string {
    return CheckboxFormatter.format(
      ctx.value,
      this.cssClass,
      this.trueText,
      this.falseText,
      this.trueValueIcon,
      this.falseValueIcon
    )
  }

  static format(
    src: string,
    cssClass?: string,
    trueText?: string,
    falseText?: string,
    trueValueIcon?: string,
    falseValueIcon?: string
  ): string {
    if (src === trueText) {
      return `<i class="${trueValueIcon} ${cssClass}"></i>`
    } else if (src === falseText) {
      return `<i class="${falseValueIcon} ${cssClass}"></i>`
    } else {
      return htmlEncode(src)
    }
  }
}

@Decorators.registerFormatter('Idevs.LookupFormatter')
export class LookupFormatter implements Formatter {
  constructor(public readonly props: { lookupKey?: string } = {}) {
    this.props ??= {}
  }

  get lookupKey() {
    return this.props.lookupKey ?? ''
  }
  set lookupKey(value: string) {
    this.props.lookupKey = value
  }

  format(ctx: FormatterContext): string {
    return LookupFormatter.format(ctx.value, this.lookupKey)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static format(src: any, lookupKey?: string): string {
    if (!src) return ''

    if (!lookupKey) return src

    const lookup = getLookup(lookupKey)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = lookup.items as Array<{ [key: string]: any }>
    const idField = lookup.idField
    const textField = lookup.textField
    const idList = src.toString().split(',')

    return (
      idList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((x: any) => {
          const g = items.find(i => i[idField] === x)
          if (!g) return x

          return htmlEncode(g[textField])
        })
        .join(', ')
    )
  }
}

@Decorators.registerFormatter('Idevs.DateMonthFormatter')
export class DateMonthFormatter implements Formatter {
  @Decorators.option()
  public display: '2-digit' | 'short' | 'long'

  @Decorators.option()
  public locale: 'en' | 'th'

  format(ctx: FormatterContext): string {
    const src = ctx.value as number
    if (!src) return ''

    const locale = this.locale ?? 'en'
    const options = { month: this.display ?? '2-digit' }

    return new Date(2000, src - 1, 1).toLocaleDateString(locale, options)
  }
}

export class idevsFormatters {
   
  public static load() {}
}
