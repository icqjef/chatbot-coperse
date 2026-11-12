import { describe, it, expect } from 'vitest';
import { criarClienteCloudflare } from '../src/cloudflare.js';
import type { VetorTrecho } from '@chatbot/comum/tipos';

const cfg = { accountId: 'ACC', token: 'SEGREDO', databaseId: 'DB', indice: 'idx' };

type Chamada = { url: string; init: RequestInit };

function fetchFalso(resposta: unknown, chamadas: Chamada[]) {
  return (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify(resposta), { status: 200 });
  }) as unknown as typeof fetch;
}

const vetor = (id: string): VetorTrecho => ({
  id,
  values: [0.1, 0.2],
  metadata: { site: 's', url: 'u', titulo: 't', data: '2026-01-01', processo: 'geral', ano: 2026, trecho_id: id },
});

describe('cliente Cloudflare', () => {
  it('d1 envia Bearer e devolve results', async () => {
    const chamadas: Chamada[] = [];
    const cf = criarClienteCloudflare(cfg, fetchFalso({ success: true, errors: [], result: [{ results: [{ id: 'a' }] }] }, chamadas));
    const r = await cf.d1('SELECT id FROM trechos WHERE url=?', ['x']);
    expect(r).toEqual([{ id: 'a' }]);
    expect(chamadas[0]!.url).toBe('https://api.cloudflare.com/client/v4/accounts/ACC/d1/database/DB/query');
    expect((chamadas[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer SEGREDO');
    expect(JSON.parse(chamadas[0]!.init.body as string)).toEqual({ sql: 'SELECT id FROM trechos WHERE url=?', params: ['x'] });
  });

  it('upsertVetores envia uma linha NDJSON por vetor', async () => {
    const chamadas: Chamada[] = [];
    const cf = criarClienteCloudflare(cfg, fetchFalso({ success: true, errors: [], result: {} }, chamadas));
    await cf.upsertVetores([vetor('a'), vetor('b')]);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toContain('/vectorize/v2/indexes/idx/upsert');
    expect((chamadas[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('application/x-ndjson');
    const linhas = (chamadas[0]!.init.body as string).split('\n').filter(Boolean);
    expect(linhas).toHaveLength(2);
    expect(JSON.parse(linhas[0]!).id).toBe('a');
  });

  it('apagarVetores usa delete_by_ids', async () => {
    const chamadas: Chamada[] = [];
    const cf = criarClienteCloudflare(cfg, fetchFalso({ success: true, errors: [], result: {} }, chamadas));
    await cf.apagarVetores(['a']);
    expect(chamadas[0]!.url).toContain('/vectorize/v2/indexes/idx/delete_by_ids');
    expect(JSON.parse(chamadas[0]!.init.body as string)).toEqual({ ids: ['a'] });
  });

  it('success:false vira erro com a mensagem da API, sem o token', async () => {
    const cf = criarClienteCloudflare(cfg, fetchFalso({ success: false, errors: [{ code: 7003, message: 'banco inexistente' }], result: null }, []));
    const erro = await cf.d1("SELECT 1").catch((e) => e as Error) as Error;
    expect(erro.message).toContain('banco inexistente');
    expect(erro.message).not.toContain('SEGREDO');
  });

  describe('inserirLinhas', () => {
    const ok = { success: true, errors: [], result: [{ results: [] }] };
    const cols = ['id', 'url', 'ordem', 'texto'];
    const linhas = (n: number, texto = 'x') => Array.from({ length: n }, (_, i) => [`id${i}`, 'u', i, texto]);
    const corpo = (c: Chamada) => JSON.parse(c.init.body as string) as { sql: string; params: unknown[] };

    it('divide em lotes de até 20 linhas', async () => {
      const chamadas: Chamada[] = [];
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, chamadas));
      await cf.inserirLinhas('trechos', cols, linhas(45));
      expect(chamadas).toHaveLength(3);
      expect(chamadas.every((c) => c.url.endsWith('/d1/database/DB/query'))).toBe(true);
      expect(corpo(chamadas[0]!).sql).toBe('INSERT INTO trechos (id, url, ordem, texto) VALUES ' + Array(20).fill('(?, ?, ?, ?)').join(', '));
      expect(chamadas.map((c) => corpo(c).params.length)).toEqual([80, 80, 20]);
    });

    it('fecha o lote ao passar de 60000 caracteres', async () => {
      const chamadas: Chamada[] = [];
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, chamadas));
      await cf.inserirLinhas('trechos', cols, linhas(3, 'a'.repeat(25000)));
      expect(chamadas.map((c) => corpo(c).params.length)).toEqual([8, 4]);
    });

    it('com ignorarRepetidas usa INSERT OR IGNORE', async () => {
      const chamadas: Chamada[] = [];
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, chamadas));
      await cf.inserirLinhas('trechos', cols, linhas(1), { ignorarRepetidas: true });
      expect(corpo(chamadas[0]!).sql).toMatch(/^INSERT OR IGNORE INTO trechos /);
    });

    it('recusa lote acima de 100 parâmetros', async () => {
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, []));
      const colunas = Array.from({ length: 101 }, (_, i) => `c${i}`.replace(/\d/g, 'x'));
      await expect(cf.inserirLinhas('t', colunas, [Array(101).fill(1)])).rejects.toThrow(/100/);
    });

    it('sem linhas não chama a API', async () => {
      const chamadas: Chamada[] = [];
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, chamadas));
      await cf.inserirLinhas('trechos', cols, []);
      expect(chamadas).toHaveLength(0);
    });

    it('recusa nomes de tabela ou coluna inválidos', async () => {
      const cf = criarClienteCloudflare(cfg, fetchFalso(ok, []));
      await expect(cf.inserirLinhas('trechos; DROP', cols, linhas(1))).rejects.toThrow(/inválido/);
      await expect(cf.inserirLinhas('trechos', ['id', 'a b'], [[1, 2]])).rejects.toThrow(/inválido/);
    });
  });

  it('contarVetores lê vectorCount', async () => {
    const chamadas: Chamada[] = [];
    const cf = criarClienteCloudflare(cfg, fetchFalso({ success: true, errors: [], result: { vectorCount: 42, dimensions: 768 } }, chamadas));
    expect(await cf.contarVetores()).toBe(42);
    expect(chamadas[0]!.url).toBe('https://api.cloudflare.com/client/v4/accounts/ACC/vectorize/v2/indexes/idx/info');
    expect(chamadas[0]!.init.method).toBe('GET');
    expect(chamadas[0]!.init.body).toBeUndefined();
  });
});
