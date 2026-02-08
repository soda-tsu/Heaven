import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { keyboard, mouse, Point, Key, screen, Region } from '@nut-tree-fork/nut-js'
import icon from '../../resources/icon.png?asset'

// Configuração da velocidade do mouse e teclado
mouse.config.mouseSpeed = 2000
keyboard.config.autoDelayMs = 0

// Armazena os dados da imagem capturada para busca
let capturedImageData: { width: number; height: number; data: Buffer } | null = null

// Função para buscar imagem na tela manualmente (comparação de pixels)
async function findImageOnScreen(
  needle: { width: number; height: number; data: Buffer },
  tolerance: number = 30
): Promise<{ x: number; y: number } | null> {
  // Captura a tela inteira
  const screenImage = await screen.grab()
  const screenData = await screenImage.toRGB()

  const screenWidth = screenData.width
  const screenHeight = screenData.height
  const screenPixels = screenData.data

  const needleWidth = needle.width
  const needleHeight = needle.height
  const needlePixels = needle.data

  // Percorre a tela procurando a imagem
  for (let y = 0; y <= screenHeight - needleHeight; y += 2) {
    for (let x = 0; x <= screenWidth - needleWidth; x += 2) {
      let match = true
      let checkedPixels = 0
      let matchedPixels = 0

      // Verifica alguns pixels da imagem (não todos para ser mais rápido)
      for (let ny = 0; ny < needleHeight && match; ny += 3) {
        for (let nx = 0; nx < needleWidth && match; nx += 3) {
          const screenIdx = ((y + ny) * screenWidth + (x + nx)) * 4
          const needleIdx = (ny * needleWidth + nx) * 4

          const rDiff = Math.abs(screenPixels[screenIdx] - needlePixels[needleIdx])
          const gDiff = Math.abs(screenPixels[screenIdx + 1] - needlePixels[needleIdx + 1])
          const bDiff = Math.abs(screenPixels[screenIdx + 2] - needlePixels[needleIdx + 2])

          checkedPixels++
          if (rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance) {
            matchedPixels++
          }
        }
      }

      // Se mais de 80% dos pixels verificados correspondem, considera match
      if (checkedPixels > 0 && matchedPixels / checkedPixels >= 0.8) {
        return { x: x + Math.floor(needleWidth / 2), y: y + Math.floor(needleHeight / 2) }
      }
    }
  }

  return null
}

// Armazena as hotkeys registradas por macroId
const registeredHotkeys: Map<string, string> = new Map()

// Armazena a hotkey para captura de posição do mouse
let mousePositionHotkey: string | null = null

// Armazena a hotkey para captura de tela
let screenCaptureHotkey: string | null = null

// Armazena a hotkey para macro de busca de imagem
let findImageHotkey: string | null = null

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

async function macroBuff(): Promise<void> {
  console.log('Executando BUFF...')
  // TODO: Ajuste a sequência conforme necessário
  await keyboard.type(Key.J)
}

async function macroFindImageShift9(): Promise<void> {
  if (!capturedImageData) {
    console.log('Nenhuma imagem capturada para buscar')
    return
  }

  console.log('Iniciando busca de imagem em loop...')
  console.log(`Imagem a buscar: ${capturedImageData.width}x${capturedImageData.height}`)
  let count = 0

  while (true) {
    // Busca a imagem na tela usando busca manual
    const found = await findImageOnScreen(capturedImageData)

    if (found) {
      count++
      console.log(`[${count}] Imagem encontrada em: X=${found.x}, Y=${found.y}`)

      // Move o mouse para o centro da imagem
      await mouse.setPosition(new Point(found.x, found.y))

      // Pressiona Shift + 9
      await pressKey(Key.Num9, Key.LeftShift)

      // Pequena pausa antes de procurar novamente
      await new Promise((resolve) => setTimeout(resolve, 200))
    } else {
      // Imagem não encontrada, sai do loop
      console.log(`Imagem não encontrada. Total de vezes: ${count}`)
      break
    }
  }
}

// Mapa de macros disponíveis
const macros: Record<string, () => Promise<void>> = {
  revive: macroRevive,
  buff: macroBuff,
  findImageShift9: macroFindImageShift9
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

  // Registrar hotkey para captura de tela 50x50
  ipcMain.handle('screenCapture:register', async (_event, accelerator: string) => {
    try {
      // Remove hotkey anterior se existir
      if (screenCaptureHotkey) {
        globalShortcut.unregister(screenCaptureHotkey)
      }

      // Registra nova hotkey
      const success = globalShortcut.register(accelerator, async () => {
        const position: Point = await mouse.getPosition()
        console.log(`Capturando tela em: X=${position.x}, Y=${position.y}`)

        // Calcula a região 30x30 centralizada no mouse
        const captureSize = 30
        const halfSize = Math.floor(captureSize / 2)
        const regionX = Math.max(0, position.x - halfSize)
        const regionY = Math.max(0, position.y - halfSize)

        const captureRegion = new Region(regionX, regionY, captureSize, captureSize)

        // Captura a região da tela
        const image = await screen.grabRegion(captureRegion)

        // Converte para RGB
        const imageData = await image.toRGB()
        const { width, height, data } = imageData

        // Armazena os dados da imagem para uso na macro de busca
        capturedImageData = { width, height, data: Buffer.from(data) }
        console.log(`Imagem capturada: ${width}x${height}, ${data.length} bytes`)

        // Envia os dados RGB para o renderer processar
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('screenCapture:captured', {
            width,
            height,
            data: Array.from(data)
          })
        })
      })

      if (success) {
        screenCaptureHotkey = accelerator
        console.log(`Hotkey ${accelerator} registrada para captura de tela`)
        return { success: true, key: accelerator }
      } else {
        return { success: false, error: 'Tecla já em uso ou inválida' }
      }
    } catch (error) {
      console.error('Erro ao registrar hotkey de captura:', error)
      return { success: false, error: String(error) }
    }
  })

  // Desregistrar hotkey de captura de tela
  ipcMain.handle('screenCapture:unregister', async () => {
    if (screenCaptureHotkey) {
      globalShortcut.unregister(screenCaptureHotkey)
      screenCaptureHotkey = null
    }
    return { success: true }
  })

  // Registrar hotkey para macro de busca de imagem + Shift+9
  ipcMain.handle('findImage:register', async (_event, accelerator: string) => {
    try {
      // Remove hotkey anterior se existir
      if (findImageHotkey) {
        globalShortcut.unregister(findImageHotkey)
      }

      // Registra nova hotkey
      const success = globalShortcut.register(accelerator, async () => {
        console.log(`Hotkey ${accelerator} -> findImageShift9`)
        await macroFindImageShift9()
      })

      if (success) {
        findImageHotkey = accelerator
        console.log(`Hotkey ${accelerator} registrada para busca de imagem`)
        return { success: true, key: accelerator }
      } else {
        return { success: false, error: 'Tecla já em uso ou inválida' }
      }
    } catch (error) {
      console.error('Erro ao registrar hotkey de busca:', error)
      return { success: false, error: String(error) }
    }
  })

  // Desregistrar hotkey de busca de imagem
  ipcMain.handle('findImage:unregister', async () => {
    if (findImageHotkey) {
      globalShortcut.unregister(findImageHotkey)
      findImageHotkey = null
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
