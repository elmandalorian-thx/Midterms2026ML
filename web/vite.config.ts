import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const BASE = '/Midterms2026ML/'
// Single copy of every dataset lives in the repo's data/ folder; the site serves it for download.
const DIRS = {
  raw: fileURLToPath(new URL('../data/raw/', import.meta.url)),
  forecast: fileURLToPath(new URL('../data/forecast/', import.meta.url)),
}
const files = (dir: string) => readdirSync(dir).filter((f) => /\.(csv|json)$/.test(f))
const TYPES: Record<string, string> = { csv: 'text/csv; charset=utf-8', json: 'application/json' }

/** Serves data/raw and data/forecast at <base>data/<raw|forecast>/<file> in dev and copies them into the build. */
function projectData(): Plugin {
  return {
    name: 'project-data',
    configureServer(server) {
      for (const [key, dir] of Object.entries(DIRS)) {
        server.middlewares.use(`${BASE}data/${key}`, (req, res, next) => {
          const name = (req.url ?? '').split('?')[0].replace(/^\//, '')
          if (!files(dir).includes(name)) return next()
          res.setHeader('Content-Type', TYPES[name.split('.').pop()!])
          res.end(readFileSync(dir + name))
        })
      }
    },
    generateBundle() {
      for (const [key, dir] of Object.entries(DIRS)) {
        for (const f of files(dir)) this.emitFile({ type: 'asset', fileName: `data/${key}/${f}`, source: readFileSync(dir + f) })
      }
    },
  }
}

// Served from GitHub Pages at /Midterms2026ML/
export default defineConfig({
  base: BASE,
  plugins: [react(), projectData()],
  // Two pages: the walkthrough (/) and the election-night tracker (/live/)
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), live: resolve(import.meta.dirname, 'live/index.html') } } },
})
