import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'IMG_4709.jpeg', 'IMG_4710.png', 'favicon.png'],
      manifest: {
        name: 'Wizards Playground',
        short_name: 'Wizards Playground',
        description: "World-Builder's Toolkit for authors and storytellers",
        theme_color: '#1e1b4b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
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
        // WebLLM's JS bundle can reach ~6 MB — raise the precache cap to 10 MiB.
        // Large dynamic-only chunks (WebLLM, ONNX WASM) are excluded below since
        // they are fetched on demand and should not bloat the SW precache manifest.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globIgnores: [
          // Exclude the WebLLM vendor chunk from precaching (downloaded on demand)
          '**/lib-*.js',
        ],
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
    // These packages load WASM / WebGPU resources dynamically — pre-bundling
    // breaks their asset paths and worker instantiation.
    exclude: ['@xenova/transformers', '@mlc-ai/web-llm'],
  },

  // Tauri: prevent Vite from obscuring Rust errors
  clearScreen: false,

  server: {
    // Tauri expects a fixed port
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    // Required for WebLLM/WebGPU: enables SharedArrayBuffer in the browser.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
