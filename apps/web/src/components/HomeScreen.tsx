import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PublicUser } from '../api/auth';
import { getRanking } from '../api/ranking';
import { track } from '../lib/analytics';
import { AvatarSvg } from './auth/avatars';
import './HomeScreen.css';

type MenuId = 'ranqueado' | 'ranking' | 'como' | 'sair';

type MenuItem = {
  id: MenuId;
  label: string;
  eyebrow: string;
  description: string;
  facts: string[];
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'ranqueado',
    label: 'Ranqueado',
    eyebrow: 'Modo',
    description:
      'Cinco lugares sorteados, 60 segundos por rodada. Sua melhor partida vale posição no ranking da semana.',
    facts: ['5 rodadas', '60 s por rodada', 'Até 25.000 pontos'],
  },
  {
    id: 'ranking',
    label: 'Ranking',
    eyebrow: 'Menu',
    description: 'O pódio da semana e o geral. A semana zera toda segunda, à meia-noite.',
    facts: ['Semana', 'Geral'],
  },
  {
    id: 'como',
    label: 'Como jogar',
    eyebrow: 'Menu',
    description:
      'Observe a foto, marque o palpite no mapa e confirme. Quanto mais perto, mais pontos: até 5.000 por rodada.',
    facts: ['Foto', 'Mapa', 'Pontos'],
  },
  {
    id: 'sair',
    label: 'Sair',
    eyebrow: 'Menu',
    description: 'Volta pra tela de título. Seu recorde continua salvo na conta.',
    facts: [],
  },
];

export function HomeScreen({
  user,
  onLogout,
  onStartRanked,
  onOpenRanking,
}: {
  user: PublicUser;
  onLogout: () => void;
  onStartRanked: () => void;
  onOpenRanking: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [record, setRecord] = useState<{ position: number; score: number } | null>(null);
  const [recordChecked, setRecordChecked] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const instructionsRef = useRef<HTMLDialogElement>(null);

  // Recorde da semana pra prévia do Ranqueado. É enfeite: se a chamada falhar, a
  // linha não aparece e o menu continua igual.
  useEffect(() => {
    let active = true;
    getRanking('semana', 1)
      .then((res) => {
        if (active) setRecord(res.me);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRecordChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const activate = (id: MenuId) => {
    if (id === 'ranqueado') onStartRanked();
    if (id === 'ranking') onOpenRanking();
    if (id === 'como') {
      track('view_instructions');
      instructionsRef.current?.showModal();
    }
    if (id === 'sair') onLogout();
  };

  // Mesma navegação da tela de título: setas ou W/S movem a seleção; o
  // Enter/Espaço fica com o clique nativo do botão focado.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const up = event.key === 'ArrowUp' || event.code === 'KeyW';
    const down = event.key === 'ArrowDown' || event.code === 'KeyS';
    if (!up && !down) return;
    event.preventDefault();
    const next = (selected + (up ? -1 : 1) + MENU_ITEMS.length) % MENU_ITEMS.length;
    setSelected(next);
    itemRefs.current[next]?.focus();
  };

  const current = MENU_ITEMS[selected];

  return (
    <div className="home-screen">
      <div className="home-map" aria-hidden="true" />
      <div className="home-veil" aria-hidden="true" />

      <header className="home-top">
        <p className="home-mark">PAguessr</p>
        <p className="home-player">
          <span className="home-avatar">
            <AvatarSvg id={user.avatarId} />
          </span>
          {user.nick}
        </p>
      </header>

      <main className="home-stage">
        <nav className="home-menu" aria-label="Menu principal" onKeyDown={handleKeyDown}>
          {MENU_ITEMS.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              className={`game-menu-item home-item${index === selected ? ' is-selected' : ''}`}
              onPointerEnter={() => setSelected(index)}
              onFocus={() => setSelected(index)}
              onClick={() => activate(item.id)}
              aria-haspopup={item.id === 'como' ? 'dialog' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="game-card home-preview" aria-live="polite">
          <p className="home-eyebrow">{current.eyebrow}</p>
          <h1 className="home-title">{current.label}</h1>
          <p className="home-desc">{current.description}</p>
          {current.facts.length > 0 && (
            <ul className="home-facts">
              {current.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          )}
          {current.id === 'ranqueado' && recordChecked && (
            <div className="home-record">
              {record ? (
                <>
                  <div>
                    <p className="home-record-label">Seu recorde</p>
                    <strong>{record.score.toLocaleString('pt-BR')}</strong>
                  </div>
                  <p className="home-record-note">{record.position}º na semana</p>
                </>
              ) : (
                <p className="home-record-note">Nenhuma partida ranqueada esta semana.</p>
              )}
            </div>
          )}
        </section>
      </main>

      <p className="game-hint" aria-hidden="true">
        <span>
          <kbd>
            <svg viewBox="0 0 16 16">
              <path d="M5.5 6.5 8 4l2.5 2.5M5.5 9.5 8 12l2.5-2.5" />
            </svg>
          </kbd>
          Navegar
        </span>
        <span>
          <kbd>
            <svg viewBox="0 0 16 16">
              <path d="M12.5 3.5v4.5H4.5M7.5 5 4.5 8l3 3" />
            </svg>
          </kbd>
          Selecionar
        </span>
      </p>
      <p className="game-version">
        v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>

      <dialog
        ref={instructionsRef}
        className="game-card home-instructions"
        aria-labelledby="instructions-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) instructionsRef.current?.close();
        }}
      >
        <div className="instructions-head">
          <h2 id="instructions-title">Como jogar</h2>
          <button
            autoFocus
            type="button"
            className="instructions-close"
            aria-label="Fechar instruções"
            onClick={() => instructionsRef.current?.close()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <ol className="instructions-steps">
          <li>
            <span className="instructions-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <rect x="4" y="6" width="24" height="20" rx="3" />
                <circle cx="21" cy="12" r="2" />
                <path d="m5 23 8-9 7 8 4-4 4 5" />
              </svg>
            </span>
            <div>
              <h3>Observe a foto</h3>
              <p>Procure pistas e reconheça o lugar.</p>
            </div>
          </li>
          <li>
            <span className="instructions-icon" aria-hidden="true">
              <svg viewBox="0 0 24 28">
                <path d="M22 11C22 19 12 26 12 26S2 19 2 11a10 10 0 1 1 20 0Z" />
                <circle cx="12" cy="11" r="3.5" />
              </svg>
            </span>
            <div>
              <h3>Marque seu palpite</h3>
              <p>Toque no mapa e confirme o ponto.</p>
            </div>
          </li>
          <li>
            <span className="instructions-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" />
                <circle cx="16" cy="16" r="7" />
                <circle cx="16" cy="16" r="2" />
              </svg>
            </span>
            <div>
              <h3>Quanto mais perto, melhor</h3>
              <p>Até 5.000 pontos em cada rodada.</p>
            </div>
          </li>
        </ol>
        <button
          type="button"
          className="game-cta instructions-play"
          onClick={() => instructionsRef.current?.close()}
        >
          Entendi
        </button>
      </dialog>
    </div>
  );
}
