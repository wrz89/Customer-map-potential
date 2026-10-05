import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { autorizzato, gestisci } from './server/openapi.ts'

// In sviluppo la funzione /api/companies gira dentro Vite, con le variabili di .env.local
function apiLocale(env: Record<string, string>): Plugin {
  return {
    name: 'api-locale',
    configureServer(server) {
      server.middlewares.use('/api/companies', async (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { errore: 'Usa POST' })
        if (!autorizzato(req.headers['x-app-key'] as string | undefined, env)) return send(401, { errore: env.APP_PASSWORD ? 'Password non valida: inseriscila nelle Impostazioni' : 'Configura APP_PASSWORD in .env.local prima di usare Openapi' })
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', async () => {
          try {
            send(200, await gestisci(JSON.parse(raw || '{}'), env))
          } catch (e) {
            send(502, { errore: (e as Error).message })
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // "npm run build:demo": pagina autonoma per claude.ai, con percorsi relativi
  const demo = mode === 'demo'
  return {
    base: demo ? './' : '/',
    plugins: [react(), tailwindcss(), apiLocale(env)],
    build: { chunkSizeWarningLimit: 2500, outDir: demo ? 'dist-demo' : 'dist' },
    // MapLibre carica il suo worker con new URL(..., import.meta.url): non va pre-impacchettato
    optimizeDeps: { exclude: ['maplibre-gl'] },
    worker: { format: 'es' as const },
  }
})
