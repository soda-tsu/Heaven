import MacroButton from './components/MacroButton'
import MousePositionButton from './components/MousePositionButton'
import ScreenCaptureButton from './components/ScreenCaptureButton'
import FindImageButton from './components/FindImageButton'
import ceraImg from './assets/cera.png'
import nuvemGorda from './assets/nuvenGorda.png'
import nuvemEsticada from './assets/nuvenEsticada.png'
import nuvemMiuda from './assets/nuvenMiuda.png'

import './App.css'

function App(): React.JSX.Element {
  return (
    <div className="app-container">
      <nav className='nav'>
        <h1 className="app-title">Heaven</h1>
      </nav>

      <img src={nuvemGorda} alt="Heaven nuvem gorda" className="nuvemGorda" />
      <img src={nuvemEsticada} alt="Heaven nuvem esticada" className="nuvemEsticada" />
      {/* <img src={nuvemMiuda} alt="Heaven nuvem miuda" className="nuvemMiuda" /> */}

      <section className="outlandSection">
        <MacroButton name="REVIVE" macroId="revive" />
        <ScreenCaptureButton />
        <FindImageButton />
        <MacroButton name="BUFF" macroId="buff" />
        <MousePositionButton />
      </section>

      <img src={ceraImg} alt="Heaven cera" className="cera" />

      {/* <footer className="app-footer">
        <p>Clique no botão e pressione a tecla desejada. Clique direito para remover.</p>
      </footer> */}
    </div>
  )
}

export default App
