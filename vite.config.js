import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Serve the `api/` serverless functions from the vite dev server.
//
// Without this, `npm run dev` 404s every /api call and the whole
// Mongo-backed half of the app (assignments, board content, curriculum)
// is untestable locally -- you can see the UI but nothing it saves.
// `vercel dev` is the official answer, but once a project is linked it
// reads env only from the linked project's Development environment, so
// it starts the functions with no MONGODB_URI and 500s. This reads
// .env.local the way everything else here does.
//
// Dev only: `vite build` never calls configureServer, and in production
// Vercel runs these same files as real serverless functions.
function localApi() {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      for (const file of ['.env.local', '.env']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
          // First file wins, matching vite's own .env precedence.
          // Treat an inherited empty value as absent -- an empty
          // MONGODB_URI is indistinguishable from a missing one here.
          if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
          }
        }
      }

      // Matched on the full path rather than mounted at '/api': connect
      // strips the mount prefix from req.url, and relying on that made the
      // handler name resolve to "api" itself. Matching here also guarantees
      // we claim the request before vite's transform middleware tries to
      // serve api/*.js as a browser module.
      console.log(`[local-api] MONGODB_URI ${process.env.MONGODB_URI ? 'loaded' : 'MISSING'}, db=${process.env.MONGODB_DB}`)

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const name = url.pathname.slice('/api/'.length).split('/')[0]
        const handlerPath = path.resolve(process.cwd(), 'api', `${name}.js`)
        if (!name || !fs.existsSync(handlerPath)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `No API handler for /api/${name}` }))
          return
        }

        // Shape req/res like the Vercel Node runtime does: parsed query,
        // parsed JSON body, and res.status().json().
        const query = Object.fromEntries(url.searchParams)
        let body = {}
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const raw = await new Promise(resolve => {
            let d = ''
            req.on('data', c => { d += c })
            req.on('end', () => resolve(d))
          })
          if (raw) { try { body = JSON.parse(raw) } catch { body = {} } }
        }
        const vercelRes = {
          status(code) { res.statusCode = code; return vercelRes },
          json(payload) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return vercelRes
          },
          end() { res.end(); return vercelRes },
          setHeader: (k, v) => res.setHeader(k, v),
        }

        try {
          // Plain Node import rather than server.ssrLoadModule: these are
          // ordinary server-side ESM that Node runs directly in production,
          // so there is nothing for vite's transform to add. The query
          // string busts Node's module cache, so edits to api/* are picked
          // up without restarting the dev server.
          const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`)
          // headers included deliberately: without them req.headers is
          // undefined here, so api/_auth.js could never see an
          // Authorization header and every local request looked
          // signed-out. That made the auth path untestable in dev while
          // appearing to pass -- the shim's whole job is to look like the
          // Vercel Node runtime, and this was the gap.
          await mod.default({ method: req.method, query, body, headers: req.headers }, vercelRes)
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'local-api failed', detail: String(err?.message || err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
})
