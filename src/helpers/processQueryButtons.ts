import type { ToolButton } from '@serenity-is/corelib'

export type ProcessQueryOptions = {
  field: string
  onClick: (value: unknown) => void
}

/**
 * Factory for a paired "Query" / "Clear" toolbar button group.
 * `onClick(true)` fires for Query, `onClick(false)` for Clear.
 */
export function addProcessQueryButtons(opt: ProcessQueryOptions): ToolButton[] {
  return [
    {
      title: 'Query',
      hint: 'Process query',
      cssClass: 'process-query-button text-blue',
      icon: 'bi bi-search',
      separator: true,
      onClick: () => opt.onClick(true),
    },
    {
      title: 'Clear',
      hint: 'Clear query',
      cssClass: 'clear-query-button text-red',
      icon: 'bi bi-ban',
      onClick: () => opt.onClick(false),
    },
  ]
}
