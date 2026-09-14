import { useCallback, useEffect, useState } from 'react';

function isActive(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

// Sem persistência: o navegador só entra em tela cheia a partir de um gesto
// do usuário (clique/tecla), então não dá pra reabrir sozinho ao recarregar
// a página, mesmo guardando a preferência. O switch reflete o estado real.
export function useFullscreen(): {
  active: boolean;
  supported: boolean;
  setActive: (next: boolean) => void;
} {
  const [active, setActiveState] = useState(isActive);
  const [supported] = useState(
    () => typeof document !== 'undefined' && document.fullscreenEnabled === true
  );

  useEffect(() => {
    const onChange = () => setActiveState(isActive());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const setActive = useCallback((next: boolean) => {
    if (next) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  return { active, supported, setActive };
}
