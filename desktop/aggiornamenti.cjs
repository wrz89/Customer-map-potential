// Aggiornamento automatico dalle release GitHub della repo.
// - Versione installata (Setup): electron-updater scarica in background e installa alla chiusura.
// - Versione portatile (zip): scarica il nuovo .exe accanto a quello in uso e lo sostituisce al riavvio.
// Nessun token: la repo è pubblica e si legge solo la release più recente.
const { app, dialog, net, shell, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REPO = 'wrz89/customer-map-potential'
const PAGINA = `https://github.com/${REPO}/releases/latest`
const ASSET_PORTATILE = 'Customer-Map-Potential-Portable.exe'
const OGNI = 6 * 60 * 60 * 1000

const portatile = () => !!process.env.PORTABLE_EXECUTABLE_FILE
// Prova automatica (controlli su Windows): --prova-aggiornamento=percorso\esito.json
const PROVA = process.argv.find((a) => a.startsWith('--prova-aggiornamento='))?.split('=').slice(1).join('=')

let stato = { fase: 'inattivo', versione: app.getVersion(), nuova: null, percentuale: 0, messaggio: '' }
let inCorso = null
let pronto = null // portatile: { file, versione }
let updater = null

function aggiorna(v) {
  stato = { ...stato, ...v }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('aggiornamenti:stato', stato)
}

/** Confronto semplice di versioni x.y.z */
function piuNuova(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number)
  const pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/* ---------- versione installata ---------- */

function preparaUpdater() {
  if (updater) return updater
  updater = require('electron-updater').autoUpdater
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.on('checking-for-update', () => aggiorna({ fase: 'verifica', messaggio: '' }))
  updater.on('update-not-available', () => aggiorna({ fase: 'aggiornato', messaggio: '' }))
  updater.on('update-available', (i) => aggiorna({ fase: 'download', nuova: i.version, percentuale: 0 }))
  updater.on('download-progress', (p) => aggiorna({ fase: 'download', percentuale: Math.round(p.percent) }))
  updater.on('update-downloaded', (i) => {
    aggiorna({ fase: 'pronto', nuova: i.version, percentuale: 100 })
    chiediRiavvio(i.version)
  })
  updater.on('error', (e) => aggiorna({ fase: 'errore', messaggio: messaggioErrore(e) }))
  return updater
}

/* ---------- versione portatile ---------- */

async function ultimaRelease() {
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Customer-Map-Potential' },
  })
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`)
  return r.json()
}

async function verificaPortatile() {
  aggiorna({ fase: 'verifica', messaggio: '' })
  const rel = await ultimaRelease()
  const nuova = String(rel.tag_name || '').replace(/^v/, '')
  if (!piuNuova(nuova, app.getVersion())) return aggiorna({ fase: 'aggiornato', nuova: null })
  if (pronto?.versione === nuova) return aggiorna({ fase: 'pronto', nuova })
  const asset = (rel.assets || []).find((a) => a.name === ASSET_PORTATILE)
  if (!asset) throw new Error('La nuova versione non contiene il programma portatile')

  const destinazione = process.env.PORTABLE_EXECUTABLE_FILE
  const temporaneo = `${destinazione}.nuovo`
  aggiorna({ fase: 'download', nuova, percentuale: 0 })
  const r = await net.fetch(asset.browser_download_url)
  if (!r.ok || !r.body) throw new Error(`Download non riuscito (${r.status})`)
  const totale = Number(r.headers.get('content-length')) || asset.size
  const hash = crypto.createHash('sha256')
  const out = fs.createWriteStream(temporaneo)
  let letti = 0
  try {
    for await (const pezzo of r.body) {
      hash.update(pezzo)
      letti += pezzo.length
      if (!out.write(pezzo)) await new Promise((ok) => out.once('drain', ok))
      aggiorna({ percentuale: Math.round((letti / totale) * 100) })
    }
    await new Promise((ok, ko) => out.end((e) => (e ? ko(e) : ok())))
  } catch (e) {
    out.destroy()
    fs.rmSync(temporaneo, { force: true })
    throw e
  }
  // controlli di integrità: dimensione e impronta pubblicate da GitHub
  const atteso = String(asset.digest || '').replace(/^sha256:/, '')
  if (letti !== asset.size || (atteso && atteso !== hash.digest('hex'))) {
    fs.rmSync(temporaneo, { force: true })
    throw new Error('Il file scaricato non corrisponde a quello pubblicato')
  }
  pronto = { file: temporaneo, versione: nuova }
  aggiorna({ fase: 'pronto', percentuale: 100 })
  chiediRiavvio(nuova)
}

/** Sostituisce l'exe portatile appena il programma si chiude, poi lo riapre se richiesto. */
function sostituisciPortatile(riapri) {
  if (!pronto) return
  const destinazione = process.env.PORTABLE_EXECUTABLE_FILE
  const script = path.join(os.tmpdir(), `cmp-aggiorna-${Date.now()}.cmd`)
  const righe = [
    '@echo off',
    'set /a tentativi=0',
    ':attesa',
    'timeout /t 1 /nobreak >nul',
    `move /y "${pronto.file}" "${destinazione}" >nul 2>&1 && goto fatto`,
    'set /a tentativi+=1',
    'if %tentativi% lss 60 goto attesa',
    `del "${pronto.file}" >nul 2>&1`,
    ':fatto',
    riapri ? `start "" "${destinazione}"` : '',
    'del "%~f0"',
  ]
  fs.writeFileSync(script, righe.filter(Boolean).join('\r\n'), 'utf-8')
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  pronto = null
}

/* ---------- comune ---------- */

function messaggioErrore(e) {
  const m = String(e?.message || e)
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ERR_INTERNET|net::/i.test(m)) return 'Nessuna connessione a GitHub'
  if (/EPERM|EACCES/i.test(m)) return 'La cartella del programma non è scrivibile: scarica la nuova versione a mano'
  return m.split('\n')[0].slice(0, 200)
}

async function chiediRiavvio(versione) {
  if (PROVA) return
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Aggiornamento pronto',
    message: `Customer Map Potential ${versione} è pronto`,
    detail: 'Riavvia ora per usare la nuova versione. Se scegli "Più tardi" si aggiorna da solo alla prossima chiusura.',
    buttons: ['Riavvia ora', 'Più tardi'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) installaOra()
}

function installaOra() {
  if (portatile()) {
    if (!pronto) return
    sostituisciPortatile(true)
    app.quit()
  } else if (stato.fase === 'pronto') {
    preparaUpdater().quitAndInstall(false, true)
  }
}

/**
 * Controlla se c'è una versione nuova. `manuale`: l'utente l'ha chiesto, quindi
 * mostra anche "sei aggiornato" e gli errori.
 */
function verifica(manuale = false) {
  if (!app.isPackaged) {
    aggiorna({ fase: 'errore', messaggio: 'Aggiornamenti disponibili solo nel programma installato o portatile' })
    return Promise.resolve(stato)
  }
  if (stato.fase === 'pronto') {
    if (manuale) chiediRiavvio(stato.nuova)
    return Promise.resolve(stato)
  }
  if (inCorso) return inCorso
  inCorso = (async () => {
    try {
      if (portatile()) await verificaPortatile()
      else await preparaUpdater().checkForUpdates()
    } catch (e) {
      aggiorna({ fase: 'errore', messaggio: messaggioErrore(e) })
    } finally {
      inCorso = null
    }
    if (manuale && stato.fase === 'aggiornato') {
      dialog.showMessageBox({ type: 'info', title: 'Aggiornamenti', message: `Hai già l'ultima versione (${app.getVersion()})` })
    }
    if (manuale && stato.fase === 'errore') {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Aggiornamenti',
        message: 'Controllo degli aggiornamenti non riuscito',
        detail: stato.messaggio,
        buttons: ['Apri la pagina dei download', 'Chiudi'],
        cancelId: 1,
      })
      if (response === 0) shell.openExternal(PAGINA)
    }
    return stato
  })()
  return inCorso
}

