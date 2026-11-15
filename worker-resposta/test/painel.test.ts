import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const SENHA = 'x'.repeat(40);

function montar(opcoes: { permitir?: boolean; falhar?: boolean; senha?: string } = {}) {
  const consultas: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        all: async () => {
          if (opcoes.falhar) throw new Error('d1');
          consultas.push({ sql, params });
          if (sql.includes('GROUP BY dia')) return { results: [{ dia: '2026-11-15', ajudou: 3, nao: 1 }] };
          if (sql.includes('contagem_perguntas')) return { results: [{ dia: '2026-11-15', tipo: 'sem_base', n: 2 }] };
          if (sql.includes('FROM paginas')) return { results: [{ url: 'https://a.furg.br/x', titulo: 'Página X' }] };
          if (sql.startsWith('SELECT fontes')) {
            return { results: [{ fontes: '["https://a.furg.br/x","https://a.furg.br/y"]' }, { fontes: '["https://a.furg.br/x"]' }] };
          }
          return { results: [{ dia: '2026-11-15', resposta: 'Resposta ruim [1].', fontes: '["https://a.furg.br/x"]' }] };
        },
      }),
    }),
  } as unknown as D1Database;
  const env = {
    DB: db,
    REINDEX_TOKEN: opcoes.senha ?? SENHA,
    LIMITADOR: { limit: async () => ({ success: opcoes.permitir ?? true }) },
  } as unknown as Env;
  return { env, consultas };
}

const dados = (env: Env, senha = SENHA, dias = '30') =>
  worker.fetch(
    new Request(`https://w.example/painel/dados?dias=${dias}`, { method: 'POST', headers: { Authorization: `Bearer ${senha}` } }),
    env,
  );

describe('painel', () => {
  it('GET /painel: página sem dados, com CSP, noindex e sem cache', async () => {
    const r = await worker.fetch(new Request('https://w.example/painel'), montar().env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const html = await r.text();
    expect(html).toContain('<script src="/painel.js" defer></script>');
    expect(html).not.toContain(SENHA);
  });
  it('GET /painel.js é JavaScript válido', async () => {
    const r = await worker.fetch(new Request('https://w.example/painel.js'), montar().env);
    expect(r.headers.get('Content-Type')).toContain('javascript');
    const codigo = await r.text();
    expect(() => new Function(codigo)).not.toThrow();
  });
  it('senha certa: dias por dia e respostas negativas do período', async () => {
    const { env, consultas } = montar();
    const r = await dados(env, SENHA, '7');
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({
      dias: 7,
      porDia: [{ dia: '2026-11-15', ajudou: 3, nao: 1 }],
      perguntas: [{ dia: '2026-11-15', tipo: 'sem_base', n: 2 }],
      paginasRuins: [
        { url: 'https://a.furg.br/x', titulo: 'Página X', n: 2 },
        { url: 'https://a.furg.br/y', titulo: 'https://a.furg.br/y', n: 1 },
      ],
      negativas: [{ resposta: 'Resposta ruim [1].', fontes: [{ url: 'https://a.furg.br/x', titulo: 'Página X' }] }],
    });
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(consultas[0]!.params).toEqual([j.inicio]);
  });
  it('período fora da lista vira 30 dias', async () => {
    const j = (await (await dados(montar().env, SENHA, '9999')).json()) as { dias: number };
    expect(j.dias).toBe(30);
  });
  it('senha errada ou ausente -> 401 sem consultar o banco', async () => {
    const { env, consultas } = montar();
    expect((await dados(env, 'errada')).status).toBe(401);
    expect((await worker.fetch(new Request('https://w.example/painel/dados', { method: 'POST' }), env)).status).toBe(401);
    expect(consultas).toHaveLength(0);
  });
  it('limite antes da senha -> 429', async () => {
    expect((await dados(montar({ permitir: false }).env)).status).toBe(429);
  });
  it('sem senha configurada (ou curta) -> 503', async () => {
    expect((await dados(montar({ senha: 'curta' }).env, 'curta')).status).toBe(503);
  });
  it('falha no D1 -> 503', async () => {
    expect((await dados(montar({ falhar: true }).env)).status).toBe(503);
  });
  it('GET em /painel/dados -> 405', async () => {
    expect((await worker.fetch(new Request('https://w.example/painel/dados'), montar().env)).status).toBe(405);
  });
});
