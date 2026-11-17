import type { Embedder } from '@chatbot/comum/tipos';

export interface Trecho {
  id: string;
  url: string;
  titulo: string;
  site: string;
  data: string;
  processo: string;
  ano: number | null;
  texto: string;
  similaridade: number;
  /** Página do PDF onde o trecho começa (null em HTML ou PDF indexado antes de 16/11/2026). */
  pagina?: number | null;
  /** 'cronograma': etapas e datas conferidas (cronograma.ts), não um trecho da página. */
  tipo?: 'cronograma';
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
const BONUS_PROCESSO = 0.02;
const MS_DIA = 86_400_000;
/**
 * Edição de dois anos atrás ou mais: perde mais do que a distância entre o 1º e o último colocado
 * da fusão, então só entra quando falta trecho de edição recente (ou a pergunta cita aquele ano).
 */
const PENALIDADE_EDICAO_ANTIGA = 0.04;
const BONUS_ANO_PERGUNTADO = 0.02;
/**
 * Portal furg.br (cursos, calendário, assistência estudantil): só desempata, ficando atrás das páginas
 * da COPERSE, do SiSU e do Vestibular em posição equivalente. Precisa ser pequena: a fusão inteira vai de
 * ~0,025 (1º nas duas listas) a ~0,012 (20º numa só); 0,01 tirava dos 8 trechos a página do curso que
 * era a 1ª da busca textual. A precedência nos processos fica com a regra 14 e com o bônus de processo.
 */
const SITES_SECUNDARIOS = new Set(['furg']);
const PENALIDADE_SECUNDARIO = 0.002;

/** Ano de edição citado na pergunta ("SiSU 2018", "nota de corte de 2020"), ou null. */
export function anoDaPergunta(pergunta: string): number | null {
  const m = /(?<!\d)(20[0-4]\d)(?!\d)/.exec(pergunta);
  return m ? Number(m[1]) : null;
}

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
  site?: string;
  ano: number | null;
  processo: string;
}

/** Fusão por posição (RRF) com bônus de recência. */
export function fundir(
  vetoriais: { id: string; similaridade: number }[],
  textuais: { id: string }[],
  meta: Map<string, MetaFusao>,
  agora: Date,
  processo?: string | null,
  anoPerguntado: number | null = null,
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
      if (m.ano !== null && m.ano >= anoAtual) bonus += 0.01;
      if (m.ano !== null && anoPerguntado !== null && m.ano === anoPerguntado) bonus += BONUS_ANO_PERGUNTADO;
      else if (m.ano !== null && anoPerguntado === null && m.ano < anoAtual - 1) bonus -= PENALIDADE_EDICAO_ANTIGA;
      if (processo && m.processo === processo) bonus += BONUS_PROCESSO;
      if (m.site && SITES_SECUNDARIOS.has(m.site)) bonus -= PENALIDADE_SECUNDARIO;
    }
    pont.set(id, p + bonus);
  }
  return [...pont].map(([id, pontuacao]) => ({ id, pontuacao })).sort((a, b) => b.pontuacao - a.pontuacao);
}

/**
 * Os `maximo` primeiros da fusão, garantindo o 1º da busca textual: com peso 0,5, ele sozinho
 * (~0,008) perde até para o 20º da vetorial (~0,012) e nunca entraria. É o caso de uma página que cita
 * literalmente o que foi perguntado ("semestres", "Medicina") e que a vetorial não pôs entre as 20.
 * Ele entra como um trecho a mais, sem tirar ninguém: tomar o lugar do 8º tirou a página do
 * vestibular.furg.br com o horário da prova (teste de 15/11).
 *
 * No máximo `MAX_POR_PAGINA` trechos de uma mesma página: a listagem de notícias do Vestibular no
 * coperse ocupava 4 dos 8 lugares com trechos parecidos e empurrava para o 8º a página do
 * vestibular.furg.br que era a 1ª da busca vetorial (diagnóstico de 15/11). Se faltar trecho de
 * outras páginas, os que passaram do limite completam a lista.
 *
 * `processoDe` (só quando a pergunta não diz o processo): no máximo `MAX_POR_PROCESSO` lugares por processo
 * seletivo, para "saiu o resultado?" trazer todos os processos que publicaram, e não só o mais buscado
 * (caso de 17/11: Vestibular, Transgêneros e EAD com o mesmo resultado). Páginas "geral" não contam.
 */
