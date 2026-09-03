import { app } from 'electron'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ScanRequest, ScannerDevice } from '../shared/contracts'

interface ScannerCommandResult<T> {
  ok: boolean
  data?: T
  error?: string
  canceled?: boolean
}

function scannerExecutable(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'scanner', 'OwlScan.Scanner.exe')
  return join(
    app.getAppPath(),
    'services',
    'OwlScan.Scanner',
    'bin',
    'Release',
    'net10.0-windows',
    'win-x64',
    'publish',
    'OwlScan.Scanner.exe'
  )
}

function runScanner<T>(args: string[], timeoutMs = 120_000): Promise<ScannerCommandResult<T>> {
  const executable = scannerExecutable()
  if (!existsSync(executable)) {
    return Promise.resolve({
      ok: false,
      error: 'Scanner service is not built. Run pnpm build:scanner first.'
    })
  }

  return new Promise((resolve) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let completed = false

    const finish = (result: ScannerCommandResult<T>): void => {
      if (completed) return
      completed = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', (error) => finish({ ok: false, error: error.message }))
    child.on('close', () => {
      try {
        finish(JSON.parse(stdout.trim()) as ScannerCommandResult<T>)
      } catch {
        finish({ ok: false, error: stderr.trim() || stdout.trim() || 'Scanner service failed.' })
      }
    })

    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, error: 'Scanner operation timed out.' })
    }, timeoutMs)
  })
}

export async function listScannerDevices(): Promise<ScannerDevice[]> {
  const result = await runScanner<ScannerDevice[]>(['devices'], 15_000)
  return result.ok && result.data ? result.data : []
}

export async function acquireScan(request: ScanRequest, outputPath: string): Promise<ScannerCommandResult<{ path: string }>> {
  const args = [
    'scan',
    '--output',
    outputPath,
    '--dpi',
    String(request.dpi),
    '--color',
    request.colorMode,
    '--source',
    request.source,
    '--duplex',
    String(request.duplex),
    '--brightness',
    String(request.brightness)
  ]
  if (request.deviceId) args.push('--device', request.deviceId)
  return runScanner<{ path: string }>(args)
}
