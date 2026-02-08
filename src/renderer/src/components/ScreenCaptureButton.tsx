import { useState, useEffect } from 'react'

function ScreenCaptureButton(): React.JSX.Element {
  const [hotkey, setHotkey] = useState<string>('')
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const keyEventToAccelerator = (e: KeyboardEvent): string => {
    const parts: string[] = []

    if (e.ctrlKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')

    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right'
    }

    let key = keyMap[e.key] || e.key.toUpperCase()

    if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
      return ''
    }

    if (e.key.startsWith('F') && e.key.length <= 3) {
      key = e.key.toUpperCase()
    }

    parts.push(key)
    return parts.join('+')
  }

  useEffect(() => {
    if (!isListening) return

    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault()
      const accelerator = keyEventToAccelerator(e)

      if (!accelerator) return

      setIsListening(false)
      setStatus('Registrando...')

      const result = await window.api.registerScreenCaptureHotkey(accelerator)

      if (result.success) {
        setHotkey(accelerator)
        setStatus('')
      } else {
        setStatus(`Erro: ${result.error}`)
        setTimeout(() => setStatus(''), 2000)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isListening])

  useEffect(() => {
    window.api.onScreenCapture(
      (imageData: { width: number; height: number; data: number[] }) => {
        // Converte os dados RGB para uma imagem exibível usando canvas
        const canvas = document.createElement('canvas')
        canvas.width = imageData.width
        canvas.height = imageData.height
        const ctx = canvas.getContext('2d')

        if (ctx) {
          const imgData = ctx.createImageData(imageData.width, imageData.height)

          // Os dados vêm em formato RGBA do nut-js
          for (let i = 0; i < imageData.data.length; i++) {
            imgData.data[i] = imageData.data[i]
          }

          ctx.putImageData(imgData, 0, 0)
          setCapturedImage(canvas.toDataURL('image/png'))
        }
      }
    )

    return () => {
      window.api.removeScreenCaptureListener()
    }
  }, [])

  const handleClick = (): void => {
    setIsListening(true)
    setStatus('Pressione uma tecla...')
  }

  const handleRightClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    if (hotkey) {
      await window.api.unregisterScreenCaptureHotkey()
      setHotkey('')
      setStatus('')
      setCapturedImage(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <button
        onClick={handleClick}
        onContextMenu={handleRightClick}
        disabled={isListening}
        style={{
          padding: '15px 40px',
          fontSize: '18px',
          fontWeight: 'bold',
          backgroundColor: isListening ? '#FFC107' : '#FF5722',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isListening ? 'default' : 'pointer',
          minWidth: '150px'
        }}
      >
        {isListening ? '...' : 'SELECIONAR CAPTURA'}
      </button>

      <span style={{ fontSize: '12px', color: '#888', height: '18px' }}>
        {status || (hotkey ? hotkey : 'Sem tecla')}
      </span>

      {capturedImage && (
        <div
          style={{
            marginTop: '10px',
            border: '2px solid #FF5722',
            borderRadius: '4px',
            overflow: 'hidden'
          }}
        >
          <img
            src={capturedImage}
            alt="Captura"
            style={{ width: '30px', height: '30px', display: 'block' }}
          />
        </div>
      )}
    </div>
  )
}

export default ScreenCaptureButton
