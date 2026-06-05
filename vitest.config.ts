/**
 * vitest.config.ts — Sprint 10E
 *
 * Resolves the same @/* path alias the Next.js tsconfig uses so test
 * files can import production modules with the same paths. No browser
 * env: these are pure-logic unit tests, no React, no DB.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
