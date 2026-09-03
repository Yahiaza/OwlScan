import { createWorker, OEM } from 'tesseract.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const langPath = join(process.cwd(), 'resources', 'tessdata')
const cachePath = await mkdtemp(join(tmpdir(), 'owlscan-ocr-'))
try {
  const worker = await createWorker(['ara', 'eng'], OEM.LSTM_ONLY, { langPath, cachePath })
  await worker.terminate()
  console.log('Arabic and English OCR worker initialized successfully.')
} finally {
  await rm(cachePath, { recursive: true, force: true })
}
