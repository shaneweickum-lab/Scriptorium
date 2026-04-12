import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'logo.svg'],
      manifest: {
        name: 'Wizards Playground',
        short_name: 'Wizards Playground',
        description: "World-Builder's Toolkit for authors and storytellers",
        theme_color: '#1e1b4b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The ONNX Runtime WASM bundle pushes the main chunk above Workbox's
        // default 2 MiB precache limit. Raise it to 5 MiB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Cache HuggingFace model weights and ONNX WASM runtime so the
        // embedding model works offline after the first online load.
        runtimeCaching: [
          {
            // HuggingFace CDN — model weights (*.bin, *.onnx, tokeniser JSON)
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@xenova\/transformers/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-models',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // HuggingFace Hub model files
            urlPattern: /^https:\/\/huggingface\.co\/.+\/resolve\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-models',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  optimizeDeps: {
    // Exclude @xenova/transformers from Vite pre-bundling.
    // It loads ONNX Runtime WebAssembly dynamically; pre-bundling breaks the
    // WASM file paths and worker thread instantiation.
    exclude: ['@xenova/transformers'],
  },
});
