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

// Verifica se um pixel da tela bate com o da needle dentro da tolerância
function pixelMatches(
  screenPixels: Buffer | Uint8Array,
  needlePixels: Buffer,
  screenIdx: number,
  needleIdx: number,
  tolerance: number
): boolean {
  const rDiff = Math.abs(screenPixels[screenIdx] - needlePixels[needleIdx])
  if (rDiff > tolerance) return false
  const gDiff = Math.abs(screenPixels[screenIdx + 1] - needlePixels[needleIdx + 1])
  if (gDiff > tolerance) return false
  const bDiff = Math.abs(screenPixels[screenIdx + 2] - needlePixels[needleIdx + 2])
  return bDiff <= tolerance
}

// Região de busca limitada para otimização
const SEARCH_REGION = { x: 254, y: 115, width: 1663 - 254, height: 850 - 115 }

// Cache do screenshot para reusar entre buscas consecutivas
let cachedScreenData: { width: number; height: number; data: Buffer | Uint8Array; timestamp: number } | null = null
const SCREEN_CACHE_TTL = 50 // ms - tempo máximo para reusar screenshot

// Função para buscar imagem na tela (otimizada com step scanning + amostragem)
async function findImageOnScreen(
  needle: { width: number; height: number; data: Buffer },
  tolerance: number = 30
): Promise<{ x: number; y: number } | null> {
  const now = Date.now()

  // Reutiliza screenshot se ainda é recente (evita captura redundante)
  let screenWidth: number, screenHeight: number, screenPixels: Buffer | Uint8Array
  if (cachedScreenData && (now - cachedScreenData.timestamp) < SCREEN_CACHE_TTL) {
    screenWidth = cachedScreenData.width
    screenHeight = cachedScreenData.height
    screenPixels = cachedScreenData.data
  } else {
    const searchRegion = new Region(SEARCH_REGION.x, SEARCH_REGION.y, SEARCH_REGION.width, SEARCH_REGION.height)
    const screenImage = await screen.grabRegion(searchRegion)
    const screenData = await screenImage.toRGB()
    screenWidth = screenData.width
    screenHeight = screenData.height
    screenPixels = screenData.data
    cachedScreenData = { width: screenWidth, height: screenHeight, data: screenPixels, timestamp: now }
  }

  const needleWidth = needle.width
  const needleHeight = needle.height
  const needlePixels = needle.data

  // Step=1 para needle pequena (10x10), step maior só para needles grandes (>20px)
  const step = Math.min(needleWidth, needleHeight) > 20 ? Math.floor(Math.min(needleWidth, needleHeight) / 6) : 1

  // Pré-calcula pontos de amostragem distribuídos pela needle (máx 12 pontos)
  const samplePoints: { nx: number; ny: number; needleIdx: number }[] = []
  const sampleStepX = Math.max(1, Math.floor(needleWidth / 3))
  const sampleStepY = Math.max(1, Math.floor(needleHeight / 3))
  for (let sy = 0; sy < needleHeight; sy += sampleStepY) {
    for (let sx = 0; sx < needleWidth; sx += sampleStepX) {
      samplePoints.push({ nx: sx, ny: sy, needleIdx: (sy * needleWidth + sx) * 4 })
    }
  }

  // Pré-calcula o pixel central da needle para filtro ultra-rápido
  const centerNx = Math.floor(needleWidth / 2)
  const centerNy = Math.floor(needleHeight / 2)
  const centerNeedleIdx = (centerNy * needleWidth + centerNx) * 4

  const maxSampleMisses = Math.floor(samplePoints.length * 0.3)

  for (let y = 0; y <= screenHeight - needleHeight; y += step) {
    for (let x = 0; x <= screenWidth - needleWidth; x += step) {
      // Filtro 1: checa pixel central
      const centerScreenIdx = ((y + centerNy) * screenWidth + (x + centerNx)) * 4
      if (!pixelMatches(screenPixels, needlePixels, centerScreenIdx, centerNeedleIdx, tolerance)) {
        continue
      }

      // Filtro 2: checa pontos de amostragem distribuídos
      let sampleMisses = 0
      let passed = true
      for (let i = 0; i < samplePoints.length; i++) {
        const sp = samplePoints[i]
        const screenIdx = ((y + sp.ny) * screenWidth + (x + sp.nx)) * 4
        if (!pixelMatches(screenPixels, needlePixels, screenIdx, sp.needleIdx, tolerance)) {
          sampleMisses++
          if (sampleMisses > maxSampleMisses) { passed = false; break }
        }
      }
      if (!passed) continue

      // Filtro 3: verificação completa com early exit agressivo
      let missedPixels = 0
      const totalPixels = needleWidth * needleHeight
      const maxMisses = Math.floor(totalPixels * 0.35)
      let failed = false

      for (let ny = 0; ny < needleHeight; ny++) {
        const rowScreenBase = (y + ny) * screenWidth
        const rowNeedleBase = ny * needleWidth
        for (let nx = 0; nx < needleWidth; nx++) {
          const screenIdx = (rowScreenBase + x + nx) * 4
          const needleIdx = (rowNeedleBase + nx) * 4
          if (!pixelMatches(screenPixels, needlePixels, screenIdx, needleIdx, tolerance)) {
            missedPixels++
            if (missedPixels > maxMisses) { failed = true; break }
          }
        }
        if (failed) break
      }

      if (!failed) {
        return {
          x: SEARCH_REGION.x + x + Math.floor(needleWidth / 2),
          y: SEARCH_REGION.y + y + Math.floor(needleHeight / 2)
        }
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

// Flag para interromper a busca de imagem
let stopImageSearch = false

// Armazena a hotkey para parar busca de imagem
let stopImageSearchHotkey: string | null = null

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
    return
  }

  let count = 0

  stopImageSearch = false

  while (true) {
    if (stopImageSearch) {
      break
    }

    // Invalida cache para forçar screenshot fresco
    cachedScreenData = null
    const found = await findImageOnScreen(capturedImageData)

    if (!found) {
      break
    }

    count++

    // Segura Shift ANTES de mover o mouse (para que ao chegar já esteja pronto)
    await keyboard.pressKey(Key.LeftShift)
    await new Promise((resolve) => setTimeout(resolve, 30))
    // Move mouse + aperta 9
    await mouse.setPosition(new Point(found.x, found.y))
    await keyboard.pressKey(Key.Num9)
    await new Promise((resolve) => setTimeout(resolve, 30))
    // Solta 9 primeiro, depois Shift (garante que 9 nunca sai sem Shift)
    await keyboard.releaseKey(Key.Num9)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await keyboard.releaseKey(Key.LeftShift)

    // Delay para o jogo registrar a ação
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

// Mapa de teclas numéricas para o combo
const numKeys: Key[] = [Key.Num0, Key.Num1, Key.Num2, Key.Num3, Key.Num4, Key.Num5, Key.Num6, Key.Num7, Key.Num8, Key.Num9]

// Número de skills e tempo de espera por pokémon
const NUMEROS_DE_SKILL_POR_POKEMON = 5 // TODO: ajuste conforme necessário
const TEMPOS_POR_POKEMON = 1800 // TODO: ajuste em ms conforme necessário

async function combo(numeroDeSkills: number): Promise<void> {
  for (let n = 2; n <= numeroDeSkills; n++) {
    await pressKey(numKeys[n])
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
}

async function macroCombo(): Promise<void> {
  // Alt + 1
  await pressKey(Key.Num1, Key.LeftAlt)
  await new Promise((resolve) => setTimeout(resolve, 100))
  // Usar as skills
  await combo(NUMEROS_DE_SKILL_POR_POKEMON)
  // Tempo de espera de acordo com o pokémon
  await new Promise((resolve) => setTimeout(resolve, TEMPOS_POR_POKEMON))
  // Apertar F1
  await pressKey(Key.F1)
  await new Promise((resolve) => setTimeout(resolve, 100))
}

// Mapa de macros disponíveis
const macros: Record<string, () => Promise<void>> = {
  revive: macroRevive,
  buff: macroBuff,
  combo: macroCombo,
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
    width: 1500,
    height: 800,
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

  // Registrar hotkey para captura de tela 15x15
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

        // Calcula a região 10x10 centralizada no mouse
        const captureSize = 10
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

  // Registrar hotkey para parar busca de imagem
  ipcMain.handle('stopImageSearch:register', async (_event, accelerator: string) => {
    try {
      if (stopImageSearchHotkey) {
        globalShortcut.unregister(stopImageSearchHotkey)
      }

      const success = globalShortcut.register(accelerator, () => {
        console.log(`Hotkey ${accelerator} -> stopImageSearch`)
        stopImageSearch = true
      })

      if (success) {
        stopImageSearchHotkey = accelerator
        console.log(`Hotkey ${accelerator} registrada para parar busca de imagem`)
        return { success: true, key: accelerator }
      } else {
        return { success: false, error: 'Tecla já em uso ou inválida' }
      }
    } catch (error) {
      console.error('Erro ao registrar hotkey de parada:', error)
      return { success: false, error: String(error) }
    }
  })

  // Desregistrar hotkey de parada de busca de imagem
  ipcMain.handle('stopImageSearch:unregister', async () => {
    if (stopImageSearchHotkey) {
      globalShortcut.unregister(stopImageSearchHotkey)
      stopImageSearchHotkey = null
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
