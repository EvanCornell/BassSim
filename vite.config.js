import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is fully client-side: the solver runs in a Web Worker, projects live
// in LocalStorage, and there is no backend to proxy to. `base: './'` keeps the
// build servable from a subdirectory — a GitHub Pages project site, say —
// rather than only from a domain root.
export default defineConfig({
  plugins: [react()],
  base: './',
  // The simulation worker loads ngspice (several megabytes of WebAssembly) with
  // a dynamic import, which needs ES-module workers to be split into its own
  // chunk rather than inlined.
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1200 },
})
