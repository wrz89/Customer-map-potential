// Ponte minimo tra la pagina e l'applicazione: impostazioni e aggiornamenti, mai il token in chiaro.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cmpDesktop', {
  leggiImpostazioni: () => ipcRenderer.invoke('impostazioni:leggi'),
  salvaImpostazioni: (v) => ipcRenderer.invoke('impostazioni:salva', v),
  provaToken: () => ipcRenderer.invoke('impostazioni:prova'),
  statoAggiornamento: () => ipcRenderer.invoke('aggiornamenti:stato'),
  verificaAggiornamenti: () => ipcRenderer.invoke('aggiornamenti:verifica'),
  installaAggiornamento: () => ipcRenderer.invoke('aggiornamenti:installa'),
  seguiAggiornamento: (cb) => {
    const f = (_e, stato) => cb(stato)
    ipcRenderer.on('aggiornamenti:stato', f)
    return () => ipcRenderer.removeListener('aggiornamenti:stato', f)
  },
})
