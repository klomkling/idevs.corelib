import { deepClone, postToService } from '@serenity-is/corelib'
import { IdevsExportOptions, IdevsExportRequest } from '../globals'

export function doExportExcel(options: IdevsExportOptions): void {
  const grid = options.grid
  if (!grid) {
    throw new Error('doExportExcel requires options.grid')
  }
  const request = deepClone(grid.getView().params) as IdevsExportRequest
  request.Take = 0
  request.Skip = 0
  const sortBy = grid.getView().sortBy
  if (sortBy) {
    request.Sort = sortBy
  }

  request.ExportColumns = []
  const columns = grid.getGrid().getColumns()
  for (const column of columns) {
    request.ExportColumns.push(column.id || column.field || '')
  }
  request.ExportColumns = request.ExportColumns.filter(column => !!column)
  request.viewName = options.viewName
  request.companyName = options.companyName
  request.reportName = options.reportName
  request.selectionRange = options.selectionRange
  request.conditionRange = options.conditionRange
  request.logo = options.logo
  request.entity = options.entity

  postToService({ service: options.service, request: request, target: '_blank' })
}
