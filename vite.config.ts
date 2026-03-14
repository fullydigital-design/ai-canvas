import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    // Proxy for local ComfyUI server (bypasses CORS in dev mode).
    // Usage: set ComfyUI URL in the app to http://localhost:8188 and launch
    // ComfyUI with --enable-cors-header for full CORS support.
    // The proxy here covers direct Vite dev-server requests as a fallback.
    proxy: {
      '/comfyui-proxy': {
        target: 'http://localhost:8188',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/comfyui-proxy/, ''),
      },
    },
    cors: true,
  },
})
