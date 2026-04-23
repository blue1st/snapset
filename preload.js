const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveDialog: () => ipcRenderer.invoke('dialog:save-dialog'),
  copyFile: (payload) => ipcRenderer.invoke('copy-file', payload),
  captureScreenshot: (region) => ipcRenderer.invoke('screenshot:capture', region),
  processImage: (payload) => ipcRenderer.invoke('process:image', payload),
  getProcessedImage: (outputPath) => ipcRenderer.invoke('get:processed-image', outputPath),
  openSelection: (aspect, initW, initH) => ipcRenderer.invoke('window:open-selection', aspect, initW, initH),
  confirmSelection: (rect) => ipcRenderer.send('selection:finished', rect),
  cancelSelection: () => ipcRenderer.send('selection:cancelled'),
  onSelectionRectSelected: (callback) => {
    ipcRenderer.on('selection:rect-selected', (event, rect) => callback(rect));
  },
  onBgImage: (callback) => {
    ipcRenderer.on('selection:bg-image', (event, dataUri) => callback(dataUri));
  }
});
