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
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react'
          if (id.includes('/@blocknote/mantine/')) return 'editor-integration'
          if (id.includes('/@blocknote/') || id.includes('/@tiptap/')) return 'editor-blocknote'
          if (id.includes('/prosemirror-') || id.includes('/orderedmap/')) return 'editor-prosemirror'
          if (id.includes('/yjs/') || id.includes('/y-prosemirror/') || id.includes('/lib0/')) return 'editor-yjs'
          return undefined
        },
      },
    },
  },
  server:{
    host: process.env.VITE_DEV_HOST ?? '0.0.0.0',
    port: Number(process.env.VITE_DEV_PORT ?? 5173)
  },
})
