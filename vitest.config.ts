import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Enable global `describe`, `it`, etc.
    environment: 'node', // Set the environment to Node.js
    coverage: {
      provider: 'istanbul', // Use Istanbul for coverage
      reporter: ['text', 'json', 'html'], // Coverage report formats
      reportsDirectory: './coverage', // Directory for coverage reports
      include: ['src/**/*.{ts,tsx}'], // Include only source files
      exclude: ['tests/**/*', 'node_modules'], // Exclude test files and node_modules
    },
  },
});
