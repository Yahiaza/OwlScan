import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packagedExecutable = process.argv[2]
const electronPath = packagedExecutable ?? join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const port = 29000 + (process.pid % 1000)
const output = []

const electronArguments = packagedExecutable ? [] : ['.']
electronArguments.push(`--remote-debugging-port=${port}`)

const electron = spawn(electronPath, electronArguments, {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
})

electron.stdout.on('data', (chunk) => output.push(chunk.toString()))
electron.stderr.on('data', (chunk) => output.push(chunk.toString()))

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findRenderer() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (electron.exitCode !== null) {
      throw new Error(`Electron exited before the renderer was ready.\n${output.join('')}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await response.json()
      const page = targets.find((target) =>
        target.type === 'page' &&
        target.webSocketDebuggerUrl &&
        (target.url?.startsWith('file:') || target.url?.startsWith('http:'))
      )
      if (page) return page
    } catch {
      // Electron has not opened the debugging endpoint yet.
    }
    await delay(200)
  }
  throw new Error(`Timed out waiting for the Electron renderer.\n${output.join('')}`)
}

function inspectBridge(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('Timed out while inspecting the Electron bridge.'))
    }, 10_000)

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(async () => {
            try {
              const api = window.owlscan
              return {
                hasApi: typeof api === 'object',
                version: await api?.getVersion(),
                scanners: await api?.listScanners()
              }
            } catch (error) {
              return { hasApi: typeof window.owlscan === 'object', error: String(error) }
            }
          })()`,
          awaitPromise: true,
          returnByValue: true
        }
      }))
    })

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timeout)
      socket.close()
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text ?? 'Renderer evaluation failed.'))
        return
      }
      resolve(message.result?.result?.value)
    })

    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Could not connect to the Electron renderer.'))
    })
  })
}

try {
  const deadline = Date.now() + 15_000
  let result
  while (Date.now() < deadline) {
    const renderer = await findRenderer()
    result = await inspectBridge(renderer.webSocketDebuggerUrl)
    if (result?.hasApi && result.version && Array.isArray(result.scanners)) break
    await delay(250)
  }
  if (!result?.hasApi || !result.version || !Array.isArray(result.scanners)) {
    throw new Error(`Electron bridge is unavailable: ${JSON.stringify(result)}`)
  }
  const scannerNames = result.scanners.map((scanner) => scanner.name).join(', ')
  console.log(
    `Electron bridge ready (OwlScan ${result.version}); ${result.scanners.length} scanner(s) detected${scannerNames ? `: ${scannerNames}` : '.'}`
  )
} finally {
  electron.kill()
}
