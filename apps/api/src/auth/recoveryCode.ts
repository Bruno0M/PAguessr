import { randomBytes } from 'node:crypto';

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). 32 símbolos: 256 % 32 === 0,
// então `byte % 32` já é uniforme, sem precisar de rejection sampling.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP_LENGTH = 4;
const GROUP_COUNT = 3;

export function generateRecoveryCode(): string {
  const totalChars = GROUP_LENGTH * GROUP_COUNT;
  const bytes = randomBytes(totalChars);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);

  const groups: string[] = [];
  for (let i = 0; i < GROUP_COUNT; i += 1) {
    groups.push(chars.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
