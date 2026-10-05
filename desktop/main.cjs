// Customer Map Potential: applicazione per PC (Electron).
// La finestra carica l'app da un indirizzo interno (app://customer-map), così i dati
// salvati (dealer, acquisti, liste clienti) restano legati a un'origine fissa.
// Le chiamate a Openapi partono da qui: il token non arriva mai alla pagina.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, safeStorage, shell, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { gestisci } = require('./build/openapi.cjs')
const aggiornamenti = require('./aggiornamenti.cjs')

const SCHEMA = 'app'
const HOST = 'customer-map'
const DIST = path.join(__dirname, '..', 'dist')
const IMPOSTAZIONI = () => path.join(app.getPath('userData'), 'impostazioni.json')

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
])

/* ---------- impostazioni: token Openapi cifrato con la protezione del sistema operativo ---------- */

function leggiImpostazioni() {
  try {
    return JSON.parse(fs.readFileSync(IMPOSTAZIONI(), 'utf-8'))
  } catch {
    return {}
  }
}

function segreto(imp, campo) {
  if (!imp[campo]) return ''
  try {
    return imp.cifrato ? safeStorage.decryptString(Buffer.from(imp[campo], 'base64')) : imp[campo]
  } catch {
    return ''
  }
}

function salvaSegreto(imp, campo, valore) {
  if (!valore.trim()) return delete imp[campo]
  // stessa protezione per tutti i segreti: se un campo è cifrato, lo sono tutti
  imp[campo] = imp.cifrato ? safeStorage.encryptString(valore.trim()).toString('base64') : valore.trim()
}

const token = () => segreto(leggiImpostazioni(), 'token')
const chiaveGoogle = () => segreto(leggiImpostazioni(), 'google')

function salvaImpostazioni({ token: nuovo, sandbox, google }) {
  const imp = leggiImpostazioni()
  if (imp.cifrato === undefined) imp.cifrato = safeStorage.isEncryptionAvailable()
  if (typeof nuovo === 'string') salvaSegreto(imp, 'token', nuovo)
  if (typeof google === 'string') {
    salvaSegreto(imp, 'google', google)
    sessioniGoogle.clear()
  }
  if (typeof sandbox === 'boolean') imp.sandbox = sandbox
  fs.mkdirSync(path.dirname(IMPOSTAZIONI()), { recursive: true })
  fs.writeFileSync(IMPOSTAZIONI(), JSON.stringify(imp, null, 1), 'utf-8')
  return statoImpostazioni()
}

function statoImpostazioni() {
  const imp = leggiImpostazioni()
  const t = token()
  const g = chiaveGoogle()
  return {
    haToken: !!t,
    tokenFinale: t ? `…${t.slice(-4)}` : '',
    haGoogle: !!g,
    googleFinale: g ? `…${g.slice(-4)}` : '',
    cifrato: !!imp.cifrato,
    sandbox: imp.sandbox !== false,
    versione: app.getVersion(),
    cartellaDati: app.getPath('userData'),
  }
}

/* ---------- mappe Google (Map Tiles API): la chiave resta qui, la pagina chiede le tessere a noi ---------- */

const TIPI_GOOGLE = {
  roadmap: { mapType: 'roadmap' },
  satellite: { mapType: 'satellite', layerTypes: ['layerRoadmap'] },
}
const sessioniGoogle = new Map()

async function sessioneGoogle(tipo) {
  const s = sessioniGoogle.get(tipo)
  if (s && s.scade > Date.now() + 3600_000) return s.id
  const r = await net.fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(chiaveGoogle())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...TIPI_GOOGLE[tipo], language: 'it-IT', region: 'IT', scale: 'scaleFactor2x', highDpi: true }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.session) throw new Error(j.error?.message || `Google ha risposto ${r.status}`)
  sessioniGoogle.set(tipo, { id: j.session, scade: Number(j.expiry) * 1000 })
  return j.session
}

async function gestisciGoogle(url) {
  const tipo = url.searchParams.get('tipo')
  if (!TIPI_GOOGLE[tipo]) return Response.json({ errore: 'Tipo di mappa sconosciuto' }, { status: 400 })
  if (!chiaveGoogle()) return Response.json({ errore: 'Chiave Google non inserita' }, { status: 401 })
  try {
    const chiave = encodeURIComponent(chiaveGoogle())
    const sessione = await sessioneGoogle(tipo)
    const m = url.pathname.match(/^\/api\/google\/tile\/(\d+)\/(\d+)\/(\d+)$/)
    if (m) return net.fetch(`https://tile.googleapis.com/v1/2dtiles/${m[1]}/${m[2]}/${m[3]}?session=${sessione}&key=${chiave}`)
    if (url.pathname === '/api/google/viewport') {
      const q = new URLSearchParams({ session: sessione, key: chiaveGoogle() })
      for (const k of ['zoom', 'north', 'south', 'east', 'west']) q.set(k, url.searchParams.get(k) ?? '')
      const r = await net.fetch(`https://tile.googleapis.com/tile/v1/viewport?${q}`)
      const j = await r.json().catch(() => ({}))
      return Response.json({ copyright: j.copyright ?? '' }, { status: r.ok ? 200 : r.status })
    }
    return new Response('Non trovato', { status: 404 })
  } catch (e) {
    return Response.json({ errore: e.message }, { status: 502 })
  }
}

