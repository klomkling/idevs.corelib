# @idevs/corelib

![npm version](https://img.shields.io/npm/v/@idevs/corelib.svg)
![license](https://img.shields.io/npm/l/@idevs/corelib.svg)

A comprehensive library of extended components and utilities for the Serenity Framework. This library provides additional editors, formatters, dialogs, panels, grids, UI components, and helper functions to enhance Serenity applications.

## Features

- 🎛️ **Extended Editors**: Checkbox, date, tag, numeric tag, search-button, and self-search editors
- 📊 **Custom Formatters**: Specialized data formatters for grids and displays
- 🧩 **Dialogs, Panels, and Grids**: Serenity building blocks with hardened lifecycle and validation behavior
- 🎨 **UI Components**: Enhanced toolbar buttons and UI widgets
- 🛠️ **Utility Functions**: Date, DOM, layout, dialog, filter, and formatting utilities
- 📄 **Export Helpers**: PDF and Excel export functionality
- 🌐 **TypeScript**: Full TypeScript support with type definitions

## Installation

```bash
npm install @idevs/corelib
```

## Runtime dependencies

`@idevs/corelib` ships against the following peers, declared in your app's
`package.json`:

| Package                   | Range        | Required                                           |
| ------------------------- | ------------ | -------------------------------------------------- |
| `@serenity-is/corelib`    | `>=8.8.6 <9` | yes                                                |
| `@serenity-is/sleekgrid`  | `>=1.9.6 <2` | yes                                                |
| `@serenity-is/extensions` | `>=8.7 <11`  | optional (used by selectable/grid-editor subpaths) |
| `flatpickr`               | `>=4.6 <5`   | optional (used by `IdevsDateEditor`)               |
| `jquery`                  | `>=3.5`      | optional (used by UI helpers)                      |
| `jspdf`                   | `>=3`        | optional (used by PDF helpers)                     |

### Compatibility matrix

`@idevs/corelib` tracks the same Serenity major as its server-side
companion [Idevs.Net.CoreLib](https://www.nuget.org/packages/Idevs.Net.CoreLib).
Serenity 9.x is intentionally skipped — pick the lane that matches your
target framework:

| Lane        | `Idevs.Net.CoreLib` | .NET TFM  | `Serenity.Net.Services` | `@serenity-is/corelib` | `@idevs/corelib`  |
| ----------- | ------------------- | --------- | ----------------------- | ---------------------- | ----------------- |
| **Current** | 0.7.x               | `net8.0`  | `8.8.9`                 | `>=8.8.6 <9`           | **1.x**           |
| **Future**  | 0.8+ (planned)      | `net10.0` | `10.x`                  | `>=10.0.0 <11`         | **2.x** (planned) |

The TS DTOs in `@idevs/corelib/types/export` mirror the .NET `Idevs.Models.*`
DTOs; see [MIGRATION.md](./MIGRATION.md) for naming changes between versions.

### Install bridge

You normally do **not** run `npm install @idevs/corelib` yourself. The
`Idevs.Net.CoreLib` NuGet package ships an MSBuild `.targets` file that runs
the npm install for you on first `dotnet build`, pinned to the npm major
matching your `Idevs.Net.CoreLib` version (see the matrix above). It also
copies CSS assets from `node_modules/@idevs/corelib/css/` into
`wwwroot/lib/Idevs/Content/`.

To opt out (e.g., air-gapped CI), set in your `.csproj`:

```xml
<PropertyGroup>
  <IdevsCoreLibInstallNpmPackage>false</IdevsCoreLibInstallNpmPackage>
</PropertyGroup>
```

…and provision `@idevs/corelib` manually.

## Quick Start

### Basic Usage

```typescript
import {
  CheckboxButtonEditor,
  ZeroDisplayFormatter,
  DropdownToolButton,
  // Utility functions
  toDateString,
  getElementWidth,
  createExportToolButton,
} from '@idevs/corelib'

// The library also extends global prototypes for convenience
// (though we recommend using the utility functions directly)
const timeStr = (120).toTimeString() // "02:00"
const truncated = 'Hello World'.truncate(5) // "Hell…"
```

### TypeScript Configuration

After installing, update your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@idevs/*": ["node_modules/@idevs/*/dist/index"]
    }
  }
}
```

> **Note**: Since version 1.0.0, the package only ships with built files. The TypeScript definitions are automatically available from the `dist/` folder.

### Editors

Most editors are available from the root entry or the editors barrel:

```typescript
import {
  IdevsTagEditor,
  IdevsNumericTagEditor,
  IdevsSearchButtonEditor,
  IdevsSelfSearchButtonEditor,
  SlickSearchButtonEditor,
  SlickSelfSearchButtonEditor,
} from '@idevs/corelib'
```

`IdevsDateEditor` is subpath-only because `flatpickr` is optional:

```typescript
import { IdevsDateEditor } from '@idevs/corelib/editors/idevsDateEditor'
```

#### CheckboxButtonEditor

A multi-checkbox editor that displays options as button-style checkboxes.

```typescript
@Decorators.registerEditor()
export class MyForm extends EntityDialog {
  protected form = {
    categories: new CheckboxButtonEditor({
      lookupKey: 'MyModule.CategoryLookup',
    }),
  }
}
```

### Dialogs, Panels, and Grids

```typescript
import {
  IdevsEntityDialog,
  IdevsInlineDialog,
  IdevsPanel,
  IdevsTabControl,
  IdevsEntityGrid,
  IdevsSearchGrid,
  IdevsGridEditController,
} from '@idevs/corelib'
```

The selectable/grid-editor bases depend on Serenity's optional
`@serenity-is/extensions` package and are exposed through subpaths:

```typescript
import { IdevsSelectableEntityGrid } from '@idevs/corelib/grids/idevsSelectableEntityGrid'
import { IdevsGridEditorBase } from '@idevs/corelib/grids/idevsGridEditorBase'
```

### Formatters

#### ZeroDisplayFormatter

Displays custom text when value is zero.

```typescript
columns.push({
  field: 'Amount',
  formatter: ZeroDisplayFormatter,
  formatterParams: { displayText: 'N/A' },
})
```

#### CheckboxFormatter

Displays checkboxes with customizable icons.

```typescript
columns.push({
  field: 'IsActive',
  formatter: CheckboxFormatter,
  formatterParams: {
    trueValueIcon: 'mdi mdi-check-circle',
    falseValueIcon: 'mdi mdi-close-circle',
  },
})
```

### UI Components

#### DropdownToolButton

A toolbar button with dropdown menu functionality.

```typescript
const exportButton = new DropdownToolButton({
  title: 'Export',
  cssClass: 'export-dropdown',
  items: [
    { text: 'Export PDF', onClick: () => exportToPDF() },
    { text: 'Export Excel', onClick: () => exportToExcel() },
  ],
})
```

### Utility Functions

#### Date Utilities

```typescript
import { toDateString, toSqlDateString, toBeginMonth, toEndMonth } from '@idevs/corelib'

