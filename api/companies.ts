// Funzione Vercel: POST /api/companies
import { autorizzato, gestisci, type RichiestaAziende } from '../server/openapi.js'

export async function POST(request: Request): Promise<Response> {
  const env = process.env
  if (!autorizzato(request.headers.get('x-app-key'), env)) {
    const msg = env.APP_PASSWORD ? 'Password non valida: inseriscila nelle Impostazioni' : 'Configura APP_PASSWORD su Vercel prima di usare Openapi'
    return Response.json({ errore: msg }, { status: 401 })
  }
  try {
    const body = (await request.json()) as RichiestaAziende
    return Response.json(await gestisci(body, env))
  } catch (e) {
    return Response.json({ errore: (e as Error).message }, { status: 502 })
  }
}