/* ---------- indirizzo interno: file dell'app e API ---------- */

async function gestisciRichiesta(request) {
  const url = new URL(request.url)
  if (url.host !== HOST) return new Response('Non trovato', { status: 404 })
  if (url.pathname.startsWith('/api/google/')) return gestisciGoogle(url)
  if (url.pathname === '/api/companies') {
    if (request.method !== 'POST') return Response.json({ errore: 'Usa POST' }, { status: 405 })
    try {
      const corpo = await request.json()
      const env = { OPENAPI_TOKEN: token(), OPENAPI_SANDBOX: statoImpostazioni().sandbox ? '1' : '0' }
      const r = await gestisci(corpo, env)
      if (r.demo) r.messaggio = 'Token Openapi non inserito: apri Impostazioni e incollalo. Intanto l\'app usa dati dimostrativi.'
      return Response.json(r)
    } catch (e) {
      return Response.json({ errore: e.message }, { status: 502 })
    }
  }
  // file statici, senza uscire dalla cartella dell'app
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST)) return new Response('Vietato', { status: 403 })
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  return net.fetch(pathToFileURL(file).toString())
}

/* ---------- finestra ---------- */

function creaFinestra() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Customer Map Potential',
    icon: path.join(__dirname, 'risorse', 'icona.png'),
    backgroundColor: '#f3f4f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  // i link verso altri siti si aprono nel browser, mai dentro l'app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEMA}://${HOST}`)) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })
  win.loadURL(`${SCHEMA}://${HOST}/`)

  // Prova automatica di avvio (usata dai controlli su Windows): --prova-avvio=percorso\esito.json
  const prova = process.argv.find((a) => a.startsWith('--prova-avvio='))
  if (prova) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const esito = await win.webContents
          .executeJavaScript(
            `(async () => ({
              titolo: document.title,
              dealer: document.querySelector('h1')?.textContent ?? null,
              abitanti: [...document.querySelectorAll('div')].some((d) => /ABITANTI/i.test(d.textContent || '') && /mila/.test(d.textContent || '')),
              mappa: !!document.querySelector('canvas.maplibregl-canvas'),
              datiComuni: (await fetch('/data/comuni.json')).ok,
              api: await (await fetch('/api/companies', { method: 'POST', body: JSON.stringify({ azione: 'stima', lat: 45.18, lon: 9.15, raggioKm: 10 }) })).json(),
            }))()`,
          )
          .catch((e) => ({ errore: String(e) }))
        fs.writeFileSync(prova.split('=').slice(1).join('='), JSON.stringify(esito, null, 1), 'utf-8')
        app.exit(0)
      }, 12000),
    )
  }
  return win
}

function menu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Apri la cartella dei dati', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: 'Esci' },
      ],
    },
    {
      label: 'Visualizza',
      submenu: [
        { role: 'reload', label: 'Ricarica' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Dimensione reale' },
        { role: 'zoomIn', label: 'Ingrandisci' },
        { role: 'zoomOut', label: 'Riduci' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Strumenti sviluppatore' }]),
      ],
    },
    {
      label: 'Aiuto',
      submenu: [
        { label: 'Verifica aggiornamenti…', click: () => aggiornamenti.verifica(true) },
        { label: 'Pagina dei download', click: () => shell.openExternal(aggiornamenti.PAGINA) },
        { type: 'separator' },
        {
          label: 'Informazioni',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Customer Map Potential',
              message: `Customer Map Potential ${app.getVersion()}`,
              detail: 'Potenziale clienti attorno ai dealer della rete SuperService.\nDati: ISTAT, ACI-PRA, OpenStreetMap, Registro Imprese.',
            }),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ---------- avvio: una sola istanza ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let finestra = null
  app.on('second-instance', () => {
    if (finestra) {
      if (finestra.isMinimized()) finestra.restore()
      finestra.focus()
    }
  })
  app.whenReady().then(() => {
    protocol.handle(SCHEMA, gestisciRichiesta)
    ipcMain.handle('impostazioni:leggi', () => statoImpostazioni())
    ipcMain.handle('impostazioni:salva', (_e, v) => salvaImpostazioni(v || {}))
    aggiornamenti.avvia(ipcMain)
    menu()
    finestra = creaFinestra()
  })
  app.on('window-all-closed', () => app.quit())
}
