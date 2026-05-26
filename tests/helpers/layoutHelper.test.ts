import { afterEach, describe, expect, it } from 'vitest'
import {
  addCssClassToField,
  addElementGroup,
  addElements,
  addElementsWithEmptyElement,
  applyCSS,
  createDivWithClassesAndAppendAfter,
  createDivWithClassesAndAppendBefore,
  createDivWithClassesAndAppendTo,
  createGroup,
  createLayout,
  moveDivToNewParent,
  moveDivsToNewParent,
  setTabIndex,
  toggleButtonInForm,
} from '../../src/helpers/layoutHelper'

afterEach(() => {
  document.body.replaceChildren()
})

// Test fixture helpers — build DOM via API (textContent + createElement)
// rather than innerHTML strings so static analysis can't conflate them with
// production HTML-property writes.
function makeChildSpan(parent: HTMLElement, className: string, text = ''): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = className
  if (text) el.textContent = text
  parent.appendChild(el)
  return el
}

function makeChildDiv(parent: HTMLElement, className = ''): HTMLDivElement {
  const el = document.createElement('div')
  if (className) el.className = className
  parent.appendChild(el)
  return el
}

describe('createLayout', () => {
  it('creates N column divs as children of the parent', () => {
    const parent = makeChildDiv(document.body)
    const cols = createLayout(parent, 3, 'col-4')
    expect(cols).toHaveLength(3)
    expect(parent.children).toHaveLength(3)
    expect(cols[0].className).toBe('col-4')
    expect(cols[2].className).toBe('col-4')
  })

  it('applies an array of per-column classes', () => {
    const parent = makeChildDiv(document.body)
    const cols = createLayout(parent, 3, ['col-6', 'col-4', 'col-2'])
    expect(cols[0].className).toBe('col-6')
    expect(cols[1].className).toBe('col-4')
    expect(cols[2].className).toBe('col-2')
  })

  it('reuses the last class entry when columns exceed array length', () => {
    const parent = makeChildDiv(document.body)
    const cols = createLayout(parent, 4, ['col-6', 'col-2'])
    expect(cols[2].className).toBe('col-2')
    expect(cols[3].className).toBe('col-2')
  })
})

describe('addElementGroup', () => {
  it('creates a wrapper div containing matching descendants from source', () => {
    const source = makeChildDiv(document.body)
    makeChildSpan(source, 'a', 'A')
    makeChildSpan(source, 'b', 'B')
    const parent = makeChildDiv(document.body)
    const group = addElementGroup(parent, source, 'wrapper', 'a,b')
    expect(group.className).toBe('wrapper')
    expect(group.children).toHaveLength(2)
    expect(parent.contains(group)).toBe(true)
  })

  it('accepts direct HTMLElement args alongside selector strings', () => {
    const source = makeChildDiv(document.body)
    const parent = makeChildDiv(document.body)
    const directEl = document.createElement('span')
    directEl.classList.add('direct')
    const group = addElementGroup(parent, source, 'wrapper', directEl)
    expect(group.children).toHaveLength(1)
    expect(group.firstElementChild).toBe(directEl)
  })
})

describe('createGroup', () => {
  it('returns a detached div with optional matching children', () => {
    const source = makeChildDiv(document.body)
    makeChildSpan(source, 'x', 'X')
    makeChildSpan(source, 'y', 'Y')
    const group = createGroup(source, 'my-group', 'x,y')
    expect(group.className).toBe('my-group')
    expect(group.children).toHaveLength(2)
    expect(group.parentElement).toBeNull()
  })
})

describe('addElements / addElementsWithEmptyElement', () => {
  it('appends matched children into parent', () => {
    const source = makeChildDiv(document.body)
    makeChildSpan(source, 'foo', 'A')
    const parent = makeChildDiv(document.body)
    addElements(parent, source, 'foo')
    expect(parent.children).toHaveLength(1)
  })

  it('appends emptyCount placeholder .field divs', () => {
    const source = makeChildDiv(document.body)
    const parent = makeChildDiv(document.body)
    addElementsWithEmptyElement(parent, source, 3)
    expect(parent.querySelectorAll('.field')).toHaveLength(3)
  })
})

