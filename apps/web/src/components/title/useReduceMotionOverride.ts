import { useCallback, useSyncExternalStore } from 'react';
import {
  getReduceMotionOverride,
  setReduceMotionOverride,
  subscribeReduceMotion,
} from '../../lib/motionPreference';

// Preferência manual (o switch em Configurações), separado do
// useReducedMotion, que expõe o valor já combinado com o sistema operacional.
export function useReduceMotionOverride(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribeReduceMotion, getReduceMotionOverride, () => false);
  const setValue = useCallback((next: boolean) => setReduceMotionOverride(next), []);
  return [value, setValue];
}
