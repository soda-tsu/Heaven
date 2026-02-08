import { ElectronAPI } from '@electron-toolkit/preload'

interface MacroAPI {
  registerHotkey: (macroId: string, accelerator: string) => Promise<{ success: boolean; key?: string; error?: string }>
  unregisterHotkey: (macroId: string) => Promise<{ success: boolean }>
  registerMousePositionHotkey: (accelerator: string) => Promise<{ success: boolean; key?: string; error?: string }>
  unregisterMousePositionHotkey: () => Promise<{ success: boolean }>
  onMousePositionCaptured: (callback: (position: { x: number; y: number }) => void) => void
  removeMousePositionListener: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MacroAPI
  }
}
