import { useState, useEffect } from 'react'
import './MacroButton.css'

interface MacroButtonProps {
  name: string
  macroId: string
  color?: string
}

function MacroButton({ name, macroId, color = '#D99197' }: MacroButtonProps): React.JSX.Element {
  const [hotkey, setHotkey] = useState<string>('')
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState<string>('')

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

  // Escuta tecla quando em modo de captura
  useEffect(() => {
    if (!isListening) return

    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault()
      const accelerator = keyEventToAccelerator(e)

      if (!accelerator) return

      setIsListening(false)
      setStatus('Registrando...')

      const result = await window.api.registerHotkey(macroId, accelerator)

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
  }, [isListening, macroId])

  const handleClick = (): void => {
    setIsListening(true)
    setStatus('...')
  }

  const handleRightClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    if (hotkey) {
      await window.api.unregisterHotkey(macroId)
      setHotkey('')
      setStatus('')
    }
  }

  return (
    <div className="macro-button-container">
      <button
        className="macro-button"
        onClick={handleClick}
        onContextMenu={handleRightClick}
        disabled={isListening}
        style={{ '--button-color': color } as React.CSSProperties}
      >
        {isListening ? 'pressione a tecla' : name}
      </button>

      <div className="macro-button-status">
        {status || (hotkey ? hotkey : '-')}
      </div>
    </div>
  )
}

export default MacroButton
