import {
  AppWindow,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  FileImage,
  FilePlus2,
  FileText,
  GripVertical,
  Highlighter,
  ImagePlus,
  Languages,
  LoaderCircle,
  Maximize2,
  Menu,
  Minus,
  Moon,
  MoreHorizontal,
  Plus,
  Redo2,
  RefreshCw,
  RotateCw,
  Save,
  ScanLine,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Undo2,
  Upload,
  WandSparkles
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ScannerDevice } from '../../shared/contracts'
import { DemoPage } from './components/DemoPage'
import { PdfStage } from './components/PdfStage'
import { buildPdf, getPdfPageCount } from './lib/pdfEngine'
import { isBlankPage, processPageImage, type ImageOperation } from './lib/imageProcessing'
import type {
  DocumentItem,
  EditTool,
  HighlightMark,
  OcrPageResult,
  ScanProfile,
  ScanSettings,
  WorkspaceMode
} from './types'

const defaultSettings: ScanSettings = {
  deviceId: '',
  dpi: 300,
  colorMode: 'color',
  source: 'flatbed',
  duplex: false,
  autoDeskew: true,
  removeBlankPages: true,
  runOcr: true,
  brightness: 0
}

const initialProfiles: ScanProfile[] = [
  { id: 'office', name: 'مستندات مكتبية — جودة متوازنة', settings: defaultSettings },
  { id: 'contracts', name: 'عقود — أفضل OCR', settings: { ...defaultSettings, dpi: 300, runOcr: true } },
  { id: 'archive', name: 'أرشيف — PDF/A', settings: { ...defaultSettings, colorMode: 'gray', dpi: 300 } }
]

