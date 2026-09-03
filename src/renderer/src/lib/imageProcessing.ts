import type { DocumentItem } from '../types'

export type ImageOperation = 'autoCrop' | 'enhance' | 'cleanBackground'

interface ImageProcessingResult {
  base64: string
  changed: boolean
  message?: string
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(source.width, source.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('تعذر تجهيز صورة الصفحة')
  context.drawImage(source, 0, 0)
  return canvas
}

async function imageItemToCanvas(item: DocumentItem): Promise<HTMLCanvasElement> {
  if (!item.base64 || !item.mimeType) throw new Error('بيانات الصفحة غير متاحة')
  const image = new Image()
  image.src = `data:${item.mimeType};base64,${item.base64}`
  await image.decode()

  const quarterTurns = Math.round(item.rotation / 90) % 4
  const sideways = Math.abs(quarterTurns) % 2 === 1
  const canvas = makeCanvas(sideways ? image.naturalHeight : image.naturalWidth, sideways ? image.naturalWidth : image.naturalHeight)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('تعذر تجهيز صورة الصفحة')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(quarterTurns * Math.PI / 2)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  return canvas
}

async function pageCanvas(item: DocumentItem, pdfCanvas: HTMLCanvasElement | null): Promise<HTMLCanvasElement> {
  if (item.kind === 'image') return imageItemToCanvas(item)
  if (!pdfCanvas?.width || !pdfCanvas.height) throw new Error('انتظر حتى يكتمل عرض صفحة PDF')
  return cloneCanvas(pdfCanvas)
}

function canvasBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1]
}

function autoCrop(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; changed: boolean } {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('تعذر قراءة صورة الصفحة')
  const { width, height } = canvas
  const pixels = context.getImageData(0, 0, width, height).data
  const sampleSize = Math.max(2, Math.floor(Math.min(width, height) * 0.012))
  const corners = [[0, 0], [width - sampleSize, 0], [0, height - sampleSize], [width - sampleSize, height - sampleSize]]
  let red = 0
  let green = 0
  let blue = 0
  let samples = 0

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sampleSize; y += 2) {
      for (let x = startX; x < startX + sampleSize; x += 2) {
        const offset = (y * width + x) * 4
        red += pixels[offset]
        green += pixels[offset + 1]
        blue += pixels[offset + 2]
        samples++
      }
    }
  }

  red /= samples
  green /= samples
  blue /= samples
  const backgroundLuminance = red * 0.299 + green * 0.587 + blue * 0.114
  if (backgroundLuminance > 232) return { canvas, changed: false }

  let left = width
  let top = height
  let right = -1
  let bottom = -1
  const step = Math.max(1, Math.floor(Math.min(width, height) / 1800))
  const differenceThreshold = 34 * 34

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      const dr = pixels[offset] - red
      const dg = pixels[offset + 1] - green
      const db = pixels[offset + 2] - blue
      if (dr * dr + dg * dg + db * db < differenceThreshold) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) return { canvas, changed: false }
  const padding = Math.max(4, Math.floor(Math.min(width, height) * 0.008))
  left = Math.max(0, left - padding)
  top = Math.max(0, top - padding)
  right = Math.min(width - 1, right + padding)
  bottom = Math.min(height - 1, bottom + padding)
  const croppedWidth = right - left + 1
  const croppedHeight = bottom - top + 1
  const removedEnough = croppedWidth < width * 0.98 || croppedHeight < height * 0.98
  const remainsUseful = croppedWidth > width * 0.35 && croppedHeight > height * 0.35
  if (!removedEnough || !remainsUseful) return { canvas, changed: false }

  const cropped = makeCanvas(croppedWidth, croppedHeight)
  const croppedContext = cropped.getContext('2d', { alpha: false })
  if (!croppedContext) throw new Error('تعذر قص الصفحة')
  croppedContext.drawImage(canvas, left, top, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight)
  return { canvas: cropped, changed: true }
}

function percentile(histogram: Uint32Array, total: number, ratio: number): number {
  const target = total * ratio
  let count = 0
  for (let value = 0; value < histogram.length; value++) {
    count += histogram[value]
    if (count >= target) return value
  }
  return 255
}

function enhance(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('تعذر قراءة صورة الصفحة')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const histogram = new Uint32Array(256)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    histogram[Math.round(image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114)]++
  }
  const total = canvas.width * canvas.height
  const low = percentile(histogram, total, 0.01)
  const high = percentile(histogram, total, 0.99)
  const range = Math.max(32, high - low)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const adjusted = ((image.data[offset + channel] - low) * 255) / range
      image.data[offset + channel] = Math.max(0, Math.min(255, adjusted))
    }
  }
  context.putImageData(image, 0, 0)
}

function cleanBackground(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('تعذر قراءة صورة الصفحة')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const luminance = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
    if (luminance >= 175) {
      const whitening = Math.min(1, (luminance - 175) / 55)
      for (let channel = 0; channel < 3; channel++) {
        image.data[offset + channel] += (255 - image.data[offset + channel]) * whitening
      }
    } else if (luminance < 115) {
      const darkening = 0.86 + luminance / 820
      for (let channel = 0; channel < 3; channel++) image.data[offset + channel] *= darkening
    }
  }
  context.putImageData(image, 0, 0)
}

export async function processPageImage(
  item: DocumentItem,
  pdfCanvas: HTMLCanvasElement | null,
  operation: ImageOperation
): Promise<ImageProcessingResult> {
  let canvas = await pageCanvas(item, pdfCanvas)
  if (operation === 'autoCrop') {
    const result = autoCrop(canvas)
    canvas = result.canvas
    return {
      base64: canvasBase64(canvas),
      changed: result.changed,
      message: result.changed ? undefined : 'لم يتم العثور على حواف زائدة تحتاج إلى قص'
    }
  }
  if (operation === 'enhance') enhance(canvas)
  if (operation === 'cleanBackground') cleanBackground(canvas)
  return { base64: canvasBase64(canvas), changed: true }
}

export async function isBlankPage(item: DocumentItem): Promise<boolean> {
  const canvas = await pageCanvas(item, null)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return false
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const pixelStride = 4
  let sampled = 0
  let ink = 0
  for (let offset = 0; offset < pixels.length; offset += 4 * pixelStride) {
    const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
    if (luminance < 210) ink++
    sampled++
  }
  return sampled > 0 && ink / sampled < 0.0015
}
