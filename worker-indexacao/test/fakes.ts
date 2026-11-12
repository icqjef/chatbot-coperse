import type { ClienteCloudflare } from '../src/cloudflare.js';
import type { VetorTrecho } from '@chatbot/comum/tipos';

type Linha = Record<string, unknown>;

/** cf em memória: interpreta apenas o SQL emitido por indexar.ts. */
export function criarCfFalso(inj: { insertTrechoN?: number; upsertErro?: boolean; vetores?: number } = {}) {
  let insertsTrecho = 0;
  const paginas = new Map<string, Linha>();
  const fila = new Map<string, Linha>(); // ordem de inserção = rowid
  let trechos: { id: string; url: string; ordem: number; texto: string }[] = [];
  let fts: { texto: string; trecho_id: string }[] = [];
  const registro = { upserts: [] as VetorTrecho[][], apagados: [] as string[][], deletes: 0, eventos: [] as string[], linhas: {} as Record<string, Record<string, unknown>[]>, execucoes: [] as Linha[] };

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
        // erro sem título conhecido não apaga o título anterior (COALESCE(NULLIF(...)))
        const tit = status === 'erro' && !titulo ? (ant?.titulo ?? titulo) : titulo;
        paginas.set(url, { url, site, titulo: tit, tipo, processo, data_publicacao, ano, data_vista, hash: status === 'erro' ? (ant?.hash ?? null) : hash, status, falhas, erro });
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
      if (/^SELECT url, data_vista, status, tipo FROM paginas$/i.test(s)) {
        return [...paginas.values()].map((p) => ({ url: p.url, data_vista: p.data_vista, status: p.status, tipo: p.tipo }));
      }
      if (/^INSERT INTO execucoes \(inicio\) VALUES \(\?\) RETURNING id$/i.test(s)) {
        registro.execucoes.push({ id: registro.execucoes.length + 1, inicio: params[0] });
        return [{ id: registro.execucoes.length }];
      }
      if (/^UPDATE execucoes SET fim = \?, paginas = \?, erros = \? WHERE id = \?$/i.test(s)) {
        const e = registro.execucoes.find((x) => x.id === params[3]);
        if (e) Object.assign(e, { fim: params[0], paginas: params[1], erros: params[2] });
        return [];
      }
      if (/^SELECT COUNT\(\*\) AS n FROM fila$/i.test(s)) return [{ n: fila.size }];
      if (/^SELECT url FROM fila$/i.test(s)) return [...fila.keys()].map((url) => ({ url }));
      if (/^SELECT .* FROM fila WHERE proxima_tentativa IS NULL OR proxima_tentativa <= \? ORDER BY prioridade DESC, profundidade ASC, rowid LIMIT \?$/i.test(s)) {
        const [agora, n] = params as [string, number];
        return [...fila.values()]
          .map((l, rowid) => ({ l, rowid }))
          .filter(({ l }) => l.proxima_tentativa == null || (l.proxima_tentativa as string) <= agora)
          .sort((a, b) => (b.l.prioridade as number) - (a.l.prioridade as number) || (a.l.profundidade as number) - (b.l.profundidade as number) || a.rowid - b.rowid)
          .slice(0, n)
          .map(({ l }) => ({ ...l }));
      }
      if (/^UPDATE fila SET prioridade = MAX\(prioridade, \?\) WHERE url = \?$/i.test(s)) {
        const l = fila.get(params[1] as string);
        if (l) l.prioridade = Math.max(l.prioridade as number, params[0] as number);
        return [];
      }
      if (/^UPDATE fila SET titulo = \?, data = \?, prioridade = MAX\(prioridade, \?\) WHERE url = \?$/i.test(s)) {
        const l = fila.get(params[3] as string);
        if (l) Object.assign(l, { titulo: params[0], data: params[1], prioridade: Math.max(l.prioridade as number, params[2] as number) });
        return [];
      }
      if (/^UPDATE fila SET tentativas = \?, proxima_tentativa = \? WHERE url = \?$/i.test(s)) {
        const l = fila.get(params[2] as string);
        if (l) {
          l.tentativas = params[0];
          l.proxima_tentativa = params[1];
        }
        return [];
      }
      if (/^DELETE FROM fila WHERE url = \?$/i.test(s)) {
        fila.delete(params[0] as string);
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
        } else if (tabela === 'fila') {
          // chave primária url: OR IGNORE descarta repetidas; sem ele, falha como o SQLite
          if (fila.has(reg.url as string)) {
            if (opcoes.ignorarRepetidas) continue;
            throw new Error('UNIQUE constraint failed: fila.url');
          }
          fila.set(reg.url as string, { tentativas: 0, prioridade: 0, profundidade: 0, proxima_tentativa: null, ...reg });
        } else {
          (registro.linhas[tabela] ??= []).push(reg);
        }
      }
    },
    async contarVetores() { return inj.vetores ?? 0; },
    async upsertVetores(v) { registro.upserts.push(v); },
    async apagarVetores(ids) { registro.apagados.push(ids); },
  };
  return { cf, paginas, fila, registro, trechos: () => trechos, fts: () => fts };
}
