import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: [],
    manifest: {
      name: 'KSE PM React',
      short_name: 'KSE PM',
      theme_color: '#0ea5e9',
      background_color: '#ffffff',
      display: 'standalone',
      icons: []
    }
  })],
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      '@kse/ui': path.resolve(__dirname, '../../packages/ui/src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    globals: true
  }
})


