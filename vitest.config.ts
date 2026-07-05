import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // lib/db/client imports `@prisma/client/wasm` (forces the wasm engine on
      // Cloudflare Workers). That subpath's ESM `import` condition points at a
      // `wasm.mjs` Prisma doesn't ship, so Node/vitest can't resolve it. Tests
      // run on Node and mock the DB, so map it to the regular client here.
      '@prisma/client/wasm': '@prisma/client',
    },
  },
})
