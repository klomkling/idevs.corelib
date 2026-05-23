import { afterEach, describe, expect, it } from 'vitest'
import { __buildPreviewDialog } from '../../src/helpers/pdfExportHelper'

afterEach(() => {
  document.body.replaceChildren()
})

describe('__buildPreviewDialog', () => {
  it('uses textContent for the dialog title (no HTML injection)', () => {
    const { titleEl } = __buildPreviewDialog('blob:fake', '<img src=x onerror=1>', false)
    expect(titleEl.querySelector('img')).toBeNull()
    expect(titleEl.textContent).toBe('<img src=x onerror=1>')
  })

  it('uses a default title when dialogTitle is undefined', () => {
    const { titleEl } = __buildPreviewDialog('blob:fake', undefined, false)
    expect(titleEl.textContent).toBe('PDF Preview')
  })
})
