import { describe, expect, it } from 'vitest';
import { containsBlockedWord, normalizeNick } from './nickname.js';

describe('auth/nickname', () => {
  describe('normalizeNick', () => {
    it('converte para minúsculas', () => {
      expect(normalizeNick('Tiago_123')).toBe('tiago_123');
    });
  });

  describe('containsBlockedWord', () => {
    it('detecta termos bloqueados independente de caixa', () => {
      expect(containsBlockedWord('Admin')).toBe(true);
      expect(containsBlockedWord('xxADMINxx')).toBe(true);
      expect(containsBlockedWord('PORRAnenhuma')).toBe(true);
    });

    it('não bloqueia nicks comuns', () => {
      expect(containsBlockedWord('tiago')).toBe(false);
      expect(containsBlockedWord('jogador_01')).toBe(false);
    });
  });
});
