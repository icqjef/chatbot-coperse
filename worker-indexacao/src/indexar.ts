import { createHash } from 'node:crypto';
import type { Site, Embedder, VetorTrecho, Documento, TipoDocumento } from '@chatbot/comum/tipos';
import { dividirEmTrechos, prefixarTrecho } from '@chatbot/comum/trechos';
import type { ClienteCloudflare } from './cloudflare.js';

export type ResultadoIndexacao = 'nova' | 'alterada' | 'igual' | 'vazia' | 'erro' | 'teto';

export interface DepsIndexacao {
  cf: ClienteCloudflare;
  embedder: Embedder;
  agora(): string;
  /** limite de vetores no índice; ausente = sem limite */
  teto?: { restante(): number; consumir(n: number): void };
}

export interface EntradaErro {
  site: Site;
  url: string;
  titulo: string;
  data: string;
  tipo: TipoDocumento;
  processo: string;
  ano: number;
}

export function idTrecho(url: string, ordem: number): string {
  return `${createHash('sha1').update(url).digest('hex')}-${ordem}`;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** `data` null ou inválida: a frase da data é omitida (nunca "agora", senão o hash mudaria a cada revisita). */
export function resumoDeLista(titulo: string, data: string | null, url: string): string {
  const d = new Date(data ?? NaN);
  const dia = Number.isNaN(d.getTime())
    ? ''
    : ` Documento publicado em ${[String(d.getUTCDate()).padStart(2, '0'), String(d.getUTCMonth() + 1).padStart(2, '0'), d.getUTCFullYear()].join('/')}.`;
  return `${titulo}.${dia} Disponível em: ${url}. Este documento traz uma lista nominal; o assistente não reproduz o conteúdo, consulte o link.`;
}

const SQL_UPSERT_OK = `INSERT INTO paginas (url, site, titulo, tipo, processo, ano, data_publicacao, data_vista, hash, status, falhas, erro)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  ON CONFLICT(url) DO UPDATE SET site=excluded.site, titulo=excluded.titulo, tipo=excluded.tipo, processo=excluded.processo,
    ano=excluded.ano, data_publicacao=excluded.data_publicacao, data_vista=excluded.data_vista, hash=excluded.hash,
    status=excluded.status, falhas=0, erro=NULL`;

const SQL_UPSERT_ERRO = `INSERT INTO paginas (url, site, titulo, tipo, processo, ano, data_publicacao, data_vista, hash, status, falhas, erro)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(url) DO UPDATE SET titulo=COALESCE(NULLIF(excluded.titulo, ''), paginas.titulo), data_vista=excluded.data_vista, status=excluded.status,
    falhas=paginas.falhas + 1, erro=excluded.erro
  RETURNING falhas`;

const dataOuAgora = (data: string, agora: string) => (data && !Number.isNaN(Date.parse(data)) ? data : agora);

export async function registrarErro(e: EntradaErro, msg: string, deps: Pick<DepsIndexacao, 'cf' | 'agora'>): Promise<number> {
  const linhas = await deps.cf.d1(SQL_UPSERT_ERRO, [
    e.url, e.site.id, e.titulo, e.tipo, e.processo, e.ano, dataOuAgora(e.data, deps.agora()), deps.agora(), null, 'erro', msg,
  ]);
  return Number(linhas[0]?.falhas ?? 1);
}

export async function removerPagina(url: string, deps: Pick<DepsIndexacao, 'cf'>): Promise<void> {
  const { cf } = deps;
  const ids = (await cf.d1('SELECT id FROM trechos WHERE url = ?', [url])).map((r) => r.id as string);
  if (ids.length > 0) await cf.apagarVetores(ids);
  await cf.d1('DELETE FROM trechos_fts WHERE trecho_id IN (SELECT id FROM trechos WHERE url = ?)', [url]);
  await cf.d1('DELETE FROM trechos WHERE url = ?', [url]);
  await cf.d1("UPDATE paginas SET status = 'removida', hash = NULL WHERE url = ?", [url]);
}

export async function indexarDocumento(doc: Documento, deps: DepsIndexacao): Promise<ResultadoIndexacao> {
  const { cf, embedder, teto } = deps;
  const agora = deps.agora();
  const dataValida = dataOuAgora(doc.data, agora);
  const { url, titulo, processo, ano } = doc;

  try {
    const gravar = (hash: string | null, status: string) =>
      cf.d1(SQL_UPSERT_OK, [url, doc.site.id, titulo, doc.tipo, processo, ano, dataValida, agora, hash, status, null]);

    // Privacidade: lista nominal nunca é indexada; só o resumo, mesmo que o chamador passe o texto.
    const dataResumo = doc.dataDesconhecida || dataValida !== doc.data ? null : doc.data;
    const texto = (doc.tipo === 'lista' ? resumoDeLista(titulo, dataResumo, url) : doc.texto).trim();
    if (!texto) {
      await gravar(null, 'vazia');
      return 'vazia';
    }

    // Classificação e título entram no hash: mudar as regras ou o título força um novo embedding.
    const hash = sha256(JSON.stringify([doc.tipo, processo, ano, titulo, texto]));
    const anterior = (await cf.d1('SELECT hash, status FROM paginas WHERE url = ?', [url]))[0];
    if (anterior && anterior.hash === hash && anterior.status === 'ok') {
      await cf.d1('UPDATE paginas SET data_vista = ? WHERE url = ?', [agora, url]);
      return 'igual';
    }

    // Primeiro calcula trechos e embeddings; só depois troca o que já existe.
    const trechos = dividirEmTrechos(texto);
    const antigos = (await cf.d1('SELECT id FROM trechos WHERE url = ?', [url])).map((r) => r.id as string);
    const delta = trechos.length - antigos.length;
    if (teto && delta > teto.restante()) return 'teto';

    // Lista com data desconhecida: o prefixo do embedding também fica sem data.
    const dataPrefixo = doc.tipo === 'lista' ? (dataResumo ?? '') : dataValida;
    const prefixados = trechos.map((t) => prefixarTrecho(t, { titulo, data: dataPrefixo, processo, ano }));
    const valores = await embedder.embed(prefixados, 'RETRIEVAL_DOCUMENT');
    if (valores.length !== trechos.length) throw new Error('Embedder devolveu quantidade de vetores diferente da de trechos');

    // antes de qualquer remoção, e antes dos trechos (FK). Sem hash e com status 'indexando' até terminar,
    // para uma falha no meio nunca ser confundida com página 'igual'.
    await gravar(null, 'indexando');
    await cf.d1('DELETE FROM trechos_fts WHERE trecho_id IN (SELECT id FROM trechos WHERE url = ?)', [url]);
    await cf.d1('DELETE FROM trechos WHERE url = ?', [url]);

    const vetores: VetorTrecho[] = trechos.map((_, i) => {
      const id = idTrecho(url, i);
      return {
        id,
        values: valores[i]!,
        metadata: { site: doc.site.id, url, titulo, data: dataValida, processo, ano, trecho_id: id },
      };
    });
    await cf.upsertVetores(vetores);

    // Ids dependem só de url+ordem: apaga apenas os que sobraram, para não correr
    // contra o upsert (mutações do Vectorize são assíncronas e sem ordem garantida).
    const novos = new Set(vetores.map((v) => v.id));
    const obsoletos = antigos.filter((id) => !novos.has(id));
    if (obsoletos.length > 0) await cf.apagarVetores(obsoletos);

    await cf.inserirLinhas('trechos', ['id', 'url', 'ordem', 'texto'], trechos.map((t, i) => [vetores[i]!.id, url, i, t]));
    await cf.inserirLinhas('trechos_fts', ['texto', 'trecho_id'], trechos.map((t, i) => [t, vetores[i]!.id]));
    await cf.d1("UPDATE paginas SET hash = ?, status = 'ok' WHERE url = ?", [hash, url]);
    teto?.consumir(delta);
    return anterior ? 'alterada' : 'nova';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await registrarErro({ site: doc.site, url, titulo, data: dataValida, tipo: doc.tipo, processo, ano }, msg, deps);
    } catch {
      // sem como registrar o erro; ainda assim não relança
    }
    return 'erro';
  }
}
