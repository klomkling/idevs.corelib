export * from './idevsEntityGrid'
export * from './idevsSearchGrid'

// IdevsSelectableEntityGrid is intentionally NOT re-exported from this
// barrel — it depends on `@serenity-is/extensions`, an OPTIONAL peer
// dependency (extensions ships only with Serenity's .NET install, not
// the public npm registry). Re-exporting here would force extensions
// resolution for every consumer of the main `@idevs/corelib` entry,
// even those who never use this grid. Import it directly:
//
//   import { IdevsSelectableEntityGrid } from '@idevs/corelib/grids/idevsSelectableEntityGrid'
//
// Consumers using this subpath must have `@serenity-is/extensions`
// resolvable in their dependency tree.
//
// The same applies to IdevsGridEditorBase (next batch).
