import { afterEach, describe, expect, it } from 'vitest'
import { __buildPreviewDialog, __sanitizeDownloadName } from '../../src/helpers/pdfExportHelper'

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

describe('__sanitizeDownloadName', () => {
  it('strips path separators and control chars', () => {
    expect(__sanitizeDownloadName('a/b\\c.pdf')).toBe('a_b_c.pdf')
  })

  it('preserves safe characters', () => {
    expect(__sanitizeDownloadName('Order Report 2026-05.pdf')).toBe('Order Report 2026-05.pdf')
  })

  it('returns a fallback when input is empty', () => {
    expect(__sanitizeDownloadName('')).toBe('report')
  })
})
