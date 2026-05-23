import { deepClone, serviceCall } from '@serenity-is/corelib'
import { IdevsContentResponse, IdevsExportOptions, IdevsExportRequest } from '../types/export'

/**
 * Builds the core elements of the PDF preview dialog (overlay container, title,
 * iframe) using DOM APIs only. Caller-supplied `dialogTitle` is rendered via
 * `textContent`, which escapes HTML and prevents XSS through the title.
 *
 * The `__` prefix indicates this helper is exported for testing only and is not
 * part of the public API.
 */
/**
 * Sanitizes a user-supplied report name for safe use as a download filename.
 * Replaces any character outside [A-Za-z0-9_.\- ] with `_`, and returns
 * `'report'` when the input is empty.
 *
 * The `__` prefix indicates this helper is exported for testing only and is not
 * part of the public API.
 */
export function __sanitizeDownloadName(name: string): string {
  if (!name) return 'report'
  return name.replace(/[^\w.\- ]/g, '_')
}

export function __buildPreviewDialog(
  objectUrl: string,
  dialogTitle: string | undefined,
  autoPrint: boolean
  // eslint-disable-next-line no-undef
): { container: HTMLDivElement; titleEl: HTMLDivElement; iframe: HTMLIFrameElement } {
  const container = document.createElement('div')
  container.className = 'ms-Dialog-overlay'
  container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `

  const titleEl = document.createElement('div')
  titleEl.className = 'ms-Dialog-title'
  titleEl.textContent = dialogTitle ?? 'PDF Preview' // safe: textContent escapes
  titleEl.style.cssText = `
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #323130;
    `

  const iframe = document.createElement('iframe')
  iframe.src = objectUrl
  iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
    `

  if (autoPrint) {
    let printTriggered = false
    iframe.onload = () => {
      if (printTriggered) return
      printTriggered = true
      // eslint-disable-next-line no-undef
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch (e) {
          console.warn('Error triggering print:', e)
        }
      }, 1000)
    }
  }

  return { container, titleEl, iframe }
}

export function doExportPdf(options: IdevsExportOptions): void {
  const grid = options.grid
  let request: IdevsExportRequest

  if (grid) {
    // Grid-based export (existing behavior)
    request = deepClone(grid.getView().params) as IdevsExportRequest
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
  } else {
    // Manual export (no grid)
    request = {} as IdevsExportRequest
    request.Take = 0
    request.Skip = 0
  }

  request.viewName = options.viewName
  request.companyName = options.companyName
  request.reportName = options.reportName
  request.selectionRange = options.selectionRange
  request.conditionRange = options.conditionRange
  request.logo = options.logo
  request.entity = options.entity

  serviceCall({
    service: options.service,
    request: request,
  }).then((response: IdevsContentResponse) => {
    const pdfContent = response.Content
    const blob = base64ToBlob(pdfContent, response.ContentType)
    const objectUrl = URL.createObjectURL(blob)

    const render = options.render || false;
    if (render) {
      showFluentPdfPreview(objectUrl, options.dialogTitle, options.openPrintDialog ?? false)
    }
    else {
      // Download mode
      const blob = base64ToBlob(pdfContent, response.ContentType)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const safeName = __sanitizeDownloadName(options.reportName ?? '')
      link.download = `${safeName}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up
      // eslint-disable-next-line no-undef
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000);
    }
  });
}

function showFluentPdfPreview(
  objectUrl: string,
  dialogTitle?: string,
  autoPrint: boolean = false
): void {
  // Build the core dialog elements (overlay container, title, iframe) via DOM APIs.
  // Title is set with textContent inside the helper — safe from HTML injection.
  const { container: dialogContainer, titleEl, iframe } = __buildPreviewDialog(
    objectUrl,
    dialogTitle,
    autoPrint
  )

  // Create dialog content
  const dialog = document.createElement('div')
  dialog.className = 'ms-Dialog ms-Depth-64'
  dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        box-shadow: 0 25.6px 57.6px rgba(0, 0, 0, 0.22), 0 4.8px 14.4px rgba(0, 0, 0, 0.18);
        width: 90vw;
        height: 90vh;
        max-width: 1200px;
        max-height: 800px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `

  // Create header
  const header = document.createElement('div')
  header.className = 'ms-Dialog-header'
  header.style.cssText = `
        padding: 8px 16px 8px 24px;
        border-bottom: 1px solid #e1dfdd;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `

  const closeButton = document.createElement('button')
  closeButton.className = 'ms-Button ms-Button--icon'
  closeButton.textContent = '✕'
  closeButton.style.cssText = `
        background: transparent;
        border: none;
        font-size: 16px;
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
        color: #605e5c;
    `
  closeButton.onmouseover = () => {
    closeButton.style.backgroundColor = '#f3f2f1'
  }
  closeButton.onmouseout = () => {
    closeButton.style.backgroundColor = 'transparent'
  }

  header.appendChild(titleEl)
  header.appendChild(closeButton)

  // Create content area
  const content = document.createElement('div')
  content.className = 'ms-Dialog-content'
  content.style.cssText = `
        flex: 1;
        padding: 0;
        overflow: hidden;
    `

  content.appendChild(iframe)

  // Assemble dialog
  dialog.appendChild(header)
  dialog.appendChild(content)
  dialogContainer.appendChild(dialog)

  // Add event listeners
  const closeDialog = () => {
    URL.revokeObjectURL(objectUrl)
    document.body.removeChild(dialogContainer)
  }

  closeButton.addEventListener('click', closeDialog)

  // Close on backdrop click
  dialogContainer.addEventListener('click', e => {
    if (e.target === dialogContainer) {
      closeDialog()
    }
  })

  // Close on Escape key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeDialog()
      document.removeEventListener('keydown', handleKeyDown)
    }
  }
  document.addEventListener('keydown', handleKeyDown)

  // Add to DOM
  document.body.appendChild(dialogContainer)

  // Animate in
  dialogContainer.style.opacity = '0'
  dialog.style.transform = 'scale(0.9)'

  // eslint-disable-next-line no-undef
  requestAnimationFrame(() => {
    dialogContainer.style.transition = 'opacity 0.2s ease'
    dialog.style.transition = 'transform 0.2s ease'
    dialogContainer.style.opacity = '1'
    dialog.style.transform = 'scale(1)'
  })
}

// Helper function to convert base64 to blob
function base64ToBlob(base64: string, contentType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: contentType })
}
