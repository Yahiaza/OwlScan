import type { OwlScanApi } from './contracts'

declare global {
  interface Window {
    owlscan: OwlScanApi
  }
}

export {}
