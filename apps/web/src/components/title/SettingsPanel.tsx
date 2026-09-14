import { TitleBackButton } from './TitleBackButton';
import { useFullscreen } from './useFullscreen';
import { useReduceMotionOverride } from './useReduceMotionOverride';

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const [reduceMotion, setReduceMotion] = useReduceMotionOverride();
  const {
    active: fullscreen,
    supported: fullscreenSupported,
    setActive: setFullscreen,
  } = useFullscreen();

  return (
    <section className="title-panel" aria-label="Configurações">
      <div className="title-panel-top">
        <TitleBackButton onBack={onBack} />
      </div>
      <h2 className="title-panel-heading">Configurações</h2>

      <div className="title-panel-body">
        <label className="title-switch">
          <span className="title-switch-text">
            <span className="title-switch-label">Reduzir movimento</span>
            <span className="title-switch-desc">
              Desliga as animações do jogo, mesmo que o seu sistema não peça isso.
            </span>
          </span>
          <span className="title-switch-control">
            <input
              type="checkbox"
              role="switch"
              checked={reduceMotion}
              onChange={(event) => setReduceMotion(event.target.checked)}
            />
            <span className="title-switch-track" aria-hidden="true" />
          </span>
        </label>

        {fullscreenSupported ? (
          <label className="title-switch">
            <span className="title-switch-text">
              <span className="title-switch-label">Tela cheia</span>
              <span className="title-switch-desc">
                Esconde a barra do navegador. Some se você sair (ex.: apertando Esc).
              </span>
            </span>
            <span className="title-switch-control">
              <input
                type="checkbox"
                role="switch"
                checked={fullscreen}
                onChange={(event) => setFullscreen(event.target.checked)}
              />
              <span className="title-switch-track" aria-hidden="true" />
            </span>
          </label>
        ) : (
          <p className="title-panel-note">Tela cheia não é compatível com este navegador.</p>
        )}
      </div>
    </section>
  );
}
