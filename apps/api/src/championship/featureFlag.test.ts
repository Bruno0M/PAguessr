import { describe, expect, it } from 'vitest';
import {
  isChampionshipsVisible,
  parseChampionshipsMode,
} from './featureFlag.js';

describe('featureFlag - parseChampionshipsMode', () => {
  it('retorna "off" para valor ausente (undefined)', () => {
    expect(parseChampionshipsMode(undefined)).toBe('off');
  });

  it('retorna "off" para string vazia', () => {
    expect(parseChampionshipsMode('')).toBe('off');
  });

  it('retorna "off" para string contendo apenas espaços', () => {
    expect(parseChampionshipsMode('   ')).toBe('off');
  });

  it('retorna "off" para valores inválidos', () => {
    expect(parseChampionshipsMode('invalid')).toBe('off');
    expect(parseChampionshipsMode('true')).toBe('off');
    expect(parseChampionshipsMode('1')).toBe('off');
    expect(parseChampionshipsMode('disabled')).toBe('off');
  });

  it('retorna "off" para "off"', () => {
    expect(parseChampionshipsMode('off')).toBe('off');
    expect(parseChampionshipsMode('OFF')).toBe('off');
    expect(parseChampionshipsMode('  off  ')).toBe('off');
  });

  it('retorna "admin" para "admin"', () => {
    expect(parseChampionshipsMode('admin')).toBe('admin');
    expect(parseChampionshipsMode('ADMIN')).toBe('admin');
    expect(parseChampionshipsMode('  admin  ')).toBe('admin');
  });

  it('retorna "public" para "public"', () => {
    expect(parseChampionshipsMode('public')).toBe('public');
    expect(parseChampionshipsMode('PUBLIC')).toBe('public');
    expect(parseChampionshipsMode('  public  ')).toBe('public');
  });
});

describe('featureFlag - isChampionshipsVisible (6 cruzamentos de modo x isAdmin)', () => {
  it('modo off e isAdmin = false -> false', () => {
    expect(isChampionshipsVisible('off', false)).toBe(false);
  });

  it('modo off e isAdmin = true -> false', () => {
    expect(isChampionshipsVisible('off', true)).toBe(false);
  });

  it('modo admin e isAdmin = false -> false', () => {
    expect(isChampionshipsVisible('admin', false)).toBe(false);
  });

  it('modo admin e isAdmin = true -> true', () => {
    expect(isChampionshipsVisible('admin', true)).toBe(true);
  });

  it('modo public e isAdmin = false -> true', () => {
    expect(isChampionshipsVisible('public', false)).toBe(true);
  });

  it('modo public e isAdmin = true -> true', () => {
    expect(isChampionshipsVisible('public', true)).toBe(true);
  });
});
