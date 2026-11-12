import type { VetorTrecho } from '@chatbot/comum/tipos';

export interface ClienteCloudflare {
  d1(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  upsertVetores(v: VetorTrecho[]): Promise<void>;
  apagarVetores(ids: string[]): Promise<void>;
  inserirLinhas(tabela: string, colunas: string[], linhas: unknown[][], opcoes?: { ignorarRepetidas?: boolean }): Promise<void>;
  contarVetores(): Promise<number>;
}

export interface ConfigCloudflare {
  accountId: string;
  token: string;
  databaseId: string;
  indice: string;
}

const API = 'https://api.cloudflare.com/client/v4';
const LOTE_VETORES = 500;
const MAX_PARAMS_D1 = 100;
const MAX_LINHAS_LOTE = 20;
const MAX_CARACTERES_LOTE = 60000;
const NOME_SQL = /^[a-z_]+$/;

export function criarClienteCloudflare(cfg: ConfigCloudflare, fetchFn: typeof fetch = fetch): ClienteCloudflare {
  const conta = `${API}/accounts/${cfg.accountId}`;

  async function chamar(url: string, contentType: string, body?: string): Promise<any> {
    const resp = await fetchFn(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': contentType },
      ...(body === undefined ? {} : { body }),
    });
    let json: any;
    try {
      json = await resp.json();
    } catch {
      throw new Error(`Cloudflare respondeu HTTP ${resp.status} sem JSON válido`);
    }
    if (!resp.ok || !json?.success) {
      const msgs = (json?.errors ?? []).map((e: any) => e?.message).filter(Boolean).join('; ');
      throw new Error(`Cloudflare API (HTTP ${resp.status}): ${msgs || 'erro desconhecido'}`);
    }
    return json;
  }

  async function d1(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const json = await chamar(`${conta}/d1/database/${cfg.databaseId}/query`, 'application/json', JSON.stringify({ sql, params }));
    return json.result?.[0]?.results ?? [];
  }

  return {
    async d1(sql, params = []) {
      const json = await chamar(
        `${conta}/d1/database/${cfg.databaseId}/query`,
        'application/json',
        JSON.stringify({ sql, params }),
      );
      return json.result?.[0]?.results ?? [];
    },
    async inserirLinhas(tabela, colunas, linhas, opcoes = {}) {
      if (![tabela, ...colunas].every((n) => NOME_SQL.test(n))) throw new Error('Nome de tabela ou coluna inválido');
      if (linhas.length === 0) return;
      if (colunas.length > MAX_PARAMS_D1) throw new Error(`Mais de ${MAX_PARAMS_D1} parâmetros por linha`);
      const prefixo = `INSERT ${opcoes.ignorarRepetidas ? 'OR IGNORE ' : ''}INTO ${tabela} (${colunas.join(', ')}) VALUES `;
      const grupo = `(${colunas.map(() => '?').join(', ')})`;
      const enviar = (lote: unknown[][]) => d1(prefixo + lote.map(() => grupo).join(', '), lote.flat());
      let lote: unknown[][] = [];
      let tamanho = 0;
      for (const linha of linhas) {
        const t = linha.reduce<number>((soma, v) => soma + String(v).length, 0);
        if (lote.length > 0 && (lote.length >= MAX_LINHAS_LOTE || (lote.length + 1) * colunas.length > MAX_PARAMS_D1 || tamanho + t > MAX_CARACTERES_LOTE)) {
          await enviar(lote);
          lote = [];
          tamanho = 0;
        }
        lote.push(linha);
        tamanho += t;
      }
      await enviar(lote);
    },
    async contarVetores() {
      const json = await chamar(`${conta}/vectorize/v2/indexes/${cfg.indice}/info`, 'application/json');
      return Number(json.result?.vectorCount ?? 0);
    },
    async upsertVetores(vetores) {
      for (let i = 0; i < vetores.length; i += LOTE_VETORES) {
        const corpo = vetores
          .slice(i, i + LOTE_VETORES)
          .map((v) => JSON.stringify({ id: v.id, values: v.values, metadata: v.metadata }))
          .join('\n');
        await chamar(`${conta}/vectorize/v2/indexes/${cfg.indice}/upsert`, 'application/x-ndjson', corpo);
      }
    },
    async apagarVetores(ids) {
      if (ids.length === 0) return;
      await chamar(`${conta}/vectorize/v2/indexes/${cfg.indice}/delete_by_ids`, 'application/json', JSON.stringify({ ids }));
    },
  };
}
