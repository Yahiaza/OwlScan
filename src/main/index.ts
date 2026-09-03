import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createWorker, OEM, type Worker } from 'tesseract.js'
import { acquireScan, listScannerDevices } from './scannerBridge'
import type { OcrProgress, ScanRequest } from '../shared/contracts'

let mainWindow: BrowserWindow | undefined
let ocrWorkerPromise: Promise<Worker> | undefined

const mimeFromPath = (filePath: string): string => {
  const extension = filePath.toLowerCase().split('.').at(-1)
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'png') return 'image/png'
  if (extension === 'tif' || extension === 'tiff') return 'image/tiff'
  return 'image/jpeg'
}

async function toBinaryFile(filePath: string) {
  const bytes = await readFile(filePath)
  return {
    name: filePath.split(/[\\/]/).at(-1) ?? 'document',
    path: filePath,
    mimeType: mimeFromPath(filePath),
    base64: bytes.toString('base64')
  }
}

function tessdataPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tessdata')
    : join(app.getAppPath(), 'resources', 'tessdata')
}

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const cachePath = join(app.getPath('userData'), 'ocr-cache')
      await mkdir(cachePath, { recursive: true })
      return createWorker(['ara', 'eng'], OEM.LSTM_ONLY, {
        langPath: tessdataPath(),
        cachePath,
        logger: (message) => {
          const payload: OcrProgress = {
            status: message.status,
            progress: typeof message.progress === 'number' ? message.progress : 0
          }
          mainWindow?.webContents.send('ocr:progress', payload)
        }
      })
    })()
  }
  return ocrWorkerPromise
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('dialog:open-pdf', async () => {
    const result = await dialog.showOpenDialog({
      title: 'فتح مستند PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    return { canceled: false, file: await toBinaryFile(result.filePaths[0]) }
  })

  ipcMain.handle('dialog:open-images', async () => {
    const result = await dialog.showOpenDialog({
      title: 'إضافة صفحات مصورة',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
    })
    if (result.canceled) return { canceled: true, files: [] }
    return { canceled: false, files: await Promise.all(result.filePaths.map(toBinaryFile)) }
  })

  ipcMain.handle('dialog:save-pdf', async (_event, suggestedName: string, base64: string) => {
    const result = await dialog.showSaveDialog({
      title: 'حفظ مستند PDF',
      defaultPath: suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return { canceled: false, path: result.filePath }
  })

  ipcMain.handle('scanner:list', () => listScannerDevices())
  ipcMain.handle('scanner:scan', async (_event, request: ScanRequest) => {
    const outputPath = join(app.getPath('temp'), `owlscan-${Date.now()}.png`)
    const result = await acquireScan(request, outputPath)
    if (!result.ok || !result.data) {
      return { canceled: Boolean(result.canceled), error: result.error }
    }
    const file = await toBinaryFile(result.data.path)
    await unlink(result.data.path).catch(() => undefined)
    return { canceled: false, file }
  })

  ipcMain.handle('ocr:recognize', async (_event, base64: string) => {
    const worker = await getOcrWorker()
    const result = await worker.recognize(Buffer.from(base64, 'base64'))
    return { text: result.data.text, confidence: result.data.confidence }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#101521',
    title: 'OwlScan',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

registerIpc()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void ocrWorkerPromise?.then((worker) => worker.terminate())
})
