import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSecret, verifySecret } from './crypto.js';

describe('auth/crypto', () => {
  it('gera um hash que verifica corretamente contra o segredo original', async () => {
    const hash = await hashSecret('minhaSenha123');
    await expect(verifySecret('minhaSenha123', hash)).resolves.toBe(true);
  });

  it('rejeita um segredo incorreto', async () => {
    const hash = await hashSecret('minhaSenha123');
    await expect(verifySecret('outraSenha', hash)).resolves.toBe(false);
  });

  it('gera hashes diferentes (salts diferentes) para o mesmo segredo', async () => {
    const a = await hashSecret('repetida');
    const b = await hashSecret('repetida');
    expect(a).not.toBe(b);
  });

  it('retorna false para um valor armazenado malformado, sem lançar', async () => {
    await expect(verifySecret('qualquer', 'lixo-nao-e-hash')).resolves.toBe(false);
    await expect(verifySecret('qualquer', 'scrypt:16384:8:1:')).resolves.toBe(false);
    await expect(verifySecret('qualquer', 'scrypt:abc:8:1:aa:bb')).resolves.toBe(false);
    await expect(verifySecret('qualquer', 'bcrypt:16384:8:1:aa:bb')).resolves.toBe(false);
  });

  it('gera tokens de sessão únicos e url-safe', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(30);
  });
});
