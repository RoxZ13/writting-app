import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: {
    // Shown in Settings, so it is clear which version is open.
    __BUILD__: JSON.stringify(new Date().toISOString()),
    __PREVIEW__: JSON.stringify(!!process.env.VITE_DB_NAME),
  },
  plugins: [
    react(),
    VitePWA({
      // Updates are applied by main.tsx at a calm moment, never mid-sentence.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Manuscript.',
        short_name: 'Manuscript',
        description: 'Рабочий стол автора: сюжет, сцены и маячки в одном месте.',
        lang: 'ru',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The test version lives under /preview/ with its own worker; the main one must not answer for it.
        navigateFallbackDenylist: process.env.VITE_DB_NAME ? [] : [/\/preview\//],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