const formatted = toDateString(new Date()) // "31/12/2024"
const sqlDate = toSqlDateString(new Date()) // "2024-12-31"
const monthStart = toBeginMonth('2024-06-15') // "2024-06-01"
const monthEnd = toEndMonth('2024-06-15') // "2024-06-30"
```

#### DOM Utilities

```typescript
import { getElementWidth, removeChildren, isOverflow } from '@idevs/corelib'

const width = getElementWidth(element)
removeChildren(containerElement)
const hasOverflow = isOverflow(element)
```

#### Format Utilities

```typescript
import {
  toTimeString,
  toDecimalString,
  truncateString,
  RoundingMethod,
  roundByMethod,
} from '@idevs/corelib'

const time = toTimeString(150) // "02:30"
const decimal = toDecimalString(123.456, 2) // "123.46"
const short = truncateString('Long text here', 10) // "Long text…"
const rounded = roundByMethod('123.47', RoundingMethod.Quarter25) // 123.25
```

### Export Functionality

```typescript
import { createExportToolButton, ExportOptions } from '@idevs/corelib'

const exportOptions: ExportOptions = {
  grid: myDataGrid,
  service: 'MyModule/MyService',
  exportType: 'PDF',
  title: 'Export PDF',
  onClick: () => handleExport(),
}

const toolButton = createExportToolButton(exportOptions)
```

## Migration Guide

If you're upgrading from an earlier version:

### Upgrading from 1.1.1 to 1.5.0

Version 1.5.0 adds editors, dialogs, panels, grids, and helpers. Existing 1.1.1
consumers should review [MIGRATION.md](./MIGRATION.md), especially optional peer
dependencies, subpath-only imports, and legacy-to-`Idevs*` API renames.

### Breaking Changes in v1.0.0

- Reorganized module structure with better separation of concerns
- Some utility functions moved to dedicated modules
- TypeScript strict mode enabled - may require type fixes
- ESLint rules updated - may require code style updates

### Recommended Migration

1. Update imports to use the new modular structure:

   ```typescript
   // Old
   import { someFunction } from '@idevs/corelib/globals'

   // New
   import { someFunction } from '@idevs/corelib'
   // or more specifically:
   import { someFunction } from '@idevs/corelib/utils'
   ```

2. Consider using utility functions instead of prototype extensions:

   ```typescript
   // Instead of:
   const result = someString.truncate(10)

   // Consider:
   import { truncateString } from '@idevs/corelib'
   const result = truncateString(someString, 10)
   ```

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Watch for changes during development
npm run dev

# Run linting
npm run lint

# Format code
npm run format
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Authors

- [@klomkling](https://www.github.com/klomkling) - Sarawut Phaekuntod
