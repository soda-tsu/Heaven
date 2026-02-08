import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  registerHotkey: (
    macroId: string,
    accelerator: string
  ): Promise<{ success: boolean; key?: string; error?: string }> =>
    ipcRenderer.invoke('hotkey:register', macroId, accelerator),
  unregisterHotkey: (macroId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('hotkey:unregister', macroId),
  registerMousePositionHotkey: (
    accelerator: string
  ): Promise<{ success: boolean; key?: string; error?: string }> =>
    ipcRenderer.invoke('mousePosition:register', accelerator),
  unregisterMousePositionHotkey: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('mousePosition:unregister'),
  onMousePositionCaptured: (callback: (position: { x: number; y: number }) => void): void => {
    ipcRenderer.on('mousePosition:captured', (_event, position) => callback(position))
  },
  removeMousePositionListener: (): void => {
    ipcRenderer.removeAllListeners('mousePosition:captured')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
