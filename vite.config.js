import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // dev: forward simulation requests to the backend (npm run server)
    proxy: { '/api': 'http://localhost:8788' },
  },
})
