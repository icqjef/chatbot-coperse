import { createHash } from 'node:crypto';
import type { Site, Embedder, VetorTrecho } from '@chatbot/comum/tipos';
import { dividirEmTrechos, prefixarTrecho } from '@chatbot/comum/trechos';
import type { ClienteCloudflare } from './cloudflare.js';
import { extrairPagina } from './extrair.js';

export type ResultadoIndexacao = 'nova' | 'alterada' | 'igual' | 'vazia' | 'erro';

export interface DepsIndexacao {
  cf: ClienteCloudflare;
  embedder: Embedder;
  buscarHtml(url: string): Promise<string>;
  agora(): string;
}

export function idTrecho(url: string, ordem: number): string {
  return `${createHash('sha1').update(url).digest('hex')}-${ordem}`;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const SQL_UPSERT_OK = `INSERT INTO paginas (url, site, titulo, data_publicacao, ano, data_vista, hash, status, falhas, erro)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  ON CONFLICT(url) DO UPDATE SET site=excluded.site, titulo=excluded.titulo, data_publicacao=excluded.data_publicacao,
    ano=excluded.ano, data_vista=excluded.data_vista, hash=excluded.hash, status=excluded.status, falhas=0, erro=NULL`;

const SQL_UPSERT_ERRO = `INSERT INTO paginas (url, site, titulo, data_publicacao, ano, data_vista, hash, status, falhas, erro)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(url) DO UPDATE SET titulo=excluded.titulo, data_vista=excluded.data_vista, status=excluded.status,
    falhas=paginas.falhas + 1, erro=excluded.erro`;

export async function indexarPagina(
  e: { site: Site; url: string; titulo: string; data: string },
  deps: DepsIndexacao,
): Promise<ResultadoIndexacao> {
  const { cf, embedder } = deps;
  const agora = deps.agora();
  const dataValida = e.data && !Number.isNaN(Date.parse(e.data)) ? e.data : agora;
  const ano = new Date(dataValida).getUTCFullYear();
  let titulo = e.titulo;

  try {
    const pagina = extrairPagina(await deps.buscarHtml(e.url));
    titulo = e.titulo || pagina.titulo;
    const gravar = (sql: string, hash: string | null, status: string, erro: string | null) =>
      cf.d1(sql, [e.url, e.site.id, titulo, dataValida, ano, agora, hash, status, erro]);

    const texto = pagina.texto.trim();
    if (!texto) {
      await gravar(SQL_UPSERT_OK, null, 'vazia', null);
      return 'vazia';
    }

    const hash = sha256(texto);
    const anterior = (await cf.d1('SELECT hash, status FROM paginas WHERE url = ?', [e.url]))[0];
    if (anterior && anterior.hash === hash && anterior.status === 'ok') {
      await cf.d1('UPDATE paginas SET data_vista = ? WHERE url = ?', [agora, e.url]);
      return 'igual';
    }

    // Primeiro calcula trechos e embeddings; só depois troca o que já existe.
    const trechos = dividirEmTrechos(texto);
    const prefixados = trechos.map((t) => prefixarTrecho(t, { titulo, data: dataValida, processo: 'geral', ano }));
    const valores = await embedder.embed(prefixados, 'RETRIEVAL_DOCUMENT');
    if (valores.length !== trechos.length) throw new Error('Embedder devolveu quantidade de vetores diferente da de trechos');

    const antigos = (await cf.d1('SELECT id FROM trechos WHERE url = ?', [e.url])).map((r) => r.id as string);
    if (antigos.length > 0) await cf.apagarVetores(antigos);
    await cf.d1('DELETE FROM trechos_fts WHERE trecho_id IN (SELECT id FROM trechos WHERE url = ?)', [e.url]);
    await cf.d1('DELETE FROM trechos WHERE url = ?', [e.url]);

    const vetores: VetorTrecho[] = trechos.map((_, i) => {
      const id = idTrecho(e.url, i);
      return {
        id,
        values: valores[i]!,
        metadata: { site: e.site.id, url: e.url, titulo, data: dataValida, processo: 'geral', ano, trecho_id: id },
      };
    });
    await cf.upsertVetores(vetores);

    // paginas antes de trechos: trechos.url referencia paginas(url).
    await gravar(SQL_UPSERT_OK, hash, 'ok', null);
    for (let i = 0; i < trechos.length; i++) {
      await cf.d1('INSERT INTO trechos (id, url, ordem, texto) VALUES (?, ?, ?, ?)', [vetores[i]!.id, e.url, i, trechos[i]]);
      await cf.d1('INSERT INTO trechos_fts (texto, trecho_id) VALUES (?, ?)', [trechos[i], vetores[i]!.id]);
    }
    return anterior ? 'alterada' : 'nova';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await cf.d1(SQL_UPSERT_ERRO, [e.url, e.site.id, titulo, dataValida, ano, agora, null, 'erro', msg]);
    } catch {
      // sem como registrar o erro; ainda assim não relança
    }
    return 'erro';
  }
}