describe('setTabIndex', () => {
  it('sequentially assigns tabindex on descendant inputs', () => {
    const scope = makeChildDiv(document.body)
    const f1 = makeChildDiv(scope, 'f1')
    const f1Inner = makeChildDiv(f1)
    const f1Input = document.createElement('input')
    f1Input.type = 'text'
    f1Inner.appendChild(f1Input)
    const f2 = makeChildDiv(scope, 'f2')
    const f2Inner = makeChildDiv(f2)
    const f2Input = document.createElement('input')
    f2Input.type = 'text'
    f2Inner.appendChild(f2Input)

    const next = setTabIndex(scope, 10, 'f1,f2')
    expect(next).toBe(12)
    expect(f1Input.tabIndex).toBe(10)
    expect(f2Input.tabIndex).toBe(11)
  })
})

describe('createDivWithClasses + moveDivs', () => {
  it('createDivWithClassesAndAppendBefore inserts a new div before selector', () => {
    const parent = makeChildDiv(document.body)
    makeChildSpan(parent, 'target', 'T')
    createDivWithClassesAndAppendBefore(parent, '.target', 'new-class')
    expect(
      parent.querySelector('.target')?.previousElementSibling?.classList.contains('new-class'),
    ).toBe(true)
  })

  it('createDivWithClassesAndAppendAfter inserts after selector', () => {
    const parent = makeChildDiv(document.body)
    makeChildSpan(parent, 'target', 'T')
    createDivWithClassesAndAppendAfter(parent, '.target', 'after-class')
    expect(
      parent.querySelector('.target')?.nextElementSibling?.classList.contains('after-class'),
    ).toBe(true)
  })

  it('createDivWithClassesAndAppendTo appends inside selector', () => {
    const parent = makeChildDiv(document.body)
    makeChildDiv(parent, 'bucket')
    createDivWithClassesAndAppendTo(parent, '.bucket', 'child-class')
    expect(parent.querySelector('.bucket > .child-class')).not.toBeNull()
  })

  it('moveDivToNewParent relocates a single matching child', () => {
    const parent = makeChildDiv(document.body)
    makeChildDiv(parent, 'bucket')
    makeChildSpan(parent, 'item', 'I')
    moveDivToNewParent(parent, '.bucket', '.item')
    expect(parent.querySelector('.bucket > .item')).not.toBeNull()
  })

  it('moveDivsToNewParent relocates all matching children', () => {
    const parent = makeChildDiv(document.body)
    makeChildDiv(parent, 'bucket')
    makeChildSpan(parent, 'item', 'A')
    makeChildSpan(parent, 'item', 'B')
    moveDivsToNewParent(parent, '.bucket', '.item')
    expect(parent.querySelectorAll('.bucket > .item')).toHaveLength(2)
  })
})

describe('applyCSS + addCssClassToField + toggleButtonInForm', () => {
  it('applyCSS sets style properties on selector matches', () => {
    const el = makeChildDiv(document.body, 'target')
    applyCSS(['.target'], { color: 'red', backgroundColor: 'blue' })
    expect(el.style.color).toBe('red')
    expect(el.style.backgroundColor).toBe('blue')
  })

  it('addCssClassToField adds classes to .field.<name> elements', () => {
    const parent = makeChildDiv(document.body)
    makeChildDiv(parent, 'field foo')
    makeChildDiv(parent, 'field bar')
    addCssClassToField(parent, ['foo'], 'highlight', 'big')
    expect(parent.querySelector('.field.foo')?.classList.contains('highlight')).toBe(true)
    expect(parent.querySelector('.field.foo')?.classList.contains('big')).toBe(true)
    expect(parent.querySelector('.field.bar')?.classList.contains('highlight')).toBe(false)
  })

  it('toggleButtonInForm enables/disables a class-matched button', () => {
    const parent = makeChildDiv(document.body)
    const btn = document.createElement('button')
    btn.classList.add('btn-x')
    parent.appendChild(btn)
    toggleButtonInForm(parent, 'btn-x', false)
    expect(btn.disabled).toBe(true)
    expect(btn.classList.contains('disabled')).toBe(true)
    toggleButtonInForm(parent, 'btn-x', true)
    expect(btn.disabled).toBe(false)
    expect(btn.classList.contains('disabled')).toBe(false)
  })
})
