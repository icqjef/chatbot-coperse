import type { Embedder, TipoEmbedding } from '../tipos';
import { ErroHttpProvedor, esperarPadrao, passageiro, type OpcoesTentativa } from './tentativas';

export interface EnvEmbeddings {
  PROVEDOR_LLM: string;
  GEMINI_API_KEY: string;
  MODELO_EMBEDDING?: string;
  DIMENSAO_EMBEDDING?: string;
}

const LOTE = 100;
const TEMPO_PADRAO_MS = 30_000;
const ESPERA_PADRAO_MS = 600;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function normalizar(v: number[]): number[] {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norma === 0 ? v : v.map((x) => x / norma);
}

/** Chave recusada pelo provedor (401, 403 ou 400 "API key not valid"): repetir não adianta. */
export class ErroAutenticacaoProvedor extends Error {
  constructor(mensagem = 'Chave do Gemini recusada pelo provedor') {
    super(mensagem);
    this.name = 'ErroAutenticacaoProvedor';
  }
}

export function criarEmbedder(env: EnvEmbeddings, fetchFn: typeof fetch = fetch, opcoes: OpcoesTentativa = {}): Embedder {
  if (env.PROVEDOR_LLM !== 'gemini') throw new Error(`PROVEDOR_LLM desconhecido: ${env.PROVEDOR_LLM}`);
  const modelo = env.MODELO_EMBEDDING || 'gemini-embedding-001';
  const dimensao = Number(env.DIMENSAO_EMBEDDING || 768);
  if (!Number.isInteger(dimensao) || dimensao <= 0)
    throw new Error(`DIMENSAO_EMBEDDING inválida: ${env.DIMENSAO_EMBEDDING}`);
  const url = `${BASE}/${modelo}:batchEmbedContents`;
  const tempoMs = opcoes.tempoMs ?? TEMPO_PADRAO_MS;
  const esperaMs = opcoes.esperaMs ?? ESPERA_PADRAO_MS;
  const esperar = opcoes.esperar ?? esperarPadrao;

  // Uma nova tentativa, após espera curta, em falha passageira (429, 5xx, tempo esgotado, rede).
  // Não há modelo reserva: vetores de outro modelo não são comparáveis aos do índice.
  async function comNovaTentativa(lote: string[], tipo: TipoEmbedding): Promise<{ values: number[] }[] | undefined> {
    try {
      return await chamarLote(lote, tipo);
    } catch (e) {
      if (!passageiro(e)) throw e;
      await esperar(esperaMs);
      return chamarLote(lote, tipo);
    }
  }

  async function chamarLote(lote: string[], tipo: TipoEmbedding): Promise<{ values: number[] }[] | undefined> {
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
      signal: AbortSignal.timeout(tempoMs),
    });
    if (!resp.ok) {
      const bruto = ((await resp.json().catch(() => ({}))) as any)?.error?.message;
      const recusada =
        resp.status === 401 || resp.status === 403 ||
        (resp.status === 400 && typeof bruto === 'string' && /API key not valid|API_KEY_INVALID/.test(bruto));
      if (recusada) throw new ErroAutenticacaoProvedor(`Chave do Gemini recusada pelo provedor (HTTP ${resp.status})`);
      const msg = typeof bruto === 'string' ? bruto.split(env.GEMINI_API_KEY).join('[chave]').slice(0, 300) : '';
      throw new ErroHttpProvedor(`Falha nos embeddings do Gemini: HTTP ${resp.status}${msg ? ' — ' + msg : ''}`, resp.status);
    }
    const dados = (await resp.json()) as { embeddings?: { values: number[] }[] };
    return dados.embeddings;
  }

  return {
    async embed(textos: string[], tipo: TipoEmbedding): Promise<number[][]> {
      const saida: number[][] = [];
      for (let i = 0; i < textos.length; i += LOTE) {
        const lote = textos.slice(i, i + LOTE);
        const recebidos = await comNovaTentativa(lote, tipo);
        if (!recebidos || recebidos.length !== lote.length)
          throw new Error(
            `Resposta de embeddings inesperada: esperados ${lote.length} vetores, recebidos ${recebidos?.length ?? 0}`,
          );
        for (const e of recebidos) {
          const n = e.values?.length ?? 0;
          if (n !== dimensao)
            throw new Error(`Dimensão de embedding inesperada: esperada ${dimensao}, recebida ${n}`);
        }
        for (const e of recebidos) saida.push(normalizar(e.values));
      }
      return saida;
    },
  };
}