export function escolher(
  fundidos: { id: string }[],
  primeiroTextual: string | undefined,
  maximo: number,
  urlDe: (id: string) => string = (id) => id,
  processoDe?: (id: string) => string,
): string[] {
  const ids: string[] = [];
  const sobra: string[] = [];
  const porPagina = new Map<string, number>();
  const porProcesso = new Map<string, number>();
  for (const { id } of fundidos) {
    if (ids.length >= maximo) break;
    const n = porPagina.get(urlDe(id)) ?? 0;
    const proc = processoDe?.(id);
    const np = proc && proc !== 'geral' ? (porProcesso.get(proc) ?? 0) : 0;
    if (n >= MAX_POR_PAGINA || np >= MAX_POR_PROCESSO) {
      sobra.push(id);
      continue;
    }
    porPagina.set(urlDe(id), n + 1);
    if (proc && proc !== 'geral') porProcesso.set(proc, np + 1);
    ids.push(id);
  }
  ids.push(...sobra.slice(0, maximo - ids.length));
  if (primeiroTextual && !ids.includes(primeiroTextual)) ids.push(primeiroTextual);
  return ids;
}

interface LinhaTrecho {
  id: string;
  texto: string;
  url: string;
  titulo: string;
  site: string;
  data_publicacao: string;
  processo: string;
  ano: number | null;
  pagina: number | null;
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

/** Por que um trecho entrou ou não: posição em cada busca e nota final (só na página de teste). */
export interface LinhaDiagnostico {
  url: string;
  site: string;
  pontuacao: number;
  vetorial: number | null;
  similaridade: number | null;
  textual: number | null;
  escolhido: boolean;
}

const MAX_DIAGNOSTICO = 15;
const MAX_POR_PAGINA = 2;
const MAX_POR_PROCESSO = 4;

export async function buscarTrechos(
  pergunta: string,
  deps: DepsBusca,
  opcoes: { limiar: number; maximo?: number; processo?: string | null },
): Promise<{ trechos: Trecho[]; melhorSimilaridade: number; diagnostico?: LinhaDiagnostico[] }> {
  const maximo = opcoes.maximo ?? 8;
  const [vetor] = await deps.embedder.embed([pergunta], 'RETRIEVAL_QUERY');
  if (!vetor) throw new Error('embedding vazio');
  const [resp, textuais] = await Promise.all([
    deps.vectorize.query(vetor, { topK: TOP_K, returnMetadata: 'none' }),
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
      `SELECT t.id, t.texto, t.pagina, p.url, p.titulo, p.site, p.data_publicacao, p.processo, p.ano ` +
        `FROM trechos t JOIN paginas p ON p.url = t.url WHERE p.status = 'ok' AND t.id IN (${marcas})`,
    )
    .bind(...candidatos)
    .all<LinhaTrecho>();
  const linhas = new Map(r.results.map((l) => [l.id, l]));

  const meta = new Map<string, MetaFusao>();
  for (const [id, l] of linhas) meta.set(id, { data: l.data_publicacao, site: l.site, ano: l.ano, processo: l.processo });
  const simPorId = new Map(vetoriais.map((v) => [v.id, v.similaridade]));

  const textuaisValidos = textuais.filter((t) => linhas.has(t.id));
  const fundidos = fundir(
    vetoriais.filter((v) => v.similaridade >= opcoes.limiar && linhas.has(v.id)),
    textuaisValidos,
    meta,
    deps.agora(),
    opcoes.processo,
    anoDaPergunta(pergunta),
  );
  const trechos: Trecho[] = escolher(
    fundidos,
    textuaisValidos[0]?.id,
    maximo,
    (id) => linhas.get(id)!.url,
    opcoes.processo ? undefined : (id) => linhas.get(id)!.processo,
  ).map((id) => {
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
      ...(l.pagina ? { pagina: l.pagina } : {}),
    };
  });
  const escolhidos = new Set(trechos.map((t) => t.id));
  const posVet = new Map(vetoriais.map((v, i) => [v.id, i + 1]));
  const posTxt = new Map(textuaisValidos.map((t, i) => [t.id, i + 1]));
  const diagnostico = fundidos.slice(0, MAX_DIAGNOSTICO).map(({ id, pontuacao }) => ({
    url: linhas.get(id)!.url,
    site: linhas.get(id)!.site,
    pontuacao: Math.round(pontuacao * 10_000) / 10_000,
    vetorial: posVet.get(id) ?? null,
    similaridade: simPorId.has(id) ? Math.round(simPorId.get(id)! * 1000) / 1000 : null,
    textual: posTxt.get(id) ?? null,
    escolhido: escolhidos.has(id),
  }));
  return { trechos, melhorSimilaridade, diagnostico };
}
