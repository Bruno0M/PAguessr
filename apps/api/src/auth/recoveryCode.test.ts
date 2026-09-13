import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, normalizeRecoveryCode } from './recoveryCode.js';

describe('auth/recoveryCode', () => {
  describe('generateRecoveryCode', () => {
    it('gera um código no formato XXXX-XXXX-XXXX', () => {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('não usa caracteres ambíguos (0, O, 1, I, L)', () => {
      const code = generateRecoveryCode();
      expect(code).not.toMatch(/[01ILO]/);
    });

    it('gera códigos diferentes a cada chamada', () => {
      const a = generateRecoveryCode();
      const b = generateRecoveryCode();
      expect(a).not.toBe(b);
    });
  });

  describe('normalizeRecoveryCode', () => {
    it('remove hífens e espaços e converte para maiúsculas', () => {
      expect(normalizeRecoveryCode('abcd-efgh-ijkl')).toBe('ABCDEFGHIJKL');
      expect(normalizeRecoveryCode('abcd efgh ijkl')).toBe('ABCDEFGHIJKL');
      expect(normalizeRecoveryCode('ABCD-EFGH-IJKL')).toBe('ABCDEFGHIJKL');
    });
  });
});
