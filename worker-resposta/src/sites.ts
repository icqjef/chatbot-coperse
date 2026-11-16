/**
 * Processo seletivo do site e da página onde o widget está (checklist, item 6). O endereço e o título da página
 * só servem para deduzir o processo; não são guardados nem entram no prompt (só o nome fixo do processo entra).
 */
import { inferirProcesso, type RegrasClassificacao } from '@chatbot/comum/classificar';
import sitesJson from '../../config/sites.json';

const sites = sitesJson as { base: string; processo_padrao?: string; hosts_antigos?: string[] }[];
const semWww = (h: string) => h.replace(/^www\./, '');

/** Site com processo próprio (vestibular.furg.br, sisu.furg.br). */
export function processoDoSite(origem: string): string | undefined {
  try {
    const host = semWww(new URL(origem).hostname);
    return sites.find((s) => semWww(new URL(s.base).hostname) === host || s.hosts_antigos?.includes(host))?.processo_padrao;
  } catch {
    return undefined;
  }
}

const MAX_URL = 300;
const MAX_TITULO = 150;

/**
 * Processo da página atual: pelo caminho e pelo título ("/indigenas-ingresso-2027-1", "Vestibular FURG 2027") e,
 * se não der, pelo site. A página precisa ser do mesmo endereço que a origem do pedido.
 */
export function processoDaPagina(pagina: unknown, origem: string, regras: RegrasClassificacao): string | null {
  const doSite = processoDoSite(origem) ?? null;
  const p = pagina as { url?: unknown; titulo?: unknown } | null;
  if (!p || typeof p.url !== 'string' || p.url.length > MAX_URL) return doSite;
  let url: URL;
  try {
    url = new URL(p.url);
    if (url.origin !== new URL(origem).origin) return doSite;
  } catch {
    return doSite;
  }
  let caminho = url.pathname;
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    // fica o caminho como veio
  }
  const titulo = typeof p.titulo === 'string' ? p.titulo.slice(0, MAX_TITULO) : '';
  return inferirProcesso([`${caminho.replace(/[-_/]+/g, ' ')} ${titulo}`], regras) ?? doSite;
}
