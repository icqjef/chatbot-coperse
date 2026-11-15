import { describe, expect, it } from 'vitest';
import { contarPergunta } from '../src/contagem';

function dbFalso(falhar = false) {
  const lotes: { sql: string; params: unknown[] }[][] = [];
  const db = {
    prepare: (sql: string) => ({ bind: (...params: unknown[]) => ({ sql, params }) }),
    batch: async (l: { sql: string; params: unknown[] }[]) => {
      if (falhar) throw new Error('d1');
      lotes.push(l);
      return [];
    },
  } as unknown as D1Database;
  return { db, lotes };
}

const agora = new Date('2026-11-15T15:00:00Z');

describe('contarPergunta', () => {
  it('sem registro: só soma o contador do dia', async () => {
    const { db, lotes } = dbFalso();
    await contarPergunta(db, 'sem_base', agora);
    expect(lotes[0]).toHaveLength(1);
    expect(lotes[0]![0]!.params).toEqual(['2026-11-15', 'sem_base']);
  });
  it('com registro: grava o texto (até 500) e apaga o que passou de 90 dias, no mesmo lote', async () => {
    const { db, lotes } = dbFalso();
    await contarPergunta(db, 'recusa', agora, { pergunta: 'x'.repeat(600) });
    const [, inserir, apagar] = lotes[0]!;
    expect(inserir!.sql).toContain('INSERT INTO perguntas_registro');
    expect(inserir!.params).toEqual(['2026-11-15', 'recusa', 'x'.repeat(500)]);
    expect(apagar!.sql).toContain('DELETE FROM perguntas_registro WHERE dia < ?');
    expect(apagar!.params).toEqual(['2026-08-17']);
  });
  it('conversa (saudação) não grava texto', async () => {
    const { db, lotes } = dbFalso();
    await contarPergunta(db, 'conversa', agora, { pergunta: 'oi' });
    expect(lotes[0]).toHaveLength(1);
  });
  it('falha no D1 não lança', async () => {
    await expect(contarPergunta(dbFalso(true).db, 'respondida', agora)).resolves.toBeUndefined();
  });
});
