import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __buildPreviewDialog,
  __sanitizeDownloadName,
  doExportPdf,
} from '../../src/helpers/pdfExportHelper'

vi.mock('@serenity-is/corelib', async () => {
  const actual = await vi.importActual<typeof import('@serenity-is/corelib')>(
    '@serenity-is/corelib'
  )
  return {
    ...actual,
    deepClone: (x: unknown) => JSON.parse(JSON.stringify(x)),
    serviceCall: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
  }
})

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

describe('doExportPdf', () => {
  it('rejects when the server call fails', async () => {
    await expect(
      doExportPdf({
        service: '/svc/foo',
        reportName: 'r',
      } as never)
    ).rejects.toThrow(/500/)
  })
})
