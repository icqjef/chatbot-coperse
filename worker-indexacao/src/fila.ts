import type { Site } from '@chatbot/comum/tipos';
import type { ClienteCloudflare } from './cloudflare.js';

const IGNORAR = /\.(css|js|png|jpe?g|gif|svg|ico|webp|zip|docx?|xlsx?|mp4)(\?|$)|\/_next\/|format=feed|\/login|\/area|[?&](start|limitstart|print|tmpl)=/i;
const PDF = /\.pdf(\?|$)|\/api\/documentos\/publico/i;

const HORA = 3600_000;
const JANELA_HTML_MS = 20 * HORA;
const JANELA_PDF_MS = 30 * 24 * HORA;
export const MAX_TENTATIVAS = 5;

export interface ItemFila {
  url: string;
  site: string;
  profundidade: number;
  origem: string | null;
  prioridade: number;
  tentativas: number;
  titulo: string | null;
  processo: string | null;
  ano: number | null;
  data: string | null;
  /** linkado por uma página lista: se for PDF, é tratado como lista (nunca baixado) */
  lista: boolean;
}

export type NovoItem = Omit<ItemFila, 'tentativas' | 'lista'> & { lista?: boolean };

export interface PaginaVista {
  dataVista: string;
  status: string;
  tipo: string;
  /** falhas seguidas (status 'erro'); ausente = 0 */
  falhas?: number;
}

export interface EstadoRastreio {
  paginas: Map<string, PaginaVista>;
  naFila: Set<string>;
  /** URLs marcadas como filhas de lista nesta execução (vale também para itens já carregados num lote de proximos) */
  listas: Set<string>;
}

/** URL canônica (chave de `fila` e `paginas`): absoluta http(s), sem fragmento, host minúsculo, caminho com %xx canônico. */
export function normalizarUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  // O parser já codifica (UTF-8) espaço e não ASCII e não mexe em %xx existentes; só falta o hex em maiúsculas.
  return u.href.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

export function deveIgnorar(url: string): boolean {
  return IGNORAR.test(url);
}

/** URL de edição antiga (casa com alguma expressão de `site.excluir`): não é indexada nem seguida. */
export function urlExcluida(url: string, site: Site): boolean {
  return (site.excluir ?? []).some((e) => new RegExp(e).test(url));
}

export function ehPdf(url: string): boolean {
  return PDF.test(url);
}

export async function carregarEstado(cf: ClienteCloudflare): Promise<EstadoRastreio> {
  const paginas = new Map<string, PaginaVista>();
  for (const l of await cf.d1('SELECT url, data_vista, status, tipo, falhas FROM paginas')) {
    paginas.set(String(l.url), {
      dataVista: String(l.data_vista ?? ''), status: String(l.status ?? ''), tipo: String(l.tipo ?? ''), falhas: Number(l.falhas ?? 0),
    });
  }
  const naFila = new Set((await cf.d1('SELECT url FROM fila')).map((l) => String(l.url)));
  return { paginas, naFila, listas: new Set() };
}

/**
 * Já visto dentro da janela de revisita? 'indexando' (execução interrompida) e 'erro' transitório sempre voltam;
 * 'ok', 'vazia' e 'removida' contam como vistas. 'erro' permanente (MAX_TENTATIVAS falhas seguidas, já saiu
 * da fila) usa a janela de 30 dias: tenta de novo uma vez por mês, não a cada revisita da página que o linka.
 */
function dentroDaJanela(url: string, vista: PaginaVista | undefined, agora: number): boolean {
  if (!vista || vista.status === 'indexando') return false;
  const permanente = vista.status === 'erro' && (vista.falhas ?? 0) >= MAX_TENTATIVAS;
  if (vista.status === 'erro' && !permanente) return false;
  const t = Date.parse(vista.dataVista);
  if (Number.isNaN(t)) return false;
  const pdf = permanente || ehPdf(url) || vista.tipo === 'pdf';
  return agora - t < (pdf ? JANELA_PDF_MS : JANELA_HTML_MS);
}

