import type { ClienteCloudflare } from '../src/cloudflare.js';
import type { VetorTrecho } from '@chatbot/comum/tipos';

type Linha = Record<string, unknown>;

/** cf em memória: interpreta apenas o SQL emitido por indexar.ts. */
export function criarCfFalso(inj: { insertTrechoN?: number; upsertErro?: boolean; vetores?: number } = {}) {
  let insertsTrecho = 0;
  const paginas = new Map<string, Linha>();
  let trechos: { id: string; url: string; ordem: number; texto: string }[] = [];
  let fts: { texto: string; trecho_id: string }[] = [];
  const registro = { upserts: [] as VetorTrecho[][], apagados: [] as string[][], deletes: 0, eventos: [] as string[], linhas: {} as Record<string, Record<string, unknown>[]> };

  const cf: ClienteCloudflare = {
    async d1(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT hash, status FROM paginas/i.test(s)) {
        const p = paginas.get(params[0] as string);
        return p ? [{ hash: p.hash, status: p.status }] : [];
      }
      if (/^SELECT id FROM trechos/i.test(s)) {
        return trechos.filter((t) => t.url === params[0]).map((t) => ({ id: t.id }));
      }
      if (/^UPDATE paginas SET data_vista/i.test(s)) {
        const p = paginas.get(params[1] as string)!;
        p.data_vista = params[0];
        return [];
      }
      if (/^UPDATE paginas SET hash/i.test(s)) {
        const p = paginas.get(params[1] as string)!;
        p.hash = params[0];
        p.status = 'ok';
        return [];
      }
      if (/^INSERT INTO paginas/i.test(s)) {
        if (inj.upsertErro && params[9] === 'erro') throw new Error('D1 fora do ar');
        // ordem dos parâmetros: url, site, titulo, tipo, processo, ano, data_publicacao, data_vista, hash, status, erro
        const [url, site, titulo, tipo, processo, ano, data_publicacao, data_vista, hash, status, erro] = params as any[];
        registro.eventos.push(`paginas:${status}`);
        const ant = paginas.get(url);
        const falhas = status === 'erro' ? (ant ? (ant.falhas as number) + 1 : 1) : 0;
        paginas.set(url, { url, site, titulo, tipo, processo, data_publicacao, ano, data_vista, hash: status === 'erro' ? (ant?.hash ?? null) : hash, status, falhas, erro });
        return [{ falhas }];
      }
      if (/^DELETE FROM trechos_fts/i.test(s)) {
        registro.eventos.push('delete');
        registro.deletes++;
        const ids = new Set(trechos.filter((t) => t.url === params[0]).map((t) => t.id));
        fts = fts.filter((f) => !ids.has(f.trecho_id));
        return [];
      }
      if (/^DELETE FROM trechos/i.test(s)) {
        registro.deletes++;
        trechos = trechos.filter((t) => t.url !== params[0]);
        return [];
      }
      if (/^UPDATE paginas SET status = 'removida'/i.test(s)) {
        const p = paginas.get(params[0] as string);
        if (p) p.status = 'removida';
        return [];
      }
      throw new Error(`SQL não previsto no fake: ${s}`);
    },
    async inserirLinhas(tabela, colunas, linhas, opcoes = {}) {
      for (const l of linhas) {
        const reg = Object.fromEntries(colunas.map((c, i) => [c, l[i]]));
        if (tabela === 'trechos') {
          if (!paginas.has(reg.url as string)) throw new Error('FOREIGN KEY constraint failed');
          if (inj.insertTrechoN !== undefined && ++insertsTrecho === inj.insertTrechoN) throw new Error('D1 indisponível');
          trechos.push(reg as any);
        } else if (tabela === 'trechos_fts') {
          fts.push(reg as any);
        } else {
          (registro.linhas[tabela] ??= []).push(reg);
        }
      }
      void opcoes;
    },
    async contarVetores() { return inj.vetores ?? 0; },
    async upsertVetores(v) { registro.upserts.push(v); },
    async apagarVetores(ids) { registro.apagados.push(ids); },
  };
  return { cf, paginas, registro, trechos: () => trechos, fts: () => fts };
}
