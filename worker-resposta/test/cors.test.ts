import { describe, it, expect } from 'vitest';
import { cabecalhosCors } from '../src/cors';

const permitidas = ['https://coperse.furg.br', 'https://sisu.furg.br'];

describe('cabecalhosCors', () => {
  it('devolve a origem exata e Vary quando permitida', () => {
    const h = cabecalhosCors('https://coperse.furg.br', permitidas);
    expect(h['Access-Control-Allow-Origin']).toBe('https://coperse.furg.br');
    expect(h['Vary']).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(h['Access-Control-Allow-Headers']).toBe('Content-Type');
  });
  it('devolve {} para origem não permitida', () => {
    expect(cabecalhosCors('https://evil.example', permitidas)).toEqual({});
  });
  it('devolve {} para origem nula', () => {
    expect(cabecalhosCors(null, permitidas)).toEqual({});
  });
  it('nunca devolve *', () => {
    expect(JSON.stringify(cabecalhosCors('*', permitidas))).not.toContain('*');
    expect(JSON.stringify(cabecalhosCors('https://sisu.furg.br', permitidas))).not.toContain('"*"');
  });
});
