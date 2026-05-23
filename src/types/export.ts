import { DataGrid, ListRequest, ServiceResponse, ToolButton } from '@serenity-is/corelib'

export enum PageSizes {
  A4 = 0,
  A3 = 1,
}

export enum PageOrientations {
  Portrait = 0,
  Landscape = 1,
}

export type PageSize = {
  Size: PageSizes
  Orientation: PageOrientations
}

export type PageMargin = {
  MarginLeft: string
  MarginTop: string
  MarginRight: string
  MarginBottom: string
}

export type IdevsExportRequest = ListRequest & {
  viewName?: string
  companyName?: string
  reportName?: string
  selectionRange?: string
  conditionRange?: string
  logo?: string
  pageSize?: PageSize
  margin?: PageMargin
  entity?: unknown
  render?: boolean
  openPrintDialog?: boolean
}

export type IdevsExportOptions = IdevsExportRequest & {
  service: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grid?: DataGrid<any, any>
  dialogTitle?: string
}

export type ExportOptions = IdevsExportOptions & {
  title?: string
  hint?: string
  separator?: boolean
  exportType: 'PDF' | 'XLSX'
  onClick?: (e: Event) => void
}

/**
 * Options specific to `doExportPdf`. The `render`, `openPrintDialog`,
 * and `dialogTitle` fields only have effect on the PDF path.
 * @since 1.1.0
 */
export type PdfExportOptions = IdevsExportOptions & {
  render?: boolean
  openPrintDialog?: boolean
  dialogTitle?: string
}

/**
 * Options specific to `doExportExcel`. Unlike `IdevsExportOptions` where `grid`
 * is optional, the Excel path requires a grid (it serializes the columns and
 * view state). Passing `ExcelExportOptions` without a grid is a compile-time
 * error; the runtime guard in `doExportExcel` is now a redundant safety net
 * rather than the primary contract.
 *
 * The Excel path uses `postToService` (form-post redirect), so the PDF
 * render/print flags from `PdfExportOptions` are ignored.
 *
 * @since 1.1.0
 */
export type ExcelExportOptions = Omit<IdevsExportOptions, 'grid'> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grid: DataGrid<any, any>
}

export type IdevsContentResponse = ServiceResponse & {
  Content: string
  ContentType: string
  /**
   * Filename the server suggests for the download. Matches the .NET DTO
   * `Idevs.Models.IdevsContentResponse.DownloadName`.
   * @since 1.1.0
   */
  DownloadName?: string
  /**
   * @deprecated since 1.1.0 — the server emits `DownloadName`, not `FileName`.
   * This field has always been `undefined` at runtime. Use `DownloadName`.
   * Will be removed in 2.0.0.
   */
  FileName?: string
}

export function createExportToolButton(options: ExportOptions): ToolButton {
  return {
    hint: options.hint ?? options.exportType,
    title: options.title ?? '',
    cssClass: `export-${options.exportType.toLowerCase()}-button`,
    onClick: options.onClick,
    separator: options.separator,
  }
}
