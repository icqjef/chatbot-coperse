import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { buscarOficial, comMemoria } from '../src/oficiais';
import { responderPergunta } from '../src/perguntar';

const v = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};
const LINHA = {
  id: 1, resposta: 'A prova será em 22/11/2026.', processo: 'vestibular', vetor: JSON.stringify(v(1, 0, 0)),
  url: 'https://coperse.furg.br/edital.pdf', titulo: 'Edital', site: 'coperse', data_publicacao: '2026-10-01',
};
const dbCom = (linhas: unknown[]) =>
  ({ prepare: () => ({ all: async () => ({ results: linhas }) }) }) as unknown as D1Database;

describe('buscarOficial', () => {
  it('pergunta de mesmo sentido e mesmo processo recebe a oficial com a fonte e [1]', async () => {
    const r = await buscarOficial(dbCom([LINHA]), v(0.99, 0.1, 0), 'vestibular');
    expect(r).toEqual({
      resposta: 'A prova será em 22/11/2026. [1]',
      fontes: [{ titulo: 'Edital', url: LINHA.url, site: 'coperse', data: '2026-10-01' }],
      sugestoes: [],
      contato: false,
      oficial: true,
    });
  });
  it('outro processo, processo desconhecido ou sentido diferente: nada', async () => {
    expect(await buscarOficial(dbCom([LINHA]), v(1, 0, 0), 'indigenas')).toBeNull();
    expect(await buscarOficial(dbCom([LINHA]), v(1, 0, 0), null)).toBeNull();
    expect(await buscarOficial(dbCom([LINHA]), v(0.7, 0.7, 0), 'vestibular')).toBeNull();
  });
  it('oficial sem processo vale para qualquer pergunta; escolhe a mais parecida; ignora vetor quebrado', async () => {
    const geral = { ...LINHA, id: 2, processo: null, resposta: 'Geral [1].', vetor: JSON.stringify(v(1, 0.05, 0)) };
    const quebrada = { ...LINHA, id: 3, vetor: '{' };
    const r = await buscarOficial(dbCom([quebrada, geral]), v(1, 0.05, 0), null);
    expect(r?.resposta).toBe('Geral [1].');
  });
  it('comMemoria: o mesmo texto embutido duas vezes chama o provedor uma vez', async () => {
    const embed = vi.fn(async () => [[1]]);
    const e = comMemoria({ embed });
    await e.embed(['a'], 'RETRIEVAL_QUERY');
    await e.embed(['a'], 'RETRIEVAL_QUERY');
    await e.embed(['a'], 'RETRIEVAL_DOCUMENT');
    expect(embed).toHaveBeenCalledTimes(2);
  });
});

describe('resposta oficial no fluxo', () => {
  it('vem antes da busca e do Gemini', async () => {
    const buscar = vi.fn();
    const gerar = vi.fn();
    const oficial = vi.fn(async () => ({ resposta: 'Oficial [1].', fontes: [], sugestoes: [], contato: false, oficial: true }));
    const r = await responderPergunta(
      { pergunta: 'Quando é a prova do Vestibular?', historico: [] },
      { buscar, gerador: { gerar }, agora: () => new Date('2026-11-16T12:00:00Z'), oficial },
    );
    expect(oficial).toHaveBeenCalledWith('Quando é a prova do Vestibular?', 'vestibular');
    expect(r.resposta).toBe('Oficial [1].');
    expect(buscar).not.toHaveBeenCalled();
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe('painel: respostas oficiais', () => {
  const SENHA = 'x'.repeat(40);
  afterEach(() => vi.unstubAllGlobals());

  function montar(opcoes: { paginaExiste?: boolean } = {}) {
    const lotes: { sql: string; params: unknown[] }[][] = [];
    const db = {
      prepare: (sql: string) => {
        const stmt = (params: unknown[]) => ({
          sql, params,
          first: async () => (sql.includes('FROM paginas') && opcoes.paginaExiste !== false ? { url: params[0] } : null),
          all: async () => ({ results: [{ id: 1, pergunta: 'p', resposta: 'r', fonte_url: 'u', processo: null, criada: '2026-11-16', fonte_titulo: 't' }] }),
        });
        return { ...stmt([]), bind: (...p: unknown[]) => stmt(p) };
      },
      batch: async (l: { sql: string; params: unknown[] }[]) => {
        lotes.push(l);
        return [];
      },
    } as unknown as D1Database;
    const env = {
      DB: db, REINDEX_TOKEN: SENHA, PROVEDOR_LLM: 'gemini', GEMINI_API_KEY: 'k', DIMENSAO_EMBEDDING: '3',
      LIMITADOR: { limit: async () => ({ success: true }) },
    } as unknown as Env;
    vi.stubGlobal('fetch', async () => Response.json({ embeddings: [{ values: [1, 0, 0] }] }));
    return { env, lotes };
  }
  const pedir = (env: Env, acao: string, corpo: unknown, senha = SENHA) =>
    worker.fetch(
      new Request(`https://w/painel/oficiais/${acao}`, { method: 'POST', headers: { Authorization: `Bearer ${senha}` }, body: JSON.stringify(corpo) }),
      env,
    );

  it('sem a senha: 401', async () => {
    expect((await pedir(montar().env, 'listar', {}, 'errada'.repeat(8))).status).toBe(401);
  });

  it('salvar: grava pergunta mascarada, processo, vetor e limpa o cache', async () => {
    const { env, lotes } = montar();
    const r = await pedir(env, 'salvar', {
      pergunta: 'Quando é a prova do Vestibular? Meu CPF é 123.456.789-09',
      resposta: 'A prova será em 22/11/2026, às 14h.',
      fonte: 'https://coperse.furg.br/edital.pdf',
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, processo: 'vestibular' });
    const [inserir, limpar] = lotes[0]!;
    expect(inserir!.params[0]).toBe('Quando é a prova do Vestibular? Meu CPF é [removido]');
    expect(inserir!.params[3]).toBe('vestibular');
    expect(JSON.parse(inserir!.params[4] as string)).toHaveLength(3);
    expect(limpar!.sql).toBe('DELETE FROM respostas_cache');
  });

  it('salvar: fonte que o assistente não lê, resposta curta: 400', async () => {
    const semPagina = montar({ paginaExiste: false });
    expect((await pedir(semPagina.env, 'salvar', { pergunta: 'Quando é a prova?', resposta: 'Em 22/11/2026.', fonte: 'https://x.com/a' })).status).toBe(400);
    expect((await pedir(montar().env, 'salvar', { pergunta: 'Quando é a prova?', resposta: 'curta', fonte: 'https://coperse.furg.br/e' })).status).toBe(400);
  });

  it('listar e desativar (desativar também limpa o cache)', async () => {
    const { env, lotes } = montar();
    const j = (await (await pedir(env, 'listar', {})).json()) as { oficiais: unknown[] };
    expect(j.oficiais).toHaveLength(1);
    expect((await pedir(env, 'desativar', { id: 1 })).status).toBe(200);
    expect(lotes[0]!.map((s) => s.sql)).toEqual(['UPDATE respostas_oficiais SET ativa = 0 WHERE id = ?', 'DELETE FROM respostas_cache']);
    expect((await pedir(env, 'desativar', { id: 'x' })).status).toBe(400);
  });
});
