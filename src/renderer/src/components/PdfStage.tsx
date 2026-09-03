import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { loadPdfDocument } from '../lib/pdfEngine'

interface PdfStageProps {
  base64: string
  pageNumber: number
  rotation: number
  canvasRef: RefObject<HTMLCanvasElement | null>
  onError(message: string): void
}

export function PdfStage({ base64, pageNumber, rotation, canvasRef, onError }: PdfStageProps) {
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const renderTask = useRef<RenderTask | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    void loadPdfDocument(base64)
      .then((loaded) => {
        if (disposed) void loaded.destroy()
        else setDocument(loaded)
      })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : 'تعذر فتح ملف PDF'))
    return () => {
      disposed = true
      setDocument((current) => {
        void current?.destroy()
        return undefined
      })
    }
  }, [base64, onError])

  useEffect(() => {
    if (!document || !canvasRef.current) return
    let disposed = false
    void document.getPage(pageNumber).then((page) => {
      if (disposed || !canvasRef.current) return
      const viewport = page.getViewport({ scale: 1.22, rotation: (page.rotate + rotation) % 360 })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) return
      const outputScale = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      renderTask.current?.cancel()
      renderTask.current = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      })
      return renderTask.current.promise
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'RenderingCancelledException') onError(error.message)
    })
    return () => {
      disposed = true
      renderTask.current?.cancel()
    }
  }, [canvasRef, document, onError, pageNumber, rotation])

  return <canvas ref={canvasRef} className="block bg-white shadow-2xl" aria-label={`صفحة PDF رقم ${pageNumber}`} />
}
