import type { Embedder } from '@chatbot/comum/tipos';

export interface Trecho {
  id: string;
  url: string;
  titulo: string;
  site: string;
  data: string;
  processo: string;
  ano: number;
  texto: string;
  similaridade: number;
}

export interface DepsBusca {
  embedder: Embedder;
  vectorize: VectorizeIndex;
  db: D1Database;
  agora: () => Date;
}

const K_RRF = 60;
const TOP_K = 20;
const MAX_TERMOS = 12;
const OPERADORES_FTS = new Set(['or', 'and', 'not', 'near']);
const PESO_VETORIAL = 1;
const PESO_TEXTUAL = 0.5;
const MS_DIA = 86_400_000;

/** Monta uma consulta FTS5 segura: termos entre aspas unidos por OR. */
export function consultaFts(pergunta: string): string | null {
  const vistos = new Set<string>();
  for (const t of pergunta.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (t.length < 3 || OPERADORES_FTS.has(t)) continue;
    vistos.add(t);
    if (vistos.size >= MAX_TERMOS) break;
  }
  if (vistos.size === 0) return null;
  return [...vistos].map((t) => `"${t}"`).join(' OR ');
}

export interface MetaFusao {
  data: string;
  ano: number;
  processo: string;
}

/** Fusão por posição (RRF) com bônus de recência. */
export function fundir(
  vetoriais: { id: string; similaridade: number }[],
  textuais: { id: string }[],
  meta: Map<string, MetaFusao>,
  agora: Date,
): { id: string; pontuacao: number }[] {
  const pont = new Map<string, number>();
  const somar = (lista: { id: string }[], peso: number) =>
    lista.forEach((it, i) => pont.set(it.id, (pont.get(it.id) ?? 0) + peso / (K_RRF + i + 1)));
  somar(vetoriais, PESO_VETORIAL);
  somar(textuais, PESO_TEXTUAL);
  const anoAtual = agora.getUTCFullYear();
  for (const [id, p] of pont) {
    const m = meta.get(id);
    let bonus = 0;
    if (m) {
      const t = Date.parse(m.data);
      if (!Number.isNaN(t)) {
        const dias = (agora.getTime() - t) / MS_DIA;
        bonus += 0.01 * Math.min(1, Math.max(0, 1 - dias / 365));
      }
      if (m.ano >= anoAtual) bonus += 0.01;
    }
    pont.set(id, p + bonus);
  }
  return [...pont].map(([id, pontuacao]) => ({ id, pontuacao })).sort((a, b) => b.pontuacao - a.pontuacao);
}

interface LinhaTrecho {
  id: string;
  texto: string;
  url: string;
  titulo: string;
  site: string;
  data_publicacao: string;
  processo: string;
  ano: number;
}

async function buscarFts(db: D1Database, pergunta: string): Promise<{ id: string }[]> {
  const consulta = consultaFts(pergunta);
  if (!consulta) return [];
  try {
    const r = await db
      .prepare(`SELECT trecho_id FROM trechos_fts WHERE trechos_fts MATCH ? ORDER BY bm25(trechos_fts) LIMIT ${TOP_K}`)
      .bind(consulta)
      .all<{ trecho_id: string }>();
    return r.results.map((l) => ({ id: l.trecho_id }));
  } catch {
    return [];
  }
}

export async function buscarTrechos(
  pergunta: string,
  deps: DepsBusca,
  opcoes: { limiar: number; maximo?: number },
): Promise<{ trechos: Trecho[]; melhorSimilaridade: number }> {
  const maximo = opcoes.maximo ?? 6;
  const [vetor] = await deps.embedder.embed([pergunta], 'RETRIEVAL_QUERY');
  if (!vetor) throw new Error('embedding vazio');
  const [resp, textuais] = await Promise.all([
    deps.vectorize.query(vetor, { topK: TOP_K, returnMetadata: 'all' }),
    buscarFts(deps.db, pergunta),
  ]);
  const vetoriais = resp.matches.map((m) => ({ id: m.id, similaridade: m.score }));
  const melhorSimilaridade = vetoriais.reduce((mx, v) => Math.max(mx, v.similaridade), 0);
  if (melhorSimilaridade < opcoes.limiar) return { trechos: [], melhorSimilaridade };

  const candidatos = [...new Set([...vetoriais.map((v) => v.id), ...textuais.map((t) => t.id)])];
  if (candidatos.length === 0) return { trechos: [], melhorSimilaridade };
  const marcas = candidatos.map(() => '?').join(',');
  const r = await deps.db
    .prepare(
      `SELECT t.id, t.texto, p.url, p.titulo, p.site, p.data_publicacao, p.processo, p.ano ` +
        `FROM trechos t JOIN paginas p ON p.url = t.url WHERE p.status = 'ok' AND t.id IN (${marcas})`,
    )
    .bind(...candidatos)
    .all<LinhaTrecho>();
  const linhas = new Map(r.results.map((l) => [l.id, l]));

  const meta = new Map<string, MetaFusao>();
  for (const [id, l] of linhas) meta.set(id, { data: l.data_publicacao, ano: l.ano, processo: l.processo });
  const simPorId = new Map(vetoriais.map((v) => [v.id, v.similaridade]));

  const fundidos = fundir(
    vetoriais.filter((v) => v.similaridade >= opcoes.limiar && linhas.has(v.id)),
    textuais.filter((t) => linhas.has(t.id)),
    meta,
    deps.agora(),
  );
  const trechos: Trecho[] = fundidos.slice(0, maximo).map(({ id }) => {
    const l = linhas.get(id)!;
    return {
      id,
      url: l.url,
      titulo: l.titulo,
      site: l.site,
      data: l.data_publicacao,
      processo: l.processo,
      ano: l.ano,
      texto: l.texto,
      similaridade: simPorId.get(id) ?? 0,
    };
  });
  return { trechos, melhorSimilaridade };
}
