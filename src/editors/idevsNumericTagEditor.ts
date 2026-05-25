import { Decorators } from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'
import { IdevsTagEditor, type IdevsTagEditorOptions, type TagItem } from './idevsTagEditor'

export type IdevsNumericTagEditorOptions = IdevsTagEditorOptions & {
  prefix?: string
  suffix?: string
  addSpace?: boolean
  specialValues?: Record<number, string>
}

/**
 * Numeric variant of IdevsTagEditor. Renders the value with an optional
 * prefix/suffix (e.g., "$", "%") and an optional separator space. Special
 * values (e.g., { 0: "Free", -1: "N/A" }) override the default formatting
 * for specific numeric values.
 */
@Decorators.registerEditor('Idevs.CoreLib.IdevsNumericTagEditor')
export class IdevsNumericTagEditor<
  P extends IdevsNumericTagEditorOptions = IdevsNumericTagEditorOptions,
> extends IdevsTagEditor<P> {
  private _numericValue: number | null = null
  private _isFormatting = false

  constructor(props: EditorProps<P>) {
    super(props)
  }

  protected override addDropdownItems(): void {
    this._items.forEach((item: TagItem) => {
      const numeric =
        typeof item === 'number'
          ? item
          : typeof item === 'string'
            ? Number(item)
            : null
      const displayText = this.formatDisplayText(numeric)
      this.createDropdownItem(displayText, item)
    })
  }

  protected override formatDisplayText(value?: string | number | null): string {
    if (value === undefined || value === null || value === '') return ''
    const num = typeof value === 'number' ? value : this.extractNumericValue(String(value))
    if (num === null) return ''

    const special = this.options.specialValues?.[num]
    if (special !== undefined) return special

    const sep = this.options.addSpace ? ' ' : ''
    const prefix = this.options.prefix ? `${this.options.prefix}${sep}` : ''
    const suffix = this.options.suffix ? `${sep}${this.options.suffix}` : ''
    return `${prefix}${num}${suffix}`
  }

  protected extractNumericValue(value: string): number | null {
    if (!value) return null
    let cleaned = value
    if (this.options.prefix) cleaned = cleaned.split(this.options.prefix).join('')
    if (this.options.suffix) cleaned = cleaned.split(this.options.suffix).join('')
    cleaned = cleaned.trim()
    if (!cleaned) return null
    const num = Number(cleaned)
    return Number.isFinite(num) ? num : null
  }

  override formatDisplayValue(): void {
    if (this._isFormatting) return
    if (!this.domNode) return

    const cursorPos = this.domNode.selectionStart ?? this.domNode.value.length
    const oldLength = this.domNode.value.length
    const oldValue = this.domNode.value

    this._numericValue = this.extractNumericValue(this.domNode.value)

    this._isFormatting = true
    this.domNode.value = this.formatDisplayText(this._numericValue)
    this._isFormatting = false

    if (oldValue !== this.domNode.value) {
      this.domNode.dispatchEvent(new Event('change', { bubbles: true }))
      this.domNode.dispatchEvent(new Event('input', { bubbles: true }))
    }

    const newLength = this.domNode.value.length
    const newPos = Math.min(cursorPos + (newLength - oldLength), newLength)
    this.domNode.setSelectionRange(newPos, newPos)
  }
}
