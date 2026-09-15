import { TitleBackButton } from './TitleBackButton';

// Ordem e papéis conferidos com o Tiago: só ele acumula Design, os demais são
// só Programação. Sem GitHub/tecnologias na tela — decidido pra manter o
// clima de crédito de jogo, sem virar um README.
const DESIGN = ['Tiago Santos'];

const PROGRAMACAO = [
  'Tiago Santos',
  'Jean Carlos',
  'Matheus Menezes',
  'Bruno de Medeiros',
  'José Kayky',
  'Guilherme Augusto',
];

export function CreditsPanel({ onBack }: { onBack: () => void }) {
  return (
    <section className="title-panel title-credits" aria-label="Créditos">
      <div className="title-panel-top">
        <TitleBackButton onBack={onBack} />
      </div>
      <h2 className="title-panel-heading">Créditos</h2>

      <div className="title-panel-body">
        <div className="credits-group">
          <h3>Design</h3>
          <ul>
            {DESIGN.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
        <div className="credits-group">
          <h3>Programação</h3>
          <ul>
            {PROGRAMACAO.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="title-panel-footer">PAguessr · Paulo Afonso, Bahia</p>
    </section>
  );
}
