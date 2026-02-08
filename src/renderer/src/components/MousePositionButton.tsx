import { useState, useEffect } from 'react'

function MousePositionButton(): React.JSX.Element {
  const [hotkey, setHotkey] = useState<string>('')
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  // Converte evento de teclado para formato do Electron (accelerator)
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

  // Escuta posição do mouse capturada
  useEffect(() => {
    window.api.onMousePositionCaptured((pos) => {
      setPosition(pos)
    })

    return () => {
      window.api.removeMousePositionListener()
    }
  }, [])

  // Escuta tecla quando em modo de captura
  useEffect(() => {
    if (!isListening) return

    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault()
      const accelerator = keyEventToAccelerator(e)

      if (!accelerator) return

      setIsListening(false)
      setStatus('Registrando...')

      const result = await window.api.registerMousePositionHotkey(accelerator)

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

  const handleClick = (): void => {
    setIsListening(true)
    setStatus('Pressione uma tecla...')
  }

  const handleRightClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    if (hotkey) {
      await window.api.unregisterMousePositionHotkey()
      setHotkey('')
      setPosition(null)
      setStatus('')
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
        {isListening ? '...' : 'MOUSE POS'}
      </button>

      <span style={{ fontSize: '12px', color: '#888', height: '18px' }}>
        {status || (hotkey ? hotkey : 'Sem tecla')}
      </span>

      {position && (
        <span
          style={{
            fontSize: '14px',
            color: '#4CAF50',
            fontWeight: 'bold',
            backgroundColor: '#1a1a1a',
            padding: '8px 16px',
            borderRadius: '4px',
            marginTop: '4px'
          }}
        >
          X: {position.x} | Y: {position.y}
        </span>
      )}
    </div>
  )
}

export default MousePositionButton
