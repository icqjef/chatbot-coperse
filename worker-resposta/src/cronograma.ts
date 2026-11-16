/**
 * Cronograma conferido (checklist, item 1): etapas e datas extraídas pelo indexador e conferidas contra o
 * documento. Entra como trecho próprio nas perguntas sobre datas e alimenta o botão "Próximas datas".
 */
import { juntarVersoes, normalizarTexto, type FonteCronograma, type LinhaDatada } from '@chatbot/comum/cronograma';
import type { Trecho } from './busca';
import { cabecalhosCors, origemPermitida } from './cors';
import { diaSaoPaulo } from './limites';
import { aplicarLimite, json, type RateLimit } from './perguntar';

export const NOMES: Record<string, string> = {
  vestibular: 'Vestibular',
  sisu: 'SiSU',
  transgeneros: 'Processo Seletivo para Pessoas Transgênero',
  quilombolas: 'Processo Seletivo para Quilombolas',
  indigenas: 'Processo Seletivo para Indígenas',
  ead: 'Processo Seletivo EaD',
  'educacao-do-campo': 'Licenciatura em Educação do Campo',
  'vagas-complementares': 'Vagas Complementares',
  proprio: 'Processo Seletivo Próprio',
};

/** Pergunta sobre data ou prazo: o cronograma conferido entra como primeiro trecho. */
const PERGUNTA_DE_DATA = /\b(quando|data|datas|dia|dias|prazo|prazos|periodo|cronograma|calendario|ate que dia|que horas)\b/;

export function perguntaDeData(pergunta: string): boolean {
  return PERGUNTA_DE_DATA.test(normalizarTexto(pergunta));
}

interface LinhaBanco {
  url: string;
  etapa: string;
  quando: string;
  inicio: string | null;
  fim: string | null;
  titulo: string;
  site: string;
  data_publicacao: string;
  processo: string;
  ano: number;
}

export interface Edicao {
  processo: string;
  ano: number;
  itens: { linha: LinhaDatada; fonte: FonteCronograma }[];
}

/** Ano em Brasília: edições anteriores a ele não entram. */
const anoAtual = (agora: Date) => Number(diaSaoPaulo(agora).slice(0, 4));

/** Cronogramas das edições atuais (a mais recente de cada processo), já com as versões juntadas. */
export async function lerEdicoes(db: D1Database, agora: Date, processo?: string): Promise<Edicao[]> {
  const { results } = await db
    .prepare(
      `SELECT c.url, c.etapa, c.quando, c.inicio, c.fim, p.titulo, p.site, p.data_publicacao, p.processo, p.ano
       FROM cronograma c JOIN paginas p ON p.url = c.url
       WHERE p.status = 'ok' AND p.ano >= ?${processo ? ' AND p.processo = ?' : ''}
       ORDER BY c.url, c.ordem`,
    )
    .bind(...(processo ? [anoAtual(agora), processo] : [anoAtual(agora)]))
    .all<LinhaBanco>();
  const porProcesso = new Map<string, LinhaBanco[]>();
  for (const l of results) porProcesso.set(l.processo, [...(porProcesso.get(l.processo) ?? []), l]);
  const edicoes: Edicao[] = [];
  for (const [proc, linhas] of porProcesso) {
    const ano = Math.max(...linhas.map((l) => l.ano));
    const fontes = new Map<string, FonteCronograma>();
    for (const l of linhas.filter((x) => x.ano === ano)) {
      const f = fontes.get(l.url) ?? { url: l.url, titulo: l.titulo, site: l.site, data: l.data_publicacao, linhas: [] };
      f.linhas.push({ etapa: l.etapa, quando: l.quando, inicio: l.inicio, fim: l.fim });
      fontes.set(l.url, f);
    }
    edicoes.push({ processo: proc, ano, itens: juntarVersoes([...fontes.values()]) });
  }
  return edicoes;
}

/** Um trecho por documento de origem, uma etapa por linha, para o modelo citar com o número de sempre. */
export function trechosDoCronograma(e: Edicao): Trecho[] {
  const porFonte = new Map<string, { fonte: FonteCronograma; linhas: LinhaDatada[] }>();
  for (const { linha, fonte } of e.itens) {
    const g = porFonte.get(fonte.url) ?? { fonte, linhas: [] };
    g.linhas.push(linha);
    porFonte.set(fonte.url, g);
  }
  const nome = NOMES[e.processo] ?? e.processo;
  return [...porFonte.values()].map(({ fonte, linhas }) => ({
    id: `cronograma:${fonte.url}`,
    url: fonte.url,
    titulo: fonte.titulo,
    site: fonte.site,
    data: fonte.data,
    processo: e.processo,
    ano: e.ano,
    tipo: 'cronograma' as const,
    texto: `Cronograma do ${nome} ${e.ano} (etapas conferidas com o documento):\n${linhas.map((l) => `- ${l.etapa}: ${l.quando}`).join('\n')}`,
    similaridade: 1,
  }));
}

export async function cronogramaComoTrechos(db: D1Database, processo: string, agora: Date): Promise<Trecho[]> {
  const [e] = await lerEdicoes(db, agora, processo);
  return e ? trechosDoCronograma(e) : [];
}

const MAX_ETAPAS = 4;
const MAX_PROCESSOS = 3;

/** Próximas etapas (fim de hoje em diante) de cada processo, os mais próximos primeiro. */
export function proximasEtapas(edicoes: Edicao[], hoje: string) {
  // Ordem pelo fim: etapa em andamento (começou antes de hoje) vem antes da que ainda vai começar.
  const chave = (l: LinhaDatada) => `${l.fim}|${l.inicio ?? ''}`;
  return edicoes
    .map((e) => {
      const futuras = e.itens.filter(({ linha }) => linha.fim && linha.fim >= hoje).sort((a, b) => chave(a.linha).localeCompare(chave(b.linha)));
      return {
        processo: e.processo,
        nome: NOMES[e.processo] ?? e.processo,
        ano: e.ano,
        primeira: futuras[0] ? chave(futuras[0].linha) : '',
        etapas: futuras
          .slice(0, MAX_ETAPAS)
          .map(({ linha, fonte }) => ({ etapa: linha.etapa, quando: linha.quando, fonte: { titulo: fonte.titulo, url: fonte.url } })),
      };
    })
    .filter((p) => p.etapas.length > 0)
    .sort((a, b) => a.primeira.localeCompare(b.primeira))
    .slice(0, MAX_PROCESSOS)
    .map(({ primeira: _p, ...p }) => p);
}

/** GET /proximas: sem IA. No site de um processo só aquele processo; no da COPERSE, os mais próximos. */
export async function tratarProximas(
  req: Request,
  env: { DB: D1Database; LIMITADOR: RateLimit },
  origens: string[],
  processoDoSite: (origem: string) => string | undefined,
  agora = new Date(),
): Promise<Response> {
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);
  const negado = await aplicarLimite(req, env.LIMITADOR, cors);
  if (negado) return negado;
  try {
    const hoje = diaSaoPaulo(agora);
    const proc = processoDoSite(origem!);
    const edicoes = await lerEdicoes(env.DB, agora, proc);
    return json({ hoje, processos: proximasEtapas(edicoes, hoje) }, 200, cors);
  } catch {
    console.error('Falha ao ler o cronograma');
    return json({ erro: 'Não foi possível ler as datas agora. Tente de novo em instantes.' }, 503, cors);
  }
}
