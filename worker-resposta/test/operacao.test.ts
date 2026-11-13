import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { type Env } from '../src/index';
import { iguaisEmTempoConstante } from '../src/operacao';

const base = 'https://chatbot.example';
const SENHA = 'senha-de-reindexacao-bem-longa-123';
const TOKEN_GH = 'github_pat_segredo_do_github';

function d1Saude(opcoes: { execucao?: unknown; fila?: number; ok?: number; falha?: boolean }): D1Database {
  return {
    prepare(sql: string) {
      return {
        async first() {
          if (opcoes.falha) throw new Error('D1 fora');
          if (sql.includes('execucoes')) return opcoes.execucao ?? null;
          if (sql.includes('FROM fila')) return { n: opcoes.fila ?? 0 };
          return { n: opcoes.ok ?? 0 };
        },
      };
    },
  } as unknown as D1Database;
}

function montarEnv(extra: Partial<Env> = {}, limite = true): Env {
  return {
    DB: d1Saude({}),
    LIMITADOR: { limit: async () => ({ success: limite }) },
    GITHUB_REPO: 'furg/chatbot',
    GITHUB_WORKFLOW: 'indexar.yml',
    REINDEX_TOKEN: SENHA,
    GITHUB_TOKEN: TOKEN_GH,
    ...extra,
  } as unknown as Env;
}

function reindexar(senha: string | null) {
  const headers: Record<string, string> = {};
  if (senha !== null) headers.Authorization = `Bearer ${senha}`;
  return new Request(`${base}/reindexar`, { method: 'POST', headers });
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /saude', () => {
  it('traz a última execução, a fila e as páginas ok', async () => {
    const execucao = { inicio: '2026-11-12T10:00:00Z', fim: '2026-11-12T10:05:00Z', paginas: 12, erros: 1 };
    const env = montarEnv({ DB: d1Saude({ execucao, fila: 7, ok: 90 }) });
    const r = await worker.fetch(new Request(`${base}/saude`), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ultima_indexacao: execucao, fila: 7, paginas_ok: 90 });
  });
  it('sem execuções -> ultima_indexacao null', async () => {
    const r = await worker.fetch(new Request(`${base}/saude`), montarEnv({ DB: d1Saude({}) }));
    expect(await r.json()).toEqual({ ok: true, ultima_indexacao: null, fila: 0, paginas_ok: 0 });
  });
  it('falha no D1 -> 503 { ok: false }', async () => {
    const r = await worker.fetch(new Request(`${base}/saude`), montarEnv({ DB: d1Saude({ falha: true }) }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false });
  });
});

describe('iguaisEmTempoConstante', () => {
  it('compara iguais, diferentes e tamanhos distintos sem lançar', async () => {
    expect(await iguaisEmTempoConstante('abc', 'abc')).toBe(true);
    expect(await iguaisEmTempoConstante('abc', 'abd')).toBe(false);
    expect(await iguaisEmTempoConstante('abc', 'abcdefghijkl')).toBe(false);
    expect(await iguaisEmTempoConstante('', 'x')).toBe(false);
  });
});

describe('POST /reindexar', () => {
  it('senha certa -> 202 e chama o GitHub com ref main', async () => {
    const fetchFalso = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchFalso);
    const r = await worker.fetch(reindexar(SENHA), montarEnv());
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ ok: true });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/furg/chatbot/actions/workflows/indexar.yml/dispatches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' });
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN_GH}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'chatbot-coperse',
    });
  });
  it('token errado -> 401 sem chamar o GitHub', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    for (const s of ['senha-errada-mas-longa-o-bastante-123', 'curta', null]) {
      const r = await worker.fetch(reindexar(s), montarEnv());
      expect(r.status).toBe(401);
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it('senha certa com tamanho diferente não lança', async () => {
    const r = await worker.fetch(reindexar(SENHA + 'x'), montarEnv());
    expect(r.status).toBe(401);
  });
  it('REINDEX_TOKEN ausente ou curto -> 503', async () => {
    for (const t of [undefined, 'curto']) {
      const r = await worker.fetch(reindexar(t ?? 'qualquer'), montarEnv({ REINDEX_TOKEN: t }));
      expect(r.status).toBe(503);
    }
  });
  it('GITHUB_TOKEN ausente -> 503', async () => {
    const r = await worker.fetch(reindexar(SENHA), montarEnv({ GITHUB_TOKEN: undefined }));
    expect(r.status).toBe(503);
  });
  it('GitHub diferente de 204 -> 502 sem ecoar o corpo nem os tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`erro interno ${TOKEN_GH}`, { status: 422 })));
    const r = await worker.fetch(reindexar(SENHA), montarEnv());
    expect(r.status).toBe(502);
    const texto = await r.text();
    expect(texto).not.toContain(TOKEN_GH);
    expect(texto).not.toContain(SENHA);
    expect(texto).not.toContain('erro interno');
  });
  it('falha de rede no GitHub -> 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    const r = await worker.fetch(reindexar(SENHA), montarEnv());
    expect(r.status).toBe(502);
  });
  it('limitador esgotado -> 429', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    const r = await worker.fetch(reindexar(SENHA), montarEnv({}, false));
    expect(r.status).toBe(429);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it('GET /reindexar -> 405', async () => {
    const r = await worker.fetch(new Request(`${base}/reindexar`), montarEnv());
    expect(r.status).toBe(405);
  });
});
