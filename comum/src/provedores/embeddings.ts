import type { Embedder, TipoEmbedding } from '../tipos';

export interface EnvEmbeddings {
  PROVEDOR_LLM: string;
  GEMINI_API_KEY: string;
  MODELO_EMBEDDING?: string;
  DIMENSAO_EMBEDDING?: string;
}

const LOTE = 100;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function normalizar(v: number[]): number[] {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norma === 0 ? v : v.map((x) => x / norma);
}

export function criarEmbedder(env: EnvEmbeddings, fetchFn: typeof fetch = fetch): Embedder {
  if (env.PROVEDOR_LLM !== 'gemini') throw new Error(`PROVEDOR_LLM desconhecido: ${env.PROVEDOR_LLM}`);
  const modelo = env.MODELO_EMBEDDING || 'gemini-embedding-001';
  const dimensao = Number(env.DIMENSAO_EMBEDDING || 768);
  const url = `${BASE}/${modelo}:batchEmbedContents`;

  return {
    async embed(textos: string[], tipo: TipoEmbedding): Promise<number[][]> {
      const saida: number[][] = [];
      for (let i = 0; i < textos.length; i += LOTE) {
        const lote = textos.slice(i, i + LOTE);
        const resp = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            requests: lote.map((text) => ({
              model: `models/${modelo}`,
              content: { parts: [{ text }] },
              taskType: tipo,
              outputDimensionality: dimensao,
            })),
          }),
        });
        if (!resp.ok) throw new Error(`Falha nos embeddings do Gemini: HTTP ${resp.status}`);
        const dados = (await resp.json()) as { embeddings?: { values: number[] }[] };
        if (!dados.embeddings || dados.embeddings.length !== lote.length)
          throw new Error('Resposta de embeddings inesperada');
        for (const e of dados.embeddings) saida.push(normalizar(e.values));
      }
      return saida;
    },
  };
}
