import { describe, expect, it } from 'vitest';
import { parseLobbyCountdownSeconds } from './lobbyCountdown.js';

describe('parseLobbyCountdownSeconds', () => {
  it('usa 0 quando ausente ou inválido', () => {
    expect(parseLobbyCountdownSeconds(undefined)).toBe(0);
    expect(parseLobbyCountdownSeconds('')).toBe(0);
    expect(parseLobbyCountdownSeconds('abc')).toBe(0);
    expect(parseLobbyCountdownSeconds('-5')).toBe(0);
  });

  it('aceita segundos inteiros', () => {
    expect(parseLobbyCountdownSeconds('60')).toBe(60);
    expect(parseLobbyCountdownSeconds(' 30 ')).toBe(30);
    expect(parseLobbyCountdownSeconds('12.9')).toBe(12);
  });
});
