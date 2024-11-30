import eslintPlugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules', 'dist'], // Exclude these folders
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'], // Apply to TypeScript files
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest', // Support modern syntax
        sourceType: 'module', // ESM modules
        project: './tsconfig.json', // Point to your TypeScript config
      },
    },
    plugins: {
      '@typescript-eslint': eslintPlugin,
    },
    rules: {
      'no-unused-vars': 'off', // Disable base rule
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ], // Enable TS version
      '@typescript-eslint/no-explicit-any': 'warn', // Warn on `any`
      '@typescript-eslint/no-floating-promises': 'error', // Catch unhandled promises
      '@typescript-eslint/no-misused-promises': 'error', // Prevent misuse of promises
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ], // Enforce `import type`
      '@typescript-eslint/explicit-function-return-type': 'off', // Optional, based on preferences
    },
  },
];
