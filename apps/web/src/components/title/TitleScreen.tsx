import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { createDust } from './titleDust';
import { useReducedMotion } from './useReducedMotion';
import { SettingsPanel } from './SettingsPanel';
import { CreditsPanel } from './CreditsPanel';
import './TitleScreen.css';
import './TitlePanel.css';

type MenuItem = {
  id: 'play' | 'settings' | 'credits';
  label: string;
  available: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { id: 'play', label: 'Jogar', available: true },
  { id: 'settings', label: 'Configurações', available: true },
  { id: 'credits', label: 'Créditos', available: true },
];

type View = 'title' | 'settings' | 'credits';

// Precisa bater com a duração da saída (.is-leaving) no TitleScreen.css.
const LEAVE_MS = 550;

function nextAvailable(from: number, direction: 1 | -1): number {
  for (let offset = 1; offset <= MENU_ITEMS.length; offset++) {
    const index = (from + direction * offset + MENU_ITEMS.length) % MENU_ITEMS.length;
    if (MENU_ITEMS[index].available) return index;
  }
  return from;
}

export function TitleScreen({
  ready,
  goesToAuth,
  onStart,
}: {
  ready: boolean;
  // Com sessão aberta o Jogar cai direto na Home; a saída só termina no visual
  // das telas de conta quando o login é mesmo o próximo passo.
  goesToAuth: boolean;
  onStart: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<View>('title');
  const [leaving, setLeaving] = useState(false);
  const [leaveDone, setLeaveDone] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const artRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const prevViewRef = useRef<View>('title');

  const activate = useCallback(
    (index: number) => {
      const item = MENU_ITEMS[index];
      if (leaving || !item.available) return;
      if (item.id === 'play') {
        setLeaving(true);
        return;
      }
      setView(item.id);
    },
    [leaving]
  );

  const goBack = useCallback(() => setView('title'), []);

  // Ao sair de Configurações/Créditos, o botão "Voltar" some do DOM (a seção
  // desmonta) e o foco cai pro <body>; devolve pro item que estava selecionado.
  // Não roda na primeira montagem, só numa volta de fato.
  useEffect(() => {
    if (view === 'title' && prevViewRef.current !== 'title') {
      itemRefs.current[selected]?.focus();
    }
    prevViewRef.current = view;
  }, [view, selected]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaveDone(true), reducedMotion ? 0 : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, reducedMotion]);

  // A sessão é conferida em paralelo pelo App; se a pessoa apertar Jogar antes da
  // resposta, a capa fica escurecida esperando em vez de piscar um spinner.
  useEffect(() => {
    if (leaveDone && ready) onStart();
  }, [leaveDone, ready, onStart]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      if (view !== 'title') {
        if (event.key === 'Escape') {
          event.preventDefault();
          goBack();
        }
        return;
      }

      const up = event.key === 'ArrowUp' || event.code === 'KeyW';
      const down = event.key === 'ArrowDown' || event.code === 'KeyS';
      const confirm = event.key === 'Enter' || event.key === ' ';
      if (!up && !down && !confirm) return;

      // Sem isso o Enter/Espaço no botão focado dispararia o clique nativo de novo.
      event.preventDefault();
      if (confirm) {
        if (!event.repeat) activate(selected);
        return;
      }
      const next = nextAvailable(selected, up ? -1 : 1);
      setSelected(next);
      itemRefs.current[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, selected, activate, goBack]);

  // Um único laço por quadro: suaviza o mouse, desloca a arte (parallax) e anima a poeira.
  useEffect(() => {
    const art = artRef.current;
    const canvas = dustRef.current;
    if (reducedMotion || !art || !canvas) return;

    const dust = createDust(canvas);
    const smooth = { x: 0, y: 0 };
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const follow = 1 - Math.exp(-dt * 3);
      smooth.x += (pointerRef.current.x - smooth.x) * follow;
      smooth.y += (pointerRef.current.y - smooth.y) * follow;
      art.style.transform = `translate3d(${(-smooth.x * 14).toFixed(2)}px, ${(-smooth.y * 9).toFixed(2)}px, 0)`;
      dust.step(dt, smooth.x, smooth.y);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      dust.destroy();
      art.style.transform = '';
    };
  }, [reducedMotion]);

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerRef.current.y = (event.clientY / window.innerHeight) * 2 - 1;
  };

  const resetPointer = () => {
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
  };

  return (
    <main
      className={`title-screen${leaving ? ' is-leaving' : ''}${
        leaving && !goesToAuth ? ' is-leaving-home' : ''
      }`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <h1 className="title-sr-only">PAguessr</h1>

      <div className="title-art" ref={artRef} aria-hidden="true">
        <div className="title-art-image" />
      </div>
      <div className="title-shade" aria-hidden="true" />
      {!reducedMotion && <canvas className="title-dust" ref={dustRef} aria-hidden="true" />}

      {view === 'title' && (
        <nav className="title-menu" aria-label="Menu principal">
          <ul>
            {MENU_ITEMS.map((item, index) => (
              <li key={item.id} style={{ '--item-index': index } as CSSProperties}>
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  className={`title-menu-item${index === selected ? ' is-selected' : ''}`}
                  disabled={!item.available}
                  onPointerEnter={() => {
                    if (item.available) setSelected(index);
                  }}
                  onFocus={() => setSelected(index)}
                  onClick={() => activate(index)}
                >
                  {item.label}
                  {!item.available && <span className="title-menu-soon">Em breve</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {view === 'settings' && <SettingsPanel onBack={goBack} />}
      {view === 'credits' && <CreditsPanel onBack={goBack} />}

      <p className="game-version title-version">
        v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>
      <p className="game-hint title-hint" aria-hidden="true">
        {view === 'title' ? (
          <span>
            <kbd>
              <svg viewBox="0 0 16 16">
                <path d="M12.5 3.5v4.5H4.5M7.5 5 4.5 8l3 3" />
              </svg>
            </kbd>
            Selecionar
          </span>
        ) : (
          <span>
            <kbd>Esc</kbd>
            Voltar
          </span>
        )}
      </p>
    </main>
  );
}
