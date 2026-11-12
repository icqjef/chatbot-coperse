import { describe, it, expect } from 'vitest';
import { criarEmbedder } from '../src/provedores/embeddings';

const CHAVE = 'CHAVE-SECRETA-123';
const env = { PROVEDOR_LLM: 'gemini', GEMINI_API_KEY: CHAVE };

function fake(vetor = [3, 4], status = 200) {
  const chamadas: { url: string; init: RequestInit; corpo: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const corpo = JSON.parse(init.body as string);
    chamadas.push({ url, init, corpo });
    if (status !== 200) return new Response('erro', { status });
    return new Response(JSON.stringify({ embeddings: corpo.requests.map(() => ({ values: vetor })) }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe('criarEmbedder', () => {
  it('150 textos -> 2 chamadas (100 + 50) com taskType e dimensão', async () => {
    const { f, chamadas } = fake();
    const r = await criarEmbedder(env, f).embed(Array.from({ length: 150 }, (_, i) => `t${i}`), 'RETRIEVAL_DOCUMENT');
    expect(r).toHaveLength(150);
    expect(chamadas.map((c) => c.corpo.requests.length)).toEqual([100, 50]);
    const r0 = chamadas[0]!.corpo.requests[0];
    expect(r0.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(r0.outputDimensionality).toBe(768);
    expect(r0.model).toBe('models/gemini-embedding-001');
    expect(chamadas[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents');
  });
  it('chave no header, nunca na URL', async () => {
    const { f, chamadas } = fake();
    await criarEmbedder(env, f).embed(['a'], 'RETRIEVAL_QUERY');
    expect((chamadas[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe(CHAVE);
    expect(chamadas[0]!.url).not.toContain('key=');
    expect(chamadas[0]!.url).not.toContain(CHAVE);
  });
  it('normaliza para norma 1', async () => {
    const { f } = fake([3, 4]);
    const v = (await criarEmbedder(env, f).embed(['a'], 'RETRIEVAL_DOCUMENT'))[0]!;
    expect(v[0]!).toBeCloseTo(0.6);
    expect(v[1]!).toBeCloseTo(0.8);
  });
  it('vetor zero fica como está', async () => {
    const { f } = fake([0, 0]);
    const v = (await criarEmbedder(env, f).embed(['a'], 'RETRIEVAL_DOCUMENT'))[0]!;
    expect(v).toEqual([0, 0]);
  });
  it('429 -> erro com status e sem a chave', async () => {
    const { f } = fake([3, 4], 429);
    const p = criarEmbedder(env, f).embed(['a'], 'RETRIEVAL_DOCUMENT');
    await expect(p).rejects.toThrow(/429/);
    await expect(p).rejects.not.toThrow(CHAVE);
  });
  it('lista vazia não chama fetch', async () => {
    const { f, chamadas } = fake();
    expect(await criarEmbedder(env, f).embed([], 'RETRIEVAL_DOCUMENT')).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  it('provedor desconhecido -> erro', () => {
    expect(() => criarEmbedder({ ...env, PROVEDOR_LLM: 'x' })).toThrow(/x/);
  });
  it('usa modelo e dimensão do env', async () => {
    const { f, chamadas } = fake();
    await criarEmbedder({ ...env, MODELO_EMBEDDING: 'm2', DIMENSAO_EMBEDDING: '256' }, f).embed(['a'], 'RETRIEVAL_DOCUMENT');
    expect(chamadas[0]!.url).toContain('/models/m2:');
    expect(chamadas[0]!.corpo.requests[0].outputDimensionality).toBe(256);
  });
});
