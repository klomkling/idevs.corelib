import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceCall } from '@serenity-is/corelib'
import { doExportPdf } from '../../src/helpers/pdfExportHelper'

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

const serviceCallMock = vi.mocked(serviceCall)
const createObjectURLMock = vi.fn(() => 'blob:fake')
const revokeObjectURLMock = vi.fn()

beforeEach(() => {
  serviceCallMock.mockReset()
  serviceCallMock.mockRejectedValue(new Error('500 Internal Server Error'))
  createObjectURLMock.mockClear()
  revokeObjectURLMock.mockClear()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  })
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('doExportPdf', () => {
  it('renders the dialog title via textContent', async () => {
    serviceCallMock.mockResolvedValue({
      Content: 'cGRm',
      ContentType: 'application/pdf',
    } as never)

    await doExportPdf({
      service: '/svc/foo',
      reportName: 'r',
      render: true,
      dialogTitle: '<img src=x onerror=1>',
    } as never)

    const titleEl = document.querySelector('.ms-Dialog-title')
    expect(titleEl?.querySelector('img')).toBeNull()
    expect(titleEl?.textContent).toBe('<img src=x onerror=1>')
  })

  it('uses a default title when dialogTitle is undefined', async () => {
    serviceCallMock.mockResolvedValue({
      Content: 'cGRm',
      ContentType: 'application/pdf',
    } as never)

    await doExportPdf({
      service: '/svc/foo',
      reportName: 'r',
      render: true,
    } as never)

    expect(document.querySelector('.ms-Dialog-title')?.textContent).toBe('PDF Preview')
  })

  it('sanitizes the download filename before clicking the link', async () => {
    serviceCallMock.mockResolvedValue({
      Content: 'cGRm',
      ContentType: 'application/pdf',
    } as never)

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('a_b_c.pdf.pdf')
      })

    await doExportPdf({
      service: '/svc/foo',
      reportName: 'a/b\\c.pdf',
    } as never)

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('falls back to a default download filename when reportName is empty', async () => {
    serviceCallMock.mockResolvedValue({
      Content: 'cGRm',
      ContentType: 'application/pdf',
    } as never)

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('report.pdf')
      })

    await doExportPdf({
      service: '/svc/foo',
      reportName: '',
    } as never)

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('preserves safe characters in the download filename', async () => {
    serviceCallMock.mockResolvedValue({
      Content: 'cGRm',
      ContentType: 'application/pdf',
    } as never)

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('Order Report 2026-05.pdf.pdf')
      })

    await doExportPdf({
      service: '/svc/foo',
      reportName: 'Order Report 2026-05.pdf',
    } as never)

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('rejects when the server call fails', async () => {
    await expect(
      doExportPdf({
        service: '/svc/foo',
        reportName: 'r',
      } as never)
    ).rejects.toThrow(/500/)
  })
})
