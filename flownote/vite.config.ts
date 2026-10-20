import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Shared interop helpers must not make React depend on a lazy editor.
          if (id.includes('commonjsHelpers.js')) return 'vendor-react'
          // Match package roots: '/react/' also matches @blocknote/react.
          if (/\/node_modules\/(react-dom|react|scheduler)\//.test(id)) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})
