// Ponte minimo tra la pagina e l'applicazione: solo le impostazioni, mai il token in chiaro.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cmpDesktop', {
  leggiImpostazioni: () => ipcRenderer.invoke('impostazioni:leggi'),
  salvaImpostazioni: (v) => ipcRenderer.invoke('impostazioni:salva', v),
})
