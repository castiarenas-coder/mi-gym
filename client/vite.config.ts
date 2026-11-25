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
    // El servidor solo atiende Host/Origin propios: el proxy los reescribe al del backend.
    proxy: Object.fromEntries(['/api', '/img', '/media'].map(ruta => [ruta, {
      target: backend,
      changeOrigin: true,
      configure: (proxy: { on: (e: 'proxyReq', f: (r: { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void }) => void) => void }) => {
        proxy.on('proxyReq', req => { if (req.getHeader('origin')) req.setHeader('origin', backend) })
      },
    }])),
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 15000,
  },
})
