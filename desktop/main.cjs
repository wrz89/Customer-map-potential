// Customer Map Potential: applicazione per PC (Electron).
// La finestra carica l'app da un indirizzo interno (app://customer-map), così i dati
// salvati (dealer, acquisti, liste clienti) restano legati a un'origine fissa.
// Le chiamate a Openapi partono da qui: il token non arriva mai alla pagina.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, safeStorage, shell, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { gestisci, provaToken } = require('./build/openapi.cjs')
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

function salvaImpostazioni({ token: nuovo, sandbox }) {
  const imp = leggiImpostazioni()
  if (imp.cifrato === undefined) imp.cifrato = safeStorage.isEncryptionAvailable()
  if (typeof nuovo === 'string') salvaSegreto(imp, 'token', nuovo)
  if (typeof sandbox === 'boolean') imp.sandbox = sandbox
  fs.mkdirSync(path.dirname(IMPOSTAZIONI()), { recursive: true })
  fs.writeFileSync(IMPOSTAZIONI(), JSON.stringify(imp, null, 1), 'utf-8')
  return statoImpostazioni()
}

function statoImpostazioni() {
  const imp = leggiImpostazioni()
  const t = token()
  return {
    haToken: !!t,
    tokenFinale: t ? `…${t.slice(-4)}` : '',
    cifrato: !!imp.cifrato,
    sandbox: imp.sandbox !== false,
    versione: app.getVersion(),
    cartellaDati: app.getPath('userData'),
  }
}

/* ---------- indirizzo interno: file dell'app e API ---------- */

async function gestisciRichiesta(request) {
  const url = new URL(request.url)
  if (url.host !== HOST) return new Response('Non trovato', { status: 404 })
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
    // il programma parte senza dealer: al primo caricamento se ne salva uno (solo sul PC di prova),
    // si ricarica e al secondo caricamento si controlla
    let caricamenti = 0
    win.webContents.on('did-finish-load', () => {
      caricamenti++
      if (caricamenti === 1)
        win.webContents
          .executeJavaScript(
            `localStorage.setItem('cmp.dealer.v1', JSON.stringify([{ id: 'prova-avvio', nome: 'Prova avvio Pavia', indirizzo: 'Pavia', lat: 45.1847, lon: 9.1582, raggioKm: 15 }])); location.reload()`,
          )
          .catch(() => {})
      else if (caricamenti === 2) controllaAvvio()
    })
    const controllaAvvio = () =>
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
      }, 12000)
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
    ipcMain.handle('impostazioni:prova', () => provaToken({ OPENAPI_TOKEN: token(), OPENAPI_SANDBOX: statoImpostazioni().sandbox ? '1' : '0' }))
    aggiornamenti.avvia(ipcMain)
    menu()
    finestra = creaFinestra()
  })
  app.on('window-all-closed', () => app.quit())
}
