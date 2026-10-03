import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'AeroFMS - FMC & MCDU Simulator',
        short_name: 'AeroFMS',
        description: 'Multi-aircraft FMC & MCDU simulator for flight simulation and training.',
        theme_color: '#0B1018',
        background_color: '#0B1018',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + sql.js wasm are precached so the emulator works fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,pbf,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@aerofms/shared': pkg('shared'),
      '@aerofms/navigation': pkg('navigation'),
      '@aerofms/core': pkg('core'),
      '@aerofms/aircraft': pkg('aircraft'),
      '@aerofms/simulation': pkg('simulation'),
      '@aerofms/training': pkg('training'),
      '@aerofms/i18n': pkg('i18n'),
      '@aerofms/ui': pkg('ui'),
      '@aerofms/cloud': pkg('cloud'),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre'
          if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase'
          return undefined
        },
      },
    },
  },
  server: { port: 5173 },
})
