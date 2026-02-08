import MacroButton from './components/MacroButton'
import MousePositionButton from './components/MousePositionButton'
import ScreenCaptureButton from './components/ScreenCaptureButton'
import FindImageButton from './components/FindImageButton'

function App(): React.JSX.Element {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>Heaven Macro</h1>

      <div
        style={{
          marginTop: '40px',
          display: 'flex',
          justifyContent: 'center',
          gap: '30px',
          flexWrap: 'wrap'
        }}
      >
        <MacroButton name="REVIVE" macroId="revive" color="#4CAF50" />
        <ScreenCaptureButton />
        <FindImageButton />
        <MacroButton name="BUFF" macroId="buff" color="#9C27B0" />
        <MousePositionButton />
      </div>

      <p style={{ marginTop: '30px', fontSize: '12px', color: '#888' }}>
        Clique no botão e pressione a tecla desejada. Clique direito para remover.
      </p>
    </div>
  )
}

export default App
