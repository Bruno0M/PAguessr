// Preferência de "reduzir movimento" combinando duas fontes: o que o sistema
// operacional já pede (`prefers-reduced-motion`) e um override manual que a
// pessoa liga na tela de Configurações, pra quem quer isso mesmo sem ter
// mexido nessa opção do Windows/celular. Módulo (não hook) porque também
// precisa ser lido por CSS puro: ao carregar, já grava um atributo em
// `<html>` que as folhas de estilo usam como gêmeo do `@media
// (prefers-reduced-motion: reduce)` de cada arquivo.
const STORAGE_KEY = 'paguessr:reduce-motion-override';
const ATTRIBUTE = 'data-reduce-motion';
const OVERRIDE_CHANGED_EVENT = 'paguessr:reduce-motion-override-changed';
const QUERY = '(prefers-reduced-motion: reduce)';

function osReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

export function getReduceMotionOverride(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Modo privado ou localStorage bloqueado: a preferência só dura a sessão atual.
    return false;
  }
}

export function getEffectiveReduceMotion(): boolean {
  return osReducedMotion() || getReduceMotionOverride();
}

function applyAttribute(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(ATTRIBUTE, String(getEffectiveReduceMotion()));
}

export function setReduceMotionOverride(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Sem persistência disponível: aplica só nesta sessão.
  }
  applyAttribute();
  window.dispatchEvent(new Event(OVERRIDE_CHANGED_EVENT));
}

// Usado pelos hooks React (useSyncExternalStore) e por quem mais precisar
// saber quando o valor efetivo pode ter mudado.
export function subscribeReduceMotion(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  window.addEventListener(OVERRIDE_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener(OVERRIDE_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Roda uma vez ao importar (antes do primeiro paint, se importado cedo em
// main.tsx): garante que animações puramente em CSS já nascem obedecendo a
// preferência salva, sem esperar nenhum componente React montar.
if (typeof window !== 'undefined') {
  applyAttribute();
  window.matchMedia(QUERY).addEventListener('change', applyAttribute);
  window.addEventListener(OVERRIDE_CHANGED_EVENT, applyAttribute);
}
