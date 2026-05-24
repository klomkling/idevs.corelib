export type GridEditableMode =
  | { mode: 'Full' }
  | { mode: 'Off' }
  | { mode: 'Some'; status: string }
