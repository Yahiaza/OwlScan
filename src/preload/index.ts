import { contextBridge, ipcRenderer } from 'electron'
import type { OcrProgress, OwlScanApi, ScanRequest } from '../shared/contracts'

const api: OwlScanApi = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  openPdf: () => ipcRenderer.invoke('dialog:open-pdf'),
  openImages: () => ipcRenderer.invoke('dialog:open-images'),
  savePdf: (suggestedName, base64) => ipcRenderer.invoke('dialog:save-pdf', suggestedName, base64),
  listScanners: () => ipcRenderer.invoke('scanner:list'),
  scan: (request: ScanRequest) => ipcRenderer.invoke('scanner:scan', request),
  recognize: (base64) => ipcRenderer.invoke('ocr:recognize', base64),
  onOcrProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: OcrProgress): void => callback(progress)
    ipcRenderer.on('ocr:progress', listener)
    return () => ipcRenderer.removeListener('ocr:progress', listener)
  }
}

contextBridge.exposeInMainWorld('owlscan', api)
