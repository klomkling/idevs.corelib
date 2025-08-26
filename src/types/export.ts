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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (e: any) => void
}

export type IdevsContentResponse = ServiceResponse & {
  Content: string
  ContentType: string
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
