import type { ScanColorMode } from '../../shared/contracts'

export type WorkspaceMode = 'scan' | 'ocr' | 'edit'
export type EditTool = 'select' | 'highlight'

export interface DocumentItem {
  id: string
  kind: 'pdf' | 'image'
  name: string
  sourcePage?: number
  base64?: string
  mimeType?: string
  rotation: number
}

export interface HighlightMark {
  id: string
  pageId: string
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface ScanSettings {
  deviceId: string
  dpi: number
  colorMode: ScanColorMode
  duplex: boolean
  autoDeskew: boolean
  removeBlankPages: boolean
  runOcr: boolean
  brightness: number
}

export interface ScanProfile {
  id: string
  name: string
  settings: ScanSettings
}

export interface OcrPageResult {
  text: string
  confidence: number
}