/** Controllo all'avvio (dopo qualche secondo) e poi ogni 6 ore, senza disturbare se non c'è nulla. */
function avvia(ipcMain) {
  ipcMain.handle('aggiornamenti:stato', () => stato)
  ipcMain.handle('aggiornamenti:verifica', () => verifica(true))
  ipcMain.handle('aggiornamenti:installa', () => installaOra())
  if (!app.isPackaged || process.argv.some((a) => a.startsWith('--prova-avvio='))) return
  if (PROVA) return provaAggiornamento()
  // portatile: se l'utente chiude senza riavviare, la sostituzione avviene comunque
  app.on('will-quit', () => sostituisciPortatile(false))
  setTimeout(() => verifica(false), 8000)
  setInterval(() => verifica(false), OGNI)
}

/** Verifica, scarica e installa senza domande, poi scrive l'esito ed esce. */
async function provaAggiornamento() {
  const fine = Date.now() + 10 * 60 * 1000
  await verifica(false)
  while (!['pronto', 'aggiornato', 'errore'].includes(stato.fase) && Date.now() < fine) {
    await new Promise((ok) => setTimeout(ok, 1000))
  }
  fs.writeFileSync(PROVA, JSON.stringify({ ...stato, portatile: portatile() }, null, 1), 'utf-8')
  if (stato.fase !== 'pronto') return app.exit(0)
  if (portatile()) {
    sostituisciPortatile(false)
    app.exit(0)
  } else {
    preparaUpdater().quitAndInstall(true, false)
  }
}

module.exports = { avvia, verifica, piuNuova, PAGINA }
