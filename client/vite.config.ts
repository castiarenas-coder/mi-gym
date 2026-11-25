/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// En desarrollo, la API y las fotos se piden al servidor Node.
const backend = 'http://127.0.0.1:8788'

const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    port: 5174,
    proxy: { '/api': backend, '/img': backend, '/media': backend },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 15000,
  },
})
