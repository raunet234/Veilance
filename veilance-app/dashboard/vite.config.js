import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3001,
    cors: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  optimizeDeps: {
    exclude: ['@noir-lang/noir_js', '@aztec/bb.js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi'],
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