export async function enfileirar(
  cf: ClienteCloudflare,
  estado: EstadoRastreio,
  itens: NovoItem[],
  opts: { agora: string; forcar?: boolean },
): Promise<number> {
  const agora = Date.parse(opts.agora);
  const novos = new Map<string, NovoItem>();
  const elevar = new Map<string, number>();
  const marcarLista = new Set<string>();
  for (const bruto of itens) {
    const url = normalizarUrl(bruto.url)?.replace(/^http:/, 'https:'); // os chamadores só passam hosts permitidos
    if (!url) continue;
    if (bruto.lista) estado.listas.add(url);
    if (estado.naFila.has(url)) {
      if (opts.forcar) elevar.set(url, Math.max(elevar.get(url) ?? 0, bruto.prioridade));
      // já na fila por outra página: a marca de lista vale mesmo assim (privacidade)
      if (bruto.lista) marcarLista.add(url);
      continue;
    }
    const anterior = novos.get(url);
    if (anterior) {
      anterior.prioridade = Math.max(anterior.prioridade, bruto.prioridade);
      anterior.titulo ??= bruto.titulo;
      anterior.lista ||= bruto.lista;
      continue;
    }
    const vista = estado.paginas.get(url);
    // PDF já indexado com conteúdo e agora linkado por uma lista: volta à fila para virar só resumo.
    const reabrir = !!bruto.lista && vista?.status === 'ok' && vista.tipo === 'pdf';
    if (!opts.forcar && !reabrir && dentroDaJanela(url, vista, agora)) continue;
    novos.set(url, { ...bruto, url });
  }
  for (const [url, prioridade] of elevar) {
    await cf.d1('UPDATE fila SET prioridade = MAX(prioridade, ?) WHERE url = ?', [prioridade, url]);
  }
  for (const url of marcarLista) await cf.d1('UPDATE fila SET lista = 1 WHERE url = ?', [url]);
  if (novos.size === 0) return 0;
  const linhas = [...novos.values()].map((i) => [i.url, i.site, i.profundidade, i.origem, i.prioridade, i.titulo, i.processo, i.ano, i.data, i.lista ? 1 : 0]);
  await cf.inserirLinhas('fila', ['url', 'site', 'profundidade', 'origem', 'prioridade', 'titulo', 'processo', 'ano', 'data', 'lista'], linhas, { ignorarRepetidas: true });
  for (const url of novos.keys()) estado.naFila.add(url);
  return novos.size;
}

export async function proximos(cf: ClienteCloudflare, n: number, agora: string): Promise<ItemFila[]> {
  const linhas = await cf.d1(
    'SELECT url, site, profundidade, origem, prioridade, tentativas, titulo, processo, ano, data, lista FROM fila WHERE proxima_tentativa IS NULL OR proxima_tentativa <= ? ORDER BY prioridade DESC, profundidade ASC, rowid LIMIT ?',
    [agora, n],
  );
  return linhas.map((l) => ({
    url: String(l.url),
    site: String(l.site),
    profundidade: Number(l.profundidade ?? 0),
    origem: (l.origem as string | null) ?? null,
    prioridade: Number(l.prioridade ?? 0),
    tentativas: Number(l.tentativas ?? 0),
    titulo: (l.titulo as string | null) ?? null,
    processo: (l.processo as string | null) ?? null,
    ano: l.ano == null ? null : Number(l.ano),
    data: (l.data as string | null) ?? null,
    lista: Number(l.lista ?? 0) === 1,
  }));
}

export async function concluir(cf: ClienteCloudflare, estado: EstadoRastreio, url: string): Promise<void> {
  await cf.d1('DELETE FROM fila WHERE url = ?', [url]);
  estado.naFila.delete(url);
}

/** Falha transitória: tentativas+1 e nova tentativa em 2^tentativas horas; na 5ª tentativa o item sai da fila. */
export async function adiar(cf: ClienteCloudflare, estado: EstadoRastreio, item: ItemFila, agora: string): Promise<void> {
  const tentativas = item.tentativas + 1;
  if (tentativas >= MAX_TENTATIVAS) return concluir(cf, estado, item.url);
  const proxima = new Date(Date.parse(agora) + 2 ** tentativas * HORA).toISOString();
  await cf.d1('UPDATE fila SET tentativas = ?, proxima_tentativa = ? WHERE url = ?', [tentativas, proxima, item.url]);
}
