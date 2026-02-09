import MacroButton from './components/MacroButton'
import MousePositionButton from './components/MousePositionButton'
import ScreenCaptureButton from './components/ScreenCaptureButton'
import FindImageButton from './components/FindImageButton'
import ceraImg from './assets/cera.png'
// import nuvemGorda from './assets/nuvenGorda.png'
import nuvemEsticada from './assets/nuvenEsticada.png'
// import nuvemMiuda from './assets/nuvenMiuda.png'

import './App.css'

function App(): React.JSX.Element {
  return (
    <div className="app-container">
      <nav className='nav'>
        <h1 className="app-title">Heaven</h1>
      </nav>

      <img src={nuvemEsticada} alt="Heaven nuvem esticada" className="nuvemEsticada" />
      <div className="tableSections">
      <section className="outlandSection">
        <h2 style={{textAlign: "center"}}>OUTLAND</h2>
        <MacroButton name="REVIVE" macroId="revive" />
        <MacroButton name="COMBO" macroId="combo" />
        <FindImageButton />
        {/* <MacroButton name="BUFF" macroId="buff" /> */}
        <MousePositionButton />
      </section>
      </div>
      <ScreenCaptureButton />

      <img src={ceraImg} alt="Heaven cera" className="cera" />

      {/* <footer className="app-footer">
        <p>Clique no botão e pressione a tecla desejada. Clique direito para remover.</p>
      </footer> */}
    </div>
  )
}

export default App
