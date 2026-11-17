import { describe, expect, it } from 'vitest';
import { carregarRegras } from '@chatbot/comum/classificar';
import listas from '../../config/listas.json';
import processos from '../../config/processos.json';
import { maisFeitas, sugestaoSegura, tratarSugestoes } from '../src/sugestoes';

const REGRAS = carregarRegras(processos, listas);
const vezes = (p: string, n: number) => Array.from({ length: n }, () => p);

describe('sugestões a partir do uso real', () => {
  it('só perguntas seguras: curtas, sem dados nem apresentação pessoal', () => {
    expect(sugestaoSegura('Quando é a prova do Vestibular?')).toBe(true);
    expect(sugestaoSegura('Meu nome é [removido], quando é a prova?')).toBe(false);
    expect(sugestaoSegura('Sou a Maria de Pelotas, quando é a prova?')).toBe(false);
    expect(sugestaoSegura('Minha inscrição 2026123456 foi aceita?')).toBe(false);
    expect(sugestaoSegura('Posso escrever para ana@gmail.com?')).toBe(false);
    expect(sugestaoSegura('Oi')).toBe(false);
    expect(sugestaoSegura('x'.repeat(71))).toBe(false);
  });

  it('agrupa formas iguais, exige 3 repetições, respeita ocultas e o processo do site', () => {
    const perguntas = [
      ...vezes('quando é a prova do vestibular', 2), 'Quando é a prova do Vestibular?', 'Quando e a prova do vestibular!',
      ...vezes('Como funciona a lista de espera do SiSU?', 3),
      ...vezes('Qual o valor da taxa?', 5),
      ...vezes('Onde fica o RU?', 2),
    ];
    const todas = maisFeitas(perguntas, new Set(), REGRAS);
    expect(todas.map((s) => [s.texto, s.vezes])).toEqual([
      ['Qual o valor da taxa?', 5],
      ['Quando é a prova do vestibular?', 4],
      ['Como funciona a lista de espera do SiSU?', 3],
    ]);
    expect(maisFeitas(perguntas, new Set(), REGRAS, 'vestibular').map((s) => s.texto)).toEqual(['Qual o valor da taxa?', 'Quando é a prova do vestibular?']);
    expect(maisFeitas(perguntas, new Set(['qual o valor da taxa']), REGRAS).map((s) => s.vezes)).toEqual([4, 3]);
  });

  it('GET /sugestoes: CORS, cache de 1 hora; falha no banco devolve lista vazia', async () => {
    const pedir = (origem: string) => new Request('https://w/sugestoes', { headers: { Origin: origem } });
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({ all: async () => ({ results: vezes('Qual o valor da taxa?', 3).map((pergunta) => ({ pergunta })) }) }),
        all: async () => ({ results: sql.includes('ocultas') ? [] : [] }),
      }),
    } as unknown as D1Database;
    const r = await tratarSugestoes(pedir('https://coperse.furg.br'), { DB: db }, ['https://coperse.furg.br'], REGRAS, () => undefined);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://coperse.furg.br');
    expect(await r.json()).toEqual({ sugestoes: ['Qual o valor da taxa?'] });
    const quebrado = { prepare: () => { throw new Error('d1'); } } as unknown as D1Database;
    expect(await (await tratarSugestoes(pedir('https://coperse.furg.br'), { DB: quebrado }, ['https://coperse.furg.br'], REGRAS, () => undefined)).json()).toEqual({ sugestoes: [] });
    expect((await tratarSugestoes(pedir('https://x.com'), { DB: db }, ['https://coperse.furg.br'], REGRAS, () => undefined)).status).toBe(403);
  });
});
