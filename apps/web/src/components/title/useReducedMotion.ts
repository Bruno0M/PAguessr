import { useSyncExternalStore } from 'react';
import { getEffectiveReduceMotion, subscribeReduceMotion } from '../../lib/motionPreference';

// Combina a preferência do sistema com o override manual de Configurações
// (ver lib/motionPreference.ts) e acompanha os dois em tempo real.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, getEffectiveReduceMotion, () => false);
}
