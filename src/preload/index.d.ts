import type { OwlScanApi } from '../shared/contracts'

declare global {
  interface Window {
    owlscan: OwlScanApi
  }
}

export {}
