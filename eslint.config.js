import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'

export default [
  // Base ESLint recommended rules
  js.configs.recommended,
  
  // TypeScript files configuration
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        atob: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        // DOM element types
        HTMLDivElement: 'readonly',
        HTMLLIElement: 'readonly',
        HTMLIFrameElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLLabelElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSpanElement: 'readonly',
        CSSStyleDeclaration: 'readonly',
        MutationObserver: 'readonly',
        Event: 'readonly',
        FocusEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Node: 'readonly',
        ClipboardEvent: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        getComputedStyle: 'readonly',
        // Timers
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // jQuery globals
        $: 'readonly',
        jQuery: 'readonly',
        JQuery: 'readonly',
        // PDF/jsPDF globals
        jsPDF: 'readonly',
        // Node globals (for build process)
        Buffer: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Disable base no-unused-vars; the TS-aware version below handles
      // TypeScript enum members, overload params, and ambient declarations
      // correctly (the base rule does not).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-undef': 'error',
      'no-useless-escape': 'error',
    },
  },
  
  // Prettier configuration (disables conflicting rules)
  prettierConfig,
  
  // Global ignores
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.js',
      'eslint.config.js', // Ignore this config file itself
    ],
  },
]
