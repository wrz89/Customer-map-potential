// Nei test i dati di public/data si leggono dal disco al posto di fetch.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input)
  const m = url.match(/\/data\/(.+)$/)
  if (!m) throw new Error(`fetch non previsto nei test: ${url}`)
  try {
    const body = await readFile(join(process.cwd(), 'public', 'data', m[1]), 'utf-8')
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}) as typeof fetch
