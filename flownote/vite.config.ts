import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss()
  ],
  server:{
    host: process.env.VITE_DEV_HOST ?? '0.0.0.0',
    port: Number(process.env.VITE_DEV_PORT ?? 5173)
  },
})
