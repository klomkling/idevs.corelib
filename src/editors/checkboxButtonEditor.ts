// reference: https://github-wiki-see.page/m/serenity-is/Serenity/wiki/CheckBox-Group-Editor

import {
  Decorators,
  EditorWidget,
  Enum,
  EnumKeyAttribute,
  EnumTypeRegistry,
  Fluent,
  IReadOnly,
  getCustomAttributes,
  getLookup,
  isEmptyOrNull,
  toId,
  tryGetText,
} from '@serenity-is/corelib'
import type { EditorProps } from '@serenity-is/corelib'

type LookupItem = Record<string, unknown>

export type CheckboxButtonEditorOptions = {
  enumKey?: string
  enumType?: unknown
  lookupKey?: string
  isStringId?: boolean
}

@Decorators.registerEditor('CheckboxButtonEditor')
export class CheckboxButtonEditor<
    P extends CheckboxButtonEditorOptions = CheckboxButtonEditorOptions,
  >
  extends EditorWidget<P>
  implements IReadOnly
{
  private _items: LookupItem[]
  private readonly _idField: string
  private readonly _textField: string
  private readonly _isStringId: boolean

  static override createDefaultElement() {
    return Fluent('div').getNode()
  }
  declare readonly domNode: HTMLElement

  constructor(props: EditorProps<P>) {
    super(props)

    if (
      isEmptyOrNull(this.options.enumKey ?? '') &&
      this.options.enumType == null &&
      isEmptyOrNull(this.options.lookupKey ?? '')
    ) {
      return
    }

    this._isStringId = this.options.isStringId ?? false

    if (!isEmptyOrNull(this.options.lookupKey ?? '')) {
      const lookup = getLookup(this.options.lookupKey ?? '')
      this._idField = lookup.idField
      this._textField = lookup.textField
      this.set_items(lookup.items as LookupItem[])
    } else {
      const enumType = this.options.enumType || EnumTypeRegistry.get(this.options.enumKey ?? '')
      let enumKey = this.options.enumKey

      if (enumKey == null && enumType != null) {
        const enumKeyAttr = getCustomAttributes(enumType, EnumKeyAttribute, false)
        if (enumKeyAttr.length > 0) {
          enumKey = enumKeyAttr[0].value
        }
      }
      const values = Enum.getValues(enumType)
      for (const x of values) {
        const name = Enum.toString(enumType, x)
        this.addCheckbox(x.toString(), tryGetText('Enums.' + enumKey + '.' + name) ?? name)
      }
    }

    this.domNode.classList.add('d-flex', 'flex-wrap')
  }

  protected renderCheckboxes() {
    const childDivs = this.domNode.querySelectorAll('div')
    childDivs.forEach(function (child) {
      this.domNode.removeChild(child)
    })

    for (const item of this._items) {
      const textValue = item[this._textField]
      const text = textValue == null ? '' : textValue.toString()
      const idValue = item[this._idField]
      const id = idValue == null ? '' : idValue.toString()
      this.addCheckbox(id, text)
    }
  }

  protected addCheckbox(value: string, text: string) {
    const div = $('<div class="col-12 col-sm-6 col-md-4 col-xl-3" />')
    const label = $('<label/>').text(text.replace(/, /g, ',').replace(/,/g, ', '))
    $('<input type="checkbox" class="me-2" />')
      .attr('name', this.uniqueName)
      .attr('id', this.uniqueName + '_' + value)
      .attr('value', value)
      .prependTo(label)
    label.appendTo(div)
    div.appendTo(this.domNode)
  }

  get_items(): LookupItem[] {
    return this._items
  }

  get items(): LookupItem[] {
    return this.get_items()
  }

  set_items(value: LookupItem[]) {
    this._items = value
    this.renderCheckboxes()
  }

  set items(v: LookupItem[]) {
    this.set_items(v)
  }

  get_value() {
    const val: string[] = []
    const inputs = this.domNode.querySelectorAll('input:checked')

    inputs.forEach((input: HTMLInputElement) => {
      val.push(this._isStringId ? input.value : toId(input.value))
    })

    return val.join(',')
  }

  get value(): string {
    return this.get_value()
  }

  set_value(value: string): void {
    if (value !== this.get_value()) {
      let values: unknown[] = []
      if (!isEmptyOrNull(value)) {
        values = this._isStringId ? value.split(',') : value.split(',').map(p => Number(p))
      }
      const inputs = this.domNode.querySelectorAll<HTMLInputElement>('input')
      inputs.forEach(input => {
        input.checked = false
      })

      values.forEach(v => {
        const checks = Array.from(inputs).filter(input => (input as HTMLInputElement).value === v)
        if (checks.length > 0) {
          ;(checks[0] as HTMLInputElement).checked = true
        }
      })
    }
  }

  set value(v: string) {
    this.set_value(v)
  }

  get_readOnly(): boolean {
    return this.domNode.getAttribute('disabled') != null
  }

  set_readOnly(value: boolean): void {
    if (this.get_readOnly() !== value) {
      if (value) {
        this.domNode.setAttribute('disabled', 'disabled')
        this.domNode.querySelectorAll<HTMLInputElement>('input').forEach(input => {
          input.setAttribute('disabled', 'disabled')
        })
      } else {
        this.domNode.removeAttribute('disabled')
        this.domNode.querySelectorAll<HTMLInputElement>('input').forEach(input => {
          input.removeAttribute('disabled')
        })
      }
    }
  }
}

export class idevsEditors {
   
  public static load() {}
}
