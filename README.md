# OwlScan

OwlScan is a Windows-first desktop workspace for scanning, Arabic/English OCR, and practical PDF editing. The interface is built with React, TypeScript and Tailwind CSS inside a secure Electron shell. Scanner access is isolated in a small .NET service that talks to Windows Image Acquisition (WIA).

## Current MVP

- Arabic-first RTL interface with light and dark themes.
- Open and render PDF documents locally with PDF.js.
- Import scanned image pages and mix them with PDF pages.
- Reorder pages with drag and drop, rotate pages, and delete pages.
- Draw highlight regions and save them into a new PDF.
- Create a PDF from PNG/JPEG scans with `pdf-lib`.
- Scanner discovery and acquisition through a .NET WIA bridge.
- Scan profiles for DPI, color mode, duplex and automatic cleanup preferences.
- Offline Arabic + English OCR using Tesseract.js and bundled language data.
- OCR progress, confidence and editable recognized text.
- Sandboxed Electron renderer with a narrow, typed preload API.

## Requirements

- Windows 10 or Windows 11.
- Node.js 22 or newer and pnpm.
- .NET 10 SDK for development. Release installers include the scanner runtime, so end users do not need to install .NET separately.
- A scanner with a WIA driver for physical scanning.

## Connect and use a scanner

1. Install the scanner manufacturer's full Windows driver. A print-only driver is not enough; it must include WIA scanning support.
2. In Windows, open **Settings > Bluetooth & devices > Printers & scanners**, add the device, then verify that it can scan with the Windows Scan app.
3. Open OwlScan. In the right sidebar, choose the device under **Scanner**, or press the refresh button beside the device list.
4. Choose the color mode, resolution, paper size, source and scan profile, then press **Start scan**.
5. Review the page, run Arabic/English OCR if needed, add highlights or reorder pages, then press **Save PDF**.

OwlScan discovers WIA scanners that are already installed in Windows. Devices are not paired from inside OwlScan itself.

## Development

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File scripts/create-icon.ps1
pnpm build:scanner
pnpm dev
```

## Build a Windows installer

```powershell
pnpm dist:win
```

The installer will be written to `release/`.

## Architecture

```text
React + Tailwind renderer (sandboxed)
        │ typed IPC
Electron main process
        ├── PDF/file operations
        ├── Tesseract OCR worker
        └── OwlScan.Scanner.exe (.NET/WIA)
```

## Roadmap

- TWAIN Direct/DSM provider for devices without WIA drivers.
- ADF batch acquisition and scanner-specific capability negotiation.
- Searchable PDF text-layer generation with Arabic shaping.
- OCR zoning, tables and low-confidence word review.
- True PDF annotations, redaction, forms and digital signatures.
- Optional commercial OCR/PDF engine providers for enterprise deployments.

## Privacy

Documents stay on the device. The renderer has no direct Node.js or filesystem access; privileged operations are exposed through validated IPC handlers.
