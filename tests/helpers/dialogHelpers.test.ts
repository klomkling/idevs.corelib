import { afterEach, describe, expect, it } from 'vitest'
import {
  createCustomEvent,
  disableRadioButtonEditor,
  disableRadioButtons,
  enableRadioButtonEditor,
  enableRadioButtons,
  groupFields,
  IdevsDialogEventName,
  setActiveModal,
  toggleInputValidateMessage,
} from '../../src/helpers/dialogHelpers'

afterEach(() => {
  document.body.replaceChildren()
})

function div(parent: HTMLElement, className = ''): HTMLDivElement {
  const el = document.createElement('div')
  if (className) el.className = className
  parent.appendChild(el)
  return el
}

describe('IdevsDialogEventName constants', () => {
  it('exposes the four standard dialog event names', () => {
    expect(IdevsDialogEventName.DialogOpen).toBe('onDialogOpen')
    expect(IdevsDialogEventName.DialogClose).toBe('onDialogClose')
    expect(IdevsDialogEventName.DialogSave).toBe('onDialogSave')
    expect(IdevsDialogEventName.DialogDelete).toBe('onDialogDelete')
  })
})

describe('createCustomEvent', () => {
  it('builds a CustomEvent with the supplied name + detail', () => {
    const evt = createCustomEvent('test', { foo: 'bar' })
    expect(evt.type).toBe('test')
    expect(evt.detail).toEqual({ foo: 'bar' })
  })
})

describe('groupFields', () => {
  it('wraps matched .className elements into a single group div', () => {
    const root = div(document.body)
    div(root, 'name col-12')
    div(root, 'email col-12')
    groupFields(root, [
      ['name', 'col-6'],
      ['email', 'col-6'],
    ], 'inline-pair')
    const group = root.querySelector('.name_group')
    expect(group).not.toBeNull()
    expect(group?.classList.contains('field')).toBe(true)
    expect(group?.classList.contains('inline-pair')).toBe(true)
    expect(group?.querySelectorAll('.name, .email')).toHaveLength(2)
  })

  it('replaces prior col-* classes on grouped elements', () => {
    const root = div(document.body)
    div(root, 'a col-12 col-md-6')
    groupFields(root, [['a', 'col-4']], 'g')
    const a = root.querySelector('.a')!
    expect(a.classList.contains('col-12')).toBe(false)
    expect(a.classList.contains('col-md-6')).toBe(false)
    expect(a.classList.contains('col-4')).toBe(true)
  })

  it('is idempotent — second call with same classes is a no-op', () => {
    const root = div(document.body)
    div(root, 'name')
    div(root, 'email')
    groupFields(root, [['name', 'col-6'], ['email', 'col-6']], 'g')
    const first = root.querySelector('.name_group')
    groupFields(root, [['name', 'col-6'], ['email', 'col-6']], 'g')
    expect(root.querySelectorAll('.name_group')).toHaveLength(1)
    expect(root.querySelector('.name_group')).toBe(first)
  })

  it('bails out when any field selector is missing', () => {
    const root = div(document.body)
    div(root, 'name')
    // 'email' field intentionally missing
    groupFields(root, [['name', 'col-6'], ['email', 'col-6']], 'g')
    expect(root.querySelector('.name_group')).toBeNull()
  })
})

describe('setActiveModal', () => {
  it('removes modal-inactive from the highest level strictly below currentLevel', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const lvl1 = document.createElement('div')
    lvl1.classList.add('modal', 'modal-inactive')
    lvl1.setAttribute('data-qrouterorder', '1')
    root.appendChild(lvl1)

    const lvl2 = document.createElement('div')
    lvl2.classList.add('modal', 'modal-inactive')
    lvl2.setAttribute('data-qrouterorder', '2')
    root.appendChild(lvl2)

    const lvl3 = document.createElement('div')
    lvl3.classList.add('modal', 'modal-inactive')
    lvl3.setAttribute('data-qrouterorder', '3')
    root.appendChild(lvl3)

    setActiveModal(3) // restore level 2 (highest below 3)

    expect(lvl1.classList.contains('modal-inactive')).toBe(true)
    expect(lvl2.classList.contains('modal-inactive')).toBe(false)
    expect(lvl3.classList.contains('modal-inactive')).toBe(true)
  })
})

describe('disableRadioButtons / enableRadioButtons', () => {
  it('toggles disabled on every .s-RadioButtonEditor and its radio inputs', () => {
    const root = div(document.body)
    const editor = div(root, 's-RadioButtonEditor')
    const r1 = document.createElement('input')
    r1.type = 'radio'
    editor.appendChild(r1)
    const r2 = document.createElement('input')
    r2.type = 'radio'
    editor.appendChild(r2)

    disableRadioButtons(root)
    expect(editor.getAttribute('disabled')).toBe('disabled')
    expect(r1.getAttribute('disabled')).toBe('disabled')
    expect(r2.getAttribute('disabled')).toBe('disabled')

    enableRadioButtons(root)
    expect(editor.hasAttribute('disabled')).toBe(false)
    expect(r1.hasAttribute('disabled')).toBe(false)
    expect(r2.hasAttribute('disabled')).toBe(false)
  })
})

describe('enableRadioButtonEditor / disableRadioButtonEditor (single element)', () => {
  it('toggles disabled on a specific editor element', () => {
    const editor = div(document.body, 's-RadioButtonEditor')
    const r = document.createElement('input')
    r.type = 'radio'
    editor.appendChild(r)

    disableRadioButtonEditor(editor)
    expect(editor.getAttribute('disabled')).toBe('disabled')
    expect(r.getAttribute('disabled')).toBe('disabled')

    enableRadioButtonEditor(editor)
    expect(editor.hasAttribute('disabled')).toBe(false)
    expect(r.hasAttribute('disabled')).toBe(false)
  })
})

describe('toggleInputValidateMessage', () => {
  it('builds the error label via DOM API (no script injection from message)', () => {
    const root = div(document.body)
    const input = document.createElement('input')
    input.id = 'fld'
    root.appendChild(input)
    const sibling = div(root)

    type StubFormFieldEntry = { domNode: HTMLInputElement }
    const form = { fld: { domNode: input } as StubFormFieldEntry } as unknown as Parameters<
      typeof toggleInputValidateMessage
    >[0]

    toggleInputValidateMessage(form, 'fld', '<img src=x onerror=alert(1)>')

    // The label is constructed with textContent — the attempt at HTML
    // injection should render as literal text.
    const label = sibling.querySelector('label.error')
    expect(label).not.toBeNull()
    expect(label?.textContent).toBe('<img src=x onerror=alert(1)>.')
    // No <img> tag should have been created.
    expect(sibling.querySelector('img')).toBeNull()
    expect(input.classList.contains('error')).toBe(true)
    expect(input.classList.contains('valid')).toBe(false)
  })

  it('clears the error and applies valid class when message is empty', () => {
    const root = div(document.body)
    const input = document.createElement('input')
    input.id = 'fld'
    input.classList.add('error')
    root.appendChild(input)
    const sibling = div(root)
    const label = document.createElement('label')
    label.className = 'error'
    sibling.appendChild(label)

    type StubFormFieldEntry = { domNode: HTMLInputElement }
    const form = { fld: { domNode: input } as StubFormFieldEntry } as unknown as Parameters<
      typeof toggleInputValidateMessage
    >[0]

    toggleInputValidateMessage(form, 'fld', '')
    expect(input.classList.contains('valid')).toBe(true)
    expect(input.classList.contains('error')).toBe(false)
    expect(sibling.querySelector('label')).toBeNull()
  })
})
