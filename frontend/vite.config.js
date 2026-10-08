import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'
const media = process.env.MEDIA_TARGET || 'http://127.0.0.1:8888'
const root = path.dirname(fileURLToPath(import.meta.url))
// Served under /tess with their original names so the OCR worker can find the
// wasm next to its loader, and a nameplate can be read with no network.
const tessFiles = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm',
  'eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
}

function tessAssets() {
  return {
    name: 'tess-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url || '').split('?')[0].replace(/^\/tess\//, '')
        const rel = (req.url || '').startsWith('/tess/') ? tessFiles[name] : null
        if (!rel) return next()
        res.setHeader('Content-Type', 'application/octet-stream')
        fs.createReadStream(path.join(root, rel)).pipe(res)
      })
    },
    writeBundle(options) {
      const dir = path.resolve(options.dir || path.join(root, 'dist'), 'tess')
      fs.mkdirSync(dir, { recursive: true })
      for (const [name, rel] of Object.entries(tessFiles)) fs.copyFileSync(path.join(root, rel), path.join(dir, name))
    },
  }
}

export default defineConfig({
  plugins: [react(), tessAssets()],
  base: './',
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/img': { target: media, changeOrigin: true },
      '/gif': { target: media, changeOrigin: true }
    }
  },
  build: { chunkSizeWarningLimit: 1500 }
})
