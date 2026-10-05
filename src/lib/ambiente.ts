// Differenze tra l'app vera (Vercel) e la demo pubblicata come pagina su claude.ai.

/** Demo: niente server, niente servizi esterni, aziende dimostrative. */
export const DEMO = import.meta.env.VITE_DEMO === '1'

interface ClaudeRuntime {
  use: (nome: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null>
}

/** Fa scaricare un file: nella pagina claude.ai passa dalla conferma della piattaforma. */
export async function salvaFile(nome: string, blob: Blob): Promise<void> {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude
  if (claude?.use) {
    const downloads = await claude.use('downloads').catch(() => null)
    if (downloads) {
      await downloads.save({ filename: nome, data: blob })
      return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
