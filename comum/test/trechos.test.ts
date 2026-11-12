import { describe, it, expect } from 'vitest';
import { dividirEmTrechos, prefixarTrecho } from '../src/trechos';

const palavras = (s: string) => s.split(/\s+/).filter(Boolean);

function textoLongo(n: number): string {
  const frases: string[] = [];
  let i = 0;
  let tam = 0;
  while (tam < n) {
    const f = `Esta é a frase número ${i} do edital de teste com palavras${i % 7}.`;
    frases.push(i % 5 === 4 ? f + '\n\n' : f + ' ');
    tam += f.length + 1;
    i++;
  }
  return frases.join('').slice(0, n);
}

describe('dividirEmTrechos', () => {
  it('texto vazio -> []', () => {
    expect(dividirEmTrechos('')).toEqual([]);
    expect(dividirEmTrechos('   \n ')).toEqual([]);
  });
  it('texto curto -> 1 trecho', () => {
    expect(dividirEmTrechos('a'.repeat(100))).toHaveLength(1);
  });
  it('10.000 caracteres: limite, sobreposição, cobertura, palavras inteiras', () => {
    const texto = textoLongo(10000);
    const t = dividirEmTrechos(texto);
    expect(t.length).toBeGreaterThan(1);
    for (const x of t) expect(x.length).toBeLessThanOrEqual(3200);
    for (let i = 1; i < t.length; i++) {
      const a = new Set(palavras(t[i - 1]!));
      expect(palavras(t[i]!).some((p) => a.has(p))).toBe(true);
    }
    const todas = new Set(t.flatMap(palavras));
    for (const p of palavras(texto)) expect(todas.has(p)).toBe(true);
    // palavras inteiras: primeira e última de cada trecho existem no original
    const orig = new Set(palavras(texto));
    for (const x of t) {
      const p = palavras(x);
      expect(orig.has(p[0]!)).toBe(true);
      expect(orig.has(p[p.length - 1]!)).toBe(true);
    }
  });
  it('respeita opções', () => {
    const t = dividirEmTrechos(textoLongo(2000), { maxCaracteres: 500, sobreposicao: 50 });
    for (const x of t) expect(x.length).toBeLessThanOrEqual(500);
    expect(t.length).toBeGreaterThan(3);
  });
  it('palavra gigante sem espaços não trava', () => {
    const t = dividirEmTrechos('x'.repeat(7000));
    expect(t.length).toBeGreaterThan(1);
    for (const x of t) expect(x.length).toBeLessThanOrEqual(3200);
  });
});

describe('prefixarTrecho', () => {
  it('geral: só título e data', () => {
    expect(prefixarTrecho('corpo', { titulo: 'Edital', data: '2026-03-05T10:00:00Z', processo: 'geral', ano: null })).toBe(
      'Edital (05/03/2026)\n\ncorpo',
    );
  });
  it('com processo e ano', () => {
    expect(prefixarTrecho('c', { titulo: 'T', data: '2026-03-05', processo: 'sisu', ano: 2026 })).toBe(
      'T — sisu 2026 (05/03/2026)\n\nc',
    );
  });
  it('ano nulo', () => {
    expect(prefixarTrecho('c', { titulo: 'T', data: '2026-03-05', processo: 'sisu', ano: null })).toBe('T — sisu (05/03/2026)\n\nc');
  });
  it('data vazia ou inválida omite parênteses', () => {
    expect(prefixarTrecho('c', { titulo: 'T', data: '', processo: 'geral', ano: null })).toBe('T\n\nc');
    expect(prefixarTrecho('c', { titulo: 'T', data: 'lixo', processo: 'geral', ano: null })).toBe('T\n\nc');
  });
});
