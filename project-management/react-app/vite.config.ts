import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from '@vite-pwa/plugin-pwa'

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
  test: {
    environment: 'jsdom',
    setupFiles: [],
    globals: true
  }
})


