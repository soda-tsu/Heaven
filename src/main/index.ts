import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { keyboard, mouse, Point, Key } from '@nut-tree-fork/nut-js'
import icon from '../../resources/icon.png?asset'

// Configuração da velocidade do mouse e teclado
mouse.config.mouseSpeed = 2000
keyboard.config.autoDelayMs = 0

// Armazena as hotkeys registradas por macroId
const registeredHotkeys: Map<string, string> = new Map()

// Armazena a hotkey para captura de posição do mouse
let mousePositionHotkey: string | null = null

// Função que aperta tecla e espera 0.1 segundos
async function pressKey(key: Key, ...modifiers: Key[]): Promise<void> {
  if (modifiers.length > 0) {
    await keyboard.pressKey(...modifiers)
    await keyboard.pressKey(key)
    await keyboard.releaseKey(key)
    await keyboard.releaseKey(...modifiers)
  } else {
    await keyboard.pressKey(key)
    await keyboard.releaseKey(key)
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
}

// Variável para controlar o bloqueio do mouse
let mouseLockInterval: NodeJS.Timeout | null = null

// Função que move o mouse para as coordenadas e bloqueia o movimento
async function lockMouseAt(x: number, y: number): Promise<void> {
  const targetPosition = new Point(x, y)

  // Move o mouse para a posição inicial
  await mouse.setPosition(targetPosition)

  // Inicia o bloqueio - reposiciona o mouse constantemente
  mouseLockInterval = setInterval(async () => {
    await mouse.setPosition(targetPosition)
  }, 10) // A cada 10ms força a posição
}

// Função para desbloquear o mouse
function unlockMouse(): void {
  if (mouseLockInterval) {
    clearInterval(mouseLockInterval)
    mouseLockInterval = null
  }
}

async function macroRevive(): Promise<void> {
  lockMouseAt(58, 77)
  await pressKey(Key.Num1, Key.LeftControl) // Ctrl + 1
  await pressKey(Key.Num0, Key.LeftShift) // Shift + 0
  await pressKey(Key.Num1, Key.LeftControl) // Ctrl + 1
  await pressKey(Key.S, Key.LeftShift) // Shift + S
  await pressKey(Key.Num3, Key.LeftAlt) // Alt + 3
  unlockMouse()
}

async function macroHeal(): Promise<void> {
  console.log('Executando HEAL...')
  // TODO: Ajuste a sequência conforme necessário
  await keyboard.type(Key.H)
}

async function macroBuff(): Promise<void> {
  console.log('Executando BUFF...')
  // TODO: Ajuste a sequência conforme necessário
  await keyboard.type(Key.J)
}

// Mapa de macros disponíveis
const macros: Record<string, () => Promise<void>> = {
  revive: macroRevive,
  heal: macroHeal,
  buff: macroBuff
}

// Executa uma macro pelo ID
async function executeMacro(macroId: string): Promise<void> {
  const macro = macros[macroId]
  if (macro) {
    await macro()
  } else {
    console.error(`Macro "${macroId}" não encontrada`)
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Registrar hotkey para uma macro específica
  ipcMain.handle('hotkey:register', async (_event, macroId: string, accelerator: string) => {
    try {
      // Remove hotkey anterior desta macro se existir
      const oldKey = registeredHotkeys.get(macroId)
      if (oldKey) {
        globalShortcut.unregister(oldKey)
      }

      // Registra nova hotkey
      const success = globalShortcut.register(accelerator, () => {
        console.log(`Hotkey ${accelerator} -> ${macroId}`)
        executeMacro(macroId)
      })

      if (success) {
        registeredHotkeys.set(macroId, accelerator)
        console.log(`Hotkey ${accelerator} registrada para ${macroId}`)
        return { success: true, key: accelerator }
      } else {
        return { success: false, error: 'Tecla já em uso ou inválida' }
      }
    } catch (error) {
      console.error('Erro ao registrar hotkey:', error)
      return { success: false, error: String(error) }
    }
  })

  // Desregistrar hotkey de uma macro específica
  ipcMain.handle('hotkey:unregister', async (_event, macroId: string) => {
    const key = registeredHotkeys.get(macroId)
    if (key) {
      globalShortcut.unregister(key)
      registeredHotkeys.delete(macroId)
    }
    return { success: true }
  })

  // Registrar hotkey para captura de posição do mouse
  ipcMain.handle('mousePosition:register', async (_event, accelerator: string) => {
    try {
      // Remove hotkey anterior se existir
      if (mousePositionHotkey) {
        globalShortcut.unregister(mousePositionHotkey)
      }

      // Registra nova hotkey
      const success = globalShortcut.register(accelerator, async () => {
        const position: Point = await mouse.getPosition()
        console.log(`Posição do mouse: X=${position.x}, Y=${position.y}`)
        // Envia a posição para todas as janelas
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('mousePosition:captured', { x: position.x, y: position.y })
        })
      })

      if (success) {
        mousePositionHotkey = accelerator
        console.log(`Hotkey ${accelerator} registrada para captura de mouse`)
        return { success: true, key: accelerator }
      } else {
        return { success: false, error: 'Tecla já em uso ou inválida' }
      }
    } catch (error) {
      console.error('Erro ao registrar hotkey de mouse:', error)
      return { success: false, error: String(error) }
    }
  })

  // Desregistrar hotkey de captura de posição do mouse
  ipcMain.handle('mousePosition:unregister', async () => {
    if (mousePositionHotkey) {
      globalShortcut.unregister(mousePositionHotkey)
      mousePositionHotkey = null
    }
    return { success: true }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Limpa atalhos globais ao sair
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
