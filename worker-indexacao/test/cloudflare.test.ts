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
});
