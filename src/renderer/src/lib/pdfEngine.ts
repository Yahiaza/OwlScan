import { degrees, PDFDocument, rgb } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import type { DocumentItem, HighlightMark } from '../types'
import { base64ToBytes, bytesToBase64 } from './binary'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export async function loadPdfDocument(base64: string): Promise<PDFDocumentProxy> {
  return getDocument({ data: base64ToBytes(base64) }).promise
}

export async function getPdfPageCount(base64: string): Promise<number> {
  const document = await loadPdfDocument(base64)
  const count = document.numPages
  await document.destroy()
  return count
}

function colorFromHex(hex: string): ReturnType<typeof rgb> {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized, 16)
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

function addHighlights(page: ReturnType<PDFDocument['addPage']>, pageId: string, highlights: HighlightMark[]): void {
  const { width, height } = page.getSize()
  for (const mark of highlights.filter((highlight) => highlight.pageId === pageId)) {
    page.drawRectangle({
      x: mark.x * width,
      y: (1 - mark.y - mark.height) * height,
      width: mark.width * width,
      height: mark.height * height,
      color: colorFromHex(mark.color),
      opacity: 0.32,
      borderOpacity: 0
    })
  }
}

async function addImagePage(document: PDFDocument, item: DocumentItem, highlights: HighlightMark[]): Promise<void> {
  if (!item.base64) return
  const bytes = base64ToBytes(item.base64)
  const image = item.mimeType === 'image/png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 24
  const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const page = document.addPage([pageWidth, pageHeight])
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height
  })
  addHighlights(page, item.id, highlights)
  if (item.rotation) page.setRotation(degrees(item.rotation))
}

export async function buildPdf(
  items: DocumentItem[],
  sourcePdfBase64: string | undefined,
  highlights: HighlightMark[]
): Promise<string> {
  const output = await PDFDocument.create()
  const source = sourcePdfBase64 ? await PDFDocument.load(base64ToBytes(sourcePdfBase64)) : undefined

  for (const item of items) {
    if (item.kind === 'image') {
      await addImagePage(output, item, highlights)
      continue
    }
    if (!source || !item.sourcePage) continue
    const [page] = await output.copyPages(source, [item.sourcePage - 1])
    output.addPage(page)
    if (item.rotation) page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360))

    addHighlights(page, item.id, highlights)
  }

  output.setProducer('OwlScan')
  output.setCreator('OwlScan Desktop')
  return bytesToBase64(await output.save())
}
