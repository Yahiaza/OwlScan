export type ScanColorMode = 'color' | 'gray' | 'bw'
export type ScanSource = 'flatbed' | 'feeder'

export interface BinaryFile {
  name: string
  path: string
  mimeType: string
  base64: string
}

export interface ScannerDevice {
  id: string
  name: string
  description?: string
  source: 'WIA' | 'TWAIN'
}

export interface ScanRequest {
  deviceId?: string
  dpi: number
  colorMode: ScanColorMode
  source: ScanSource
  duplex: boolean
  brightness: number
}

export interface ScanResponse {
  canceled: boolean
  file?: BinaryFile
  error?: string
}

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrResult {
  text: string
  confidence: number
}

export interface OwlScanApi {
  getVersion(): Promise<string>
  openPdf(): Promise<{ canceled: boolean; file?: BinaryFile }>
  openImages(): Promise<{ canceled: boolean; files: BinaryFile[] }>
  savePdf(suggestedName: string, base64: string): Promise<{ canceled: boolean; path?: string }>
  listScanners(): Promise<ScannerDevice[]>
  scan(request: ScanRequest): Promise<ScanResponse>
  recognize(base64: string): Promise<OcrResult>
  onOcrProgress(callback: (progress: OcrProgress) => void): () => void
}
