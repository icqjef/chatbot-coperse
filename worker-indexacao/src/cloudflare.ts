import type { VetorTrecho } from '@chatbot/comum/tipos';

export interface ClienteCloudflare {
  d1(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  upsertVetores(v: VetorTrecho[]): Promise<void>;
  apagarVetores(ids: string[]): Promise<void>;
}

export interface ConfigCloudflare {
  accountId: string;
  token: string;
  databaseId: string;
  indice: string;
}

const API = 'https://api.cloudflare.com/client/v4';
const LOTE_VETORES = 500;

export function criarClienteCloudflare(cfg: ConfigCloudflare, fetchFn: typeof fetch = fetch): ClienteCloudflare {
  const conta = `${API}/accounts/${cfg.accountId}`;

  async function chamar(url: string, contentType: string, body: string): Promise<any> {
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': contentType },
      body,
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

  return {
    async d1(sql, params = []) {
      const json = await chamar(
        `${conta}/d1/database/${cfg.databaseId}/query`,
        'application/json',
        JSON.stringify({ sql, params }),
      );
      return json.result?.[0]?.results ?? [];
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