const modeDetails: Record<WorkspaceMode, { label: string; icon: typeof ScanLine }> = {
  scan: { label: 'مسح ضوئي', icon: ScanLine },
  ocr: { label: 'OCR والمراجعة', icon: Languages },
  edit: { label: 'تحرير PDF', icon: Highlighter }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function fileNameWithoutExtension(name: string): string {
  return name.replace(/\.pdf$/i, '') || 'OwlScan-document'
}

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('scan')
  const [editTool, setEditTool] = useState<EditTool>('select')
  const [dark, setDark] = useState(() => localStorage.getItem('owlscan-theme') !== 'light')
  const [sourcePdf, setSourcePdf] = useState<string>()
  const [documentName, setDocumentName] = useState('مستند جديد')
  const [items, setItems] = useState<DocumentItem[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [highlights, setHighlights] = useState<HighlightMark[]>([])
  const [highlightColor, setHighlightColor] = useState('#facc15')
  const [draftHighlight, setDraftHighlight] = useState<Omit<HighlightMark, 'id' | 'pageId' | 'color'>>()
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const [scanSettings, setScanSettings] = useState<ScanSettings>(defaultSettings)
  const [profiles, setProfiles] = useState<ScanProfile[]>(() => {
    try {
      const saved = localStorage.getItem('owlscan-profiles')
      return saved ? JSON.parse(saved) as ScanProfile[] : initialProfiles
    } catch {
      return initialProfiles
    }
  })
  const [profileId, setProfileId] = useState('office')
  const [scanners, setScanners] = useState<ScannerDevice[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrResults, setOcrResults] = useState<Record<string, OcrPageResult>>({})
  const [toast, setToast] = useState('جاهز للعمل محليًا')
  const [draggedId, setDraggedId] = useState<string>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageSurfaceRef = useRef<HTMLDivElement>(null)

  const currentItem = items.find((item) => item.id === selectedId) ?? items[0]
  const currentIndex = currentItem ? items.findIndex((item) => item.id === currentItem.id) : -1
  const currentMarks = currentItem ? highlights.filter((mark) => mark.pageId === currentItem.id) : []
  const currentOcr = currentItem ? ocrResults[currentItem.id] : undefined

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('owlscan-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    localStorage.setItem('owlscan-profiles', JSON.stringify(profiles))
  }, [profiles])

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id)
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id)
  }, [items, selectedId])

  useEffect(() => {
    if (!window.owlscan) return
    return window.owlscan.onOcrProgress((progress) => {
      setOcrProgress(Math.round(progress.progress * 100))
      setToast(progress.status === 'recognizing text' ? 'يتم التعرف على النص…' : progress.status)
    })
  }, [])

  const showError = useCallback((message: string) => {
    setToast(`تعذر إكمال العملية: ${message}`)
  }, [])

  const refreshScanners = useCallback(async () => {
    if (!window.owlscan) return
    try {
      const devices = await window.owlscan.listScanners()
      setScanners(devices)
      if (devices[0] && !scanSettings.deviceId) {
        setScanSettings((current) => ({ ...current, deviceId: devices[0].id }))
      }
      setToast(devices.length ? `تم العثور على ${devices.length} جهاز مسح` : 'لم يتم العثور على جهاز WIA؛ يمكنك استيراد صور بدلًا منه')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر اكتشاف أجهزة المسح')
    }
  }, [scanSettings.deviceId, showError])

  useEffect(() => {
    void refreshScanners()
  }, [refreshScanners])

  const openPdf = async (): Promise<void> => {
    if (!window.owlscan) return showError('تعذّر تحميل مكوّنات سطح المكتب. أعد تشغيل OwlScan أو ثبّت أحدث نسخة')
    try {
      const result = await window.owlscan.openPdf()
      if (result.canceled || !result.file) return
      setToast('يتم تجهيز ملف PDF…')
      const pageCount = await getPdfPageCount(result.file.base64)
      const nextItems: DocumentItem[] = Array.from({ length: pageCount }, (_, index) => ({
        id: makeId(`pdf-${index + 1}`),
        kind: 'pdf',
        name: `صفحة ${index + 1}`,
        sourcePage: index + 1,
        rotation: 0
      }))
      setSourcePdf(result.file.base64)
      setDocumentName(result.file.name)
      setItems(nextItems)
      setSelectedId(nextItems[0]?.id)
      setHighlights([])
      setOcrResults({})
      setMode('edit')
      setToast(`تم فتح ${result.file.name} — ${pageCount} صفحة`)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر فتح المستند')
    }
  }

  const appendImages = useCallback((files: Array<{ name: string; base64: string; mimeType: string }>) => {
    const imageItems: DocumentItem[] = files.map((file) => ({
      id: makeId('image'),
      kind: 'image',
      name: file.name,
      base64: file.base64,
      mimeType: file.mimeType,
      rotation: 0
    }))
    setItems((current) => [...current, ...imageItems])
    setSelectedId(imageItems[0]?.id)
    if (documentName === 'مستند جديد' && files[0]) setDocumentName(`${fileNameWithoutExtension(files[0].name)}.pdf`)
    setToast(`تمت إضافة ${imageItems.length} صفحة`)
  }, [documentName])

  const importImages = async (): Promise<void> => {
    if (!window.owlscan) return showError('تعذّر تحميل مكوّنات سطح المكتب. أعد تشغيل OwlScan أو ثبّت أحدث نسخة')
    try {
      const result = await window.owlscan.openImages()
      if (!result.canceled) appendImages(result.files)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر إضافة الصور')
    }
  }

  const runOcrFor = useCallback(async (page: DocumentItem, base64: string) => {
    if (!window.owlscan) return
    setIsOcrRunning(true)
    setOcrProgress(0)
    try {
      const result = await window.owlscan.recognize(base64)
      setOcrResults((current) => ({ ...current, [page.id]: result }))
      setToast(`اكتمل OCR بدقة تقديرية ${Math.round(result.confidence)}%`)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر تشغيل OCR')
    } finally {
      setIsOcrRunning(false)
      setOcrProgress(100)
    }
  }, [showError])

  const scanPage = async (): Promise<void> => {
    if (!window.owlscan) return showError('تعذّر تحميل مكوّنات سطح المكتب. أعد تشغيل OwlScan أو ثبّت أحدث نسخة')
    setIsScanning(true)
    setToast('جاري الاتصال بجهاز المسح…')
    try {
      const result = await window.owlscan.scan({
        deviceId: scanSettings.deviceId || undefined,
        dpi: scanSettings.dpi,
        colorMode: scanSettings.colorMode,
        source: scanSettings.source,
        duplex: scanSettings.source === 'feeder' && scanSettings.duplex,
        brightness: scanSettings.brightness
      })
      if (result.canceled) return setToast('تم إلغاء المسح')
      if (!result.file) return showError(result.error ?? 'لم يتم استلام صورة من جهاز المسح')
      let page: DocumentItem = {
        id: makeId('scan'),
        kind: 'image',
        name: result.file.name,
        base64: result.file.base64,
        mimeType: result.file.mimeType,
        rotation: 0
      }
      if (scanSettings.autoDeskew) {
        const cropped = await processPageImage(page, null, 'autoCrop')
        if (cropped.changed) page = { ...page, base64: cropped.base64 }
      }
      if (scanSettings.removeBlankPages && await isBlankPage(page)) {
        setToast('تم تجاهل الصفحة لأنها فارغة')
        return
      }
      setItems((current) => [...current, page])
      setSelectedId(page.id)
      setToast('اكتمل المسح بنجاح')
      if (scanSettings.runOcr && page.base64) await runOcrFor(page, page.base64)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'فشل المسح')
    } finally {
      setIsScanning(false)
    }
  }

  const runOcr = async (): Promise<void> => {
    if (!currentItem) return showError('أضف صفحة أولًا')
    let base64 = currentItem.base64
    if (currentItem.kind === 'pdf') {
      const canvas = canvasRef.current
      if (!canvas) return showError('انتظر حتى يكتمل عرض الصفحة')
      base64 = canvas.toDataURL('image/png').split(',')[1]
    }
    if (!base64) return showError('تعذر تجهيز الصفحة للتعرف')
    await runOcrFor(currentItem, base64)
  }

  const savePdf = async (): Promise<void> => {
    if (!items.length) return showError('افتح PDF أو أضف صفحات أولًا')
    if (!window.owlscan) return showError('تعذّر تحميل مكوّنات سطح المكتب. أعد تشغيل OwlScan أو ثبّت أحدث نسخة')
    setIsSaving(true)
    setToast('يتم إنشاء ملف PDF…')
    try {
      const base64 = await buildPdf(items, sourcePdf, highlights)
      const result = await window.owlscan.savePdf(documentName, base64)
      if (!result.canceled) setToast(`تم الحفظ: ${result.path}`)
      else setToast('لم يتم حفظ الملف')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر حفظ المستند')
    } finally {
      setIsSaving(false)
    }
  }

  const changeProfile = (id: string): void => {
    setProfileId(id)
    const profile = profiles.find((item) => item.id === id)
    if (profile) setScanSettings({ ...defaultSettings, ...profile.settings, deviceId: scanSettings.deviceId })
  }

  const saveProfile = (): void => {
    const profile: ScanProfile = {
      id: makeId('profile'),
      name: `بروفايل مخصص ${profiles.length - 2}`,
      settings: scanSettings
    }
    setProfiles((current) => [...current, profile])
    setProfileId(profile.id)
    setToast(`تم حفظ “${profile.name}”`)
  }

  const updateCurrentItem = (updates: Partial<DocumentItem>): void => {
    if (!currentItem) return
    setItems((current) => current.map((item) => item.id === currentItem.id ? { ...item, ...updates } : item))
  }

  const deleteCurrent = (): void => {
    if (!currentItem) return
    const nextSelection = items[currentIndex + 1] ?? items[currentIndex - 1]
    setItems((current) => current.filter((item) => item.id !== currentItem.id))
    setHighlights((current) => current.filter((mark) => mark.pageId !== currentItem.id))
    setOcrResults((current) => {
      const next = { ...current }
      delete next[currentItem.id]
      return next
    })
    setSelectedId(nextSelection?.id)
    setToast('تم حذف الصفحة من المستند')
  }

  const rotateCurrent = (): void => {
    if (!currentItem) return
    updateCurrentItem({ rotation: (currentItem.rotation + 90) % 360 })
    setToast('تم تدوير الصفحة 90 درجة')
  }

  const processCurrentPage = async (operation: ImageOperation, successMessage: string): Promise<void> => {
    if (!currentItem) return showError('اختر صفحة أولًا')
    setIsProcessing(true)
    setToast('جاري معالجة الصفحة…')
    try {
      const result = await processPageImage(currentItem, canvasRef.current, operation)
      if (!result.changed) {
        setToast(result.message ?? 'الصفحة لا تحتاج إلى تعديل')
        return
      }
      setItems((current) => current.map((item) => item.id === currentItem.id ? {
        ...item,
        kind: 'image',
        name: item.name.replace(/\.[^.]+$/, '') + '.png',
        base64: result.base64,
        mimeType: 'image/png',
        sourcePage: undefined,
        rotation: 0
      } : item))
      setOcrResults((current) => {
        const next = { ...current }
        delete next[currentItem.id]
        return next
      })
      setHighlights((current) => current.filter((mark) => mark.pageId !== currentItem.id))
      setToast(successMessage)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'تعذر معالجة الصفحة')
    } finally {
      setIsProcessing(false)
    }
  }

  const undoHighlight = (): void => {
    if (!currentItem) return
    const lastIndex = highlights.map((mark) => mark.pageId).lastIndexOf(currentItem.id)
    if (lastIndex < 0) return
    setHighlights((current) => current.filter((_, index) => index !== lastIndex))
  }

  const pointInSurface = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    }
  }

  const beginHighlight = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (mode !== 'edit' || editTool !== 'highlight' || !currentItem) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointInSurface(event)
    pointerStart.current = point
    setDraftHighlight({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const moveHighlight = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointerStart.current) return
    const point = pointInSurface(event)
    setDraftHighlight({
      x: Math.min(pointerStart.current.x, point.x),
      y: Math.min(pointerStart.current.y, point.y),
      width: Math.abs(point.x - pointerStart.current.x),
      height: Math.abs(point.y - pointerStart.current.y)
    })
  }

  const finishHighlight = (): void => {
    if (draftHighlight && currentItem && draftHighlight.width > 0.005 && draftHighlight.height > 0.005) {
      setHighlights((current) => [...current, {
        ...draftHighlight,
        id: makeId('highlight'),
        pageId: currentItem.id,
        color: highlightColor
      }])
      setToast('تمت إضافة التحديد')
    }
    pointerStart.current = undefined
    setDraftHighlight(undefined)
  }

  const reorderItems = (targetId: string): void => {
    if (!draggedId || draggedId === targetId) return
    setItems((current) => {
      const next = [...current]
      const from = next.findIndex((item) => item.id === draggedId)
      const to = next.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0) return current
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDraggedId(undefined)
    setToast('تم تغيير ترتيب الصفحات')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><ScanLine size={20} /></div>
          <div><strong>OwlScan</strong><span>مسح ذكي ومستندات PDF</span></div>
        </div>

        <nav className="mode-tabs" aria-label="أوضاع العمل">
          {(Object.keys(modeDetails) as WorkspaceMode[]).map((key) => {
            const Icon = modeDetails[key].icon
            return (
              <button className={mode === key ? 'mode-tab active' : 'mode-tab'} key={key} onClick={() => setMode(key)} type="button">
                <Icon size={16} />{modeDetails[key].label}
              </button>
            )
          })}
        </nav>

        <div className="top-actions">
          <button className="button secondary" onClick={openPdf} type="button"><Upload size={16} />فتح PDF</button>
          <button className="icon-button" onClick={() => setDark((current) => !current)} aria-label="تبديل المظهر" type="button">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-button" aria-label="القائمة" type="button"><Menu size={18} /></button>
        </div>
      </header>

      <section className="toolbar">
        <div className="toolbar-group">
          {mode === 'scan' && <>
            <button className="tool-button" disabled={!currentItem || isProcessing} onClick={() => void processCurrentPage('autoCrop', 'تم قص الحواف تلقائيًا')} type="button"><Crop size={16} />قص تلقائي</button>
            <button className="tool-button" disabled={!currentItem || isProcessing} onClick={rotateCurrent} type="button"><RotateCw size={16} />تدوير</button>
            <button className="tool-button" disabled={!currentItem || isProcessing} onClick={() => void processCurrentPage('enhance', 'تم تحسين وضوح الصفحة')} type="button"><WandSparkles size={16} />تحسين ذكي</button>
            <button className="tool-button" disabled={!currentItem || isProcessing} onClick={() => void processCurrentPage('cleanBackground', 'تم تنظيف خلفية الصفحة')} type="button"><Sparkles size={16} />تنظيف الخلفية</button>
            <button className="tool-button danger-text" disabled={!currentItem || isProcessing} onClick={deleteCurrent} type="button"><Trash2 size={16} />حذف الصفحة</button>
          </>}
          {mode === 'ocr' && <>
            <button className="tool-button active" type="button"><Languages size={16} />عربي + English</button>
            <button className="tool-button" type="button"><ScanLine size={16} />منطقة نص</button>
            <button className="tool-button" type="button"><BookOpenText size={16} />تدقيق النتائج</button>
          </>}
          {mode === 'edit' && <>
            <button className={editTool === 'select' ? 'tool-button active' : 'tool-button'} onClick={() => setEditTool('select')} type="button"><AppWindow size={16} />تحديد</button>
            <button className={editTool === 'highlight' ? 'tool-button active' : 'tool-button'} onClick={() => setEditTool('highlight')} type="button"><Highlighter size={16} />هايلايت</button>
            <button className="tool-button" type="button"><Type size={16} />إضافة نص</button>
            <button className="tool-button" onClick={undoHighlight} type="button"><Undo2 size={16} />تراجع</button>
            <button className="tool-button" type="button" disabled><Redo2 size={16} />إعادة</button>
          </>}
        </div>
        <div className="toolbar-group">
          <button className="button secondary" onClick={importImages} type="button"><ImagePlus size={16} />إضافة صفحات</button>
          <button className="button primary" disabled={isSaving || !items.length} onClick={savePdf} type="button">
            {isSaving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}حفظ PDF
          </button>
        </div>
      </section>

      <main className="workspace">
        <aside className="properties-panel" dir="rtl">
          <div className="panel-heading"><span>{modeDetails[mode].label}</span><Settings2 size={17} /></div>

          {mode === 'scan' && <div className="panel-body space-y-4">
            <label className="field-label">جهاز المسح
              <div className="field-with-action">
                <select className="field-control" value={scanSettings.deviceId} onChange={(event) => setScanSettings({ ...scanSettings, deviceId: event.target.value })}>
                  {!scanners.length && <option value="">اختيار الجهاز من نافذة WIA</option>}
                  {scanners.map((scanner) => <option value={scanner.id} key={scanner.id}>{scanner.name}</option>)}
                </select>
                <button className="icon-button" onClick={refreshScanners} aria-label="تحديث الأجهزة" type="button"><RefreshCw size={15} /></button>
              </div>
            </label>

            <label className="field-label">مصدر الورق
              <select className="field-control" value={scanSettings.source} onChange={(event) => setScanSettings({ ...scanSettings, source: event.target.value as ScanSettings['source'], duplex: event.target.value === 'feeder' ? scanSettings.duplex : false })}>
                <option value="flatbed">الزجاج المسطح</option><option value="feeder">المغذي ADF</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">الدقة
                <select className="field-control" value={scanSettings.dpi} onChange={(event) => setScanSettings({ ...scanSettings, dpi: Number(event.target.value) })}>
                  {[150, 200, 300, 600].map((dpi) => <option key={dpi} value={dpi}>{dpi} DPI</option>)}
                </select>
              </label>
              <label className="field-label">الأوجه
                <select className="field-control" disabled={scanSettings.source !== 'feeder'} value={scanSettings.duplex ? 'duplex' : 'simplex'} onChange={(event) => setScanSettings({ ...scanSettings, duplex: event.target.value === 'duplex' })}>
                  <option value="duplex">وجهين</option><option value="simplex">وجه واحد</option>
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="field-label mb-2">نمط الألوان</legend>
              <div className="segmented">
                {([['color', 'ألوان'], ['gray', 'رمادي'], ['bw', 'أبيض وأسود']] as const).map(([value, label]) => (
                  <button className={scanSettings.colorMode === value ? 'segment active' : 'segment'} key={value} onClick={() => setScanSettings({ ...scanSettings, colorMode: value })} type="button">{label}</button>
                ))}
              </div>
            </fieldset>

            <label className="field-label">السطوع <span>{scanSettings.brightness > 0 ? '+' : ''}{scanSettings.brightness}</span>
              <input className="mt-2 w-full accent-indigo-600" type="range" min="-25" max="25" value={scanSettings.brightness} onChange={(event) => setScanSettings({ ...scanSettings, brightness: Number(event.target.value) })} />
            </label>

            <fieldset className="space-y-3">
              <legend className="field-label mb-2">المعالجة التلقائية</legend>
              <label className="check-row"><input checked={scanSettings.autoDeskew} onChange={(event) => setScanSettings({ ...scanSettings, autoDeskew: event.target.checked })} type="checkbox" />قص الحواف تلقائيًا بعد المسح</label>
              <label className="check-row"><input checked={scanSettings.removeBlankPages} onChange={(event) => setScanSettings({ ...scanSettings, removeBlankPages: event.target.checked })} type="checkbox" />إزالة الصفحات الفارغة</label>
              <label className="check-row"><input checked={scanSettings.runOcr} onChange={(event) => setScanSettings({ ...scanSettings, runOcr: event.target.checked })} type="checkbox" />تشغيل OCR عربي/إنجليزي</label>
            </fieldset>

            <label className="field-label">بروفايل المسح
              <select className="field-control" value={profileId} onChange={(event) => changeProfile(event.target.value)}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <button className="button secondary w-full" onClick={saveProfile} type="button"><Save size={15} />حفظ الإعدادات كبروفايل</button>
            <div className="grid grid-cols-[1fr_auto] gap-2 pt-2">
              <button className="button primary" disabled={isScanning} onClick={scanPage} type="button">
                {isScanning ? <LoaderCircle className="animate-spin" size={17} /> : <ScanLine size={17} />}{isScanning ? 'جاري المسح…' : 'بدء المسح'}
              </button>
              <button className="icon-button" onClick={importImages} aria-label="استيراد صور" type="button"><FileImage size={17} /></button>
            </div>
          </div>}

          {mode === 'ocr' && <div className="panel-body space-y-4">
            <div className="info-card">
              <div className="flex items-center justify-between"><span>لغة التعرّف</span><Languages size={17} /></div>
              <strong>العربية + English</strong>
              <small>تعرف محلي دون رفع المستند</small>
            </div>
            <button className="button primary w-full" disabled={isOcrRunning || !currentItem} onClick={runOcr} type="button">
              {isOcrRunning ? <LoaderCircle className="animate-spin" size={17} /> : <ScanLine size={17} />}{isOcrRunning ? `OCR ${ocrProgress}%` : 'تشغيل OCR للصفحة'}
            </button>
            {isOcrRunning && <div className="progress-track"><span style={{ width: `${ocrProgress}%` }} /></div>}
            <div className="flex items-center justify-between text-sm text-[var(--muted)]"><span>الثقة التقديرية</span><strong className="text-[var(--text)]">{currentOcr ? `${Math.round(currentOcr.confidence)}%` : '—'}</strong></div>
            <label className="field-label">النص المستخرج
              <textarea
                className="ocr-textarea"
                dir="auto"
                placeholder="ستظهر نتيجة OCR هنا…"
                value={currentOcr?.text ?? ''}
                onChange={(event) => currentItem && setOcrResults((current) => ({ ...current, [currentItem.id]: { confidence: currentOcr?.confidence ?? 0, text: event.target.value } }))}
              />
            </label>
            <button className="button secondary w-full" disabled={!currentOcr?.text} onClick={() => currentOcr?.text && navigator.clipboard.writeText(currentOcr.text)} type="button"><FileText size={16} />نسخ النص</button>
          </div>}

          {mode === 'edit' && <div className="panel-body space-y-5">
            <div>
              <span className="field-label mb-2">أداة التحرير</span>
              <div className="segmented">
                <button className={editTool === 'select' ? 'segment active' : 'segment'} onClick={() => setEditTool('select')} type="button">تحديد</button>
                <button className={editTool === 'highlight' ? 'segment active' : 'segment'} onClick={() => setEditTool('highlight')} type="button">هايلايت</button>
              </div>
            </div>
            <div>
              <span className="field-label mb-2">لون الهايلايت</span>
              <div className="color-options">
                {['#facc15', '#86efac', '#93c5fd', '#f9a8d4'].map((color) => (
                  <button aria-label={`لون ${color}`} className={highlightColor === color ? 'color-dot active' : 'color-dot'} key={color} onClick={() => setHighlightColor(color)} style={{ backgroundColor: color }} type="button" />
                ))}
              </div>
            </div>
            <div className="info-card"><span>حدد “هايلايت”، ثم اسحب فوق أي جزء من الصفحة. سيتم دمج العلامات عند حفظ النسخة الجديدة.</span></div>
            <div className="grid grid-cols-2 gap-2">
              <button className="button secondary" disabled={!currentItem} onClick={rotateCurrent} type="button"><RotateCw size={16} />تدوير</button>
              <button className="button danger" disabled={!currentItem} onClick={deleteCurrent} type="button"><Trash2 size={16} />حذف</button>
            </div>
            <button className="button secondary w-full" disabled={!currentMarks.length} onClick={undoHighlight} type="button"><Undo2 size={16} />حذف آخر هايلايت</button>
            <div className="stat-row"><span>علامات الصفحة</span><strong>{currentMarks.length}</strong></div>
          </div>}
        </aside>

        <section className="document-area">
          <div className="document-head">
            <div className="min-w-0"><strong className="truncate">{documentName}</strong><span>{items.length ? `صفحة ${currentIndex + 1} من ${items.length}` : 'أضف مستندًا للبدء'}</span></div>
            <div className="document-head-actions"><button className="icon-button danger-text" disabled={!currentItem} onClick={deleteCurrent} aria-label="حذف الصفحة الحالية" title="حذف الصفحة الحالية" type="button"><Trash2 size={16} /></button><button className="icon-button" aria-label="بحث" type="button"><Search size={16} /></button><button className="icon-button" aria-label="ملء الشاشة" type="button"><Maximize2 size={16} /></button></div>
          </div>

          <div className="canvas-viewport">
            <div
              className={`page-surface ${mode === 'edit' && editTool === 'highlight' ? 'highlight-cursor' : ''}`}
              ref={pageSurfaceRef}
              onPointerDown={beginHighlight}
              onPointerMove={moveHighlight}
              onPointerUp={finishHighlight}
              onPointerCancel={finishHighlight}
            >
              {!currentItem && <DemoPage />}
              {currentItem?.kind === 'pdf' && sourcePdf && currentItem.sourcePage && (
                <PdfStage base64={sourcePdf} pageNumber={currentItem.sourcePage} rotation={currentItem.rotation} canvasRef={canvasRef} onError={showError} />
              )}
              {currentItem?.kind === 'image' && currentItem.base64 && (
                <img
                  alt={currentItem.name}
                  className="scan-image"
                  draggable={false}
                  src={`data:${currentItem.mimeType};base64,${currentItem.base64}`}
                  style={{ transform: `rotate(${currentItem.rotation}deg)` }}
                />
              )}
              {currentMarks.map((mark) => <span className="highlight-mark" key={mark.id} style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.width * 100}%`, height: `${mark.height * 100}%`, backgroundColor: mark.color }} />)}
              {draftHighlight && <span className="highlight-mark draft" style={{ left: `${draftHighlight.x * 100}%`, top: `${draftHighlight.y * 100}%`, width: `${draftHighlight.width * 100}%`, height: `${draftHighlight.height * 100}%`, backgroundColor: highlightColor }} />}
            </div>
          </div>

          <div className="document-footer">
            <span>{currentItem?.kind === 'pdf' ? 'PDF' : currentItem?.kind === 'image' ? 'صفحة مصورة' : 'معاينة'} · محلي</span>
            <div className="pager">
              <button className="icon-button" disabled={currentIndex <= 0} onClick={() => setSelectedId(items[currentIndex - 1]?.id)} aria-label="الصفحة السابقة" type="button"><ChevronRight size={16} /></button>
              <span>{items.length ? `${currentIndex + 1} / ${items.length}` : '0 / 0'}</span>
              <button className="icon-button" disabled={currentIndex < 0 || currentIndex >= items.length - 1} onClick={() => setSelectedId(items[currentIndex + 1]?.id)} aria-label="الصفحة التالية" type="button"><ChevronLeft size={16} /></button>
            </div>
          </div>
        </section>

        <aside className="pages-panel" dir="rtl">
          <div className="panel-heading"><span>الصفحات</span><span className="page-count">{items.length}</span></div>
          <div className="pages-list">
            {!items.length && <div className="empty-pages"><FilePlus2 size={28} /><span>لا توجد صفحات بعد</span></div>}
            {items.map((item, index) => (
              <button
                className={currentItem?.id === item.id ? 'page-thumb active' : 'page-thumb'}
                draggable
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderItems(item.id)}
                type="button"
              >
                <GripVertical className="page-grip" size={15} />
                <span className="thumb-paper">
                  {item.kind === 'image' && item.base64
                    ? <img alt="" src={`data:${item.mimeType};base64,${item.base64}`} />
                    : <><span /><span /><span /><span /><span /></>}
                </span>
                <span className="thumb-label">{index + 1} · {item.name}</span>
                {ocrResults[item.id] && <span className="ocr-badge"><Check size={10} />OCR</span>}
              </button>
            ))}
          </div>
          <button className="add-pages" onClick={importImages} type="button"><Plus size={16} />إضافة صفحات</button>
        </aside>
      </main>

      <footer className="statusbar">
        <div className="status-message"><span className={toast.startsWith('تعذر') ? 'status-dot error' : 'status-dot'} />{toast}</div>
        <div className="status-meta"><span>العربية + English</span><span>·</span><span>OwlScan Desktop</span></div>
      </footer>
    </div>
  )
}

export default App
