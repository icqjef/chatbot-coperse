import { describe, it, expect } from 'vitest';
import { chaveCache, lerCache, normalizar, TTL_MS } from '../src/cache';

describe('cache de respostas', () => {
  it('normaliza acento, caixa, pontuação e espaços', () => {
    expect(normalizar('  Quando É a PROVA?! ')).toBe('quando e a prova');
    expect(normalizar('Inscrição: até 10/12')).toBe('inscricao ate 10 12');
  });

  it('a chave muda com o dia de Brasília', async () => {
    const a = await chaveCache('qual o prazo', new Date('2026-11-16T12:00:00Z'));
    const b = await chaveCache('Qual o prazo?', new Date('2026-11-16T20:00:00Z'));
    const c = await chaveCache('qual o prazo', new Date('2026-11-17T12:00:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lê só o que tem menos de 2 horas e tem fonte', async () => {
    const agora = new Date('2026-11-16T12:00:00Z');
    let minimo = 0;
    let linha: { resultado: string } | null = { resultado: JSON.stringify({ resposta: 'x [1]', fontes: [{ url: 'u' }], sugestoes: [], contato: false }) };
    const db = {
      prepare: () => ({ bind: (_c: string, m: number) => ((minimo = m), { first: async () => linha }) }),
    } as unknown as D1Database;
    expect((await lerCache(db, 'k', agora))?.resposta).toBe('x [1]');
    expect(minimo).toBe(agora.getTime() - TTL_MS);
    linha = { resultado: JSON.stringify({ resposta: 'x', fontes: [], sugestoes: [], contato: true }) };
    expect(await lerCache(db, 'k', agora)).toBeNull();
    linha = { resultado: '{quebrado' };
    expect(await lerCache(db, 'k', agora)).toBeNull();
  });
});
