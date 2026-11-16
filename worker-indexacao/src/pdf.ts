import { getDocumentProxy } from 'unpdf';

/**
 * Limites da leitura de PDF (M3 da revisão de segurança): um PDF de 15 MB com milhares de páginas
 * ou fluxos muito compactados não pode travar nem esgotar a memória do runner.
 */
export const LIMITES_PDF = {
  /** Páginas lidas; o resto é ignorado (editais reais têm menos de 100). */
  maxPaginas: 300,
  /** Caracteres de texto bruto; ao passar, a leitura para. */
  maxCaracteres: 2_000_000,
  /** Prazo total da leitura; ao estourar, o item vira erro e a fila segue. */
  prazoMs: 60_000,
};

type Limites = typeof LIMITES_PDF;

interface Pagina {
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
}
interface Documento {
  numPages: number;
  getPage(n: number): Promise<Pagina>;
  loadingTask?: { destroy(): Promise<void> };
}

// Mesma montagem do `extractText` do unpdf (mergePages), para o texto, e portanto o hash, não mudar.
async function textoDaPagina(doc: Documento, n: number): Promise<string> {
  const { items } = await (await doc.getPage(n)).getTextContent();
  return items.filter((i) => i.str != null).map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
}

async function lerPaginas(doc: Documento, lim: Limites, cancelado: () => boolean): Promise<{ junto: string; textos: string[] }> {
  const textos: string[] = [];
  let total = 0;
  const ultima = Math.min(doc.numPages, lim.maxPaginas);
  for (let n = 1; n <= ultima && total < lim.maxCaracteres && !cancelado(); n++) {
    const t = await textoDaPagina(doc, n);
    textos.push(t);
    total += t.length;
  }
  const junto = textos.join('\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return { junto: junto.slice(0, lim.maxCaracteres), textos };
}

/**
 * Onde cada página começa no texto final: procura, a partir do início da página anterior, a primeira linha
 * não vazia da página (com os mesmos espaços do texto final). Página sem texto começa onde a anterior começou.
 */
export function inicioDasPaginas(texto: string, paginas: string[]): number[] {
  const inicios: number[] = [];
  let cursor = 0;
  for (const p of paginas) {
    const linha = p
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0);
    const pos = linha ? texto.indexOf(linha.slice(0, 40), cursor) : -1;
    if (pos >= 0) cursor = pos;
    inicios.push(cursor);
  }
  return inicios;
}

export async function extrairPdf(
  bytes: Uint8Array,
  limites: Partial<Limites> = {},
  abrir: (b: Uint8Array) => Promise<Documento> = getDocumentProxy as unknown as (b: Uint8Array) => Promise<Documento>,
): Promise<{ texto: string; paginas: number; inicioPaginas: number[] }> {
  const lim = { ...LIMITES_PDF, ...limites };
  let doc: Documento | undefined;
  let estourou = false;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      estourou = true;
      rejeitar(new Error(`PDF inválido: leitura passou de ${Math.round(lim.prazoMs / 1000)} s`));
    }, lim.prazoMs);
  });
  const leitura = (async () => {
    doc = await abrir(bytes);
    const { junto: bruto, textos } = await lerPaginas(doc, lim, () => estourou);
    if (doc.numPages > lim.maxPaginas) console.error(`PDF com ${doc.numPages} páginas: lidas só ${lim.maxPaginas}`);
    return { bruto, paginas: doc.numPages, textos };
  })();
  try {
    const { bruto, paginas, textos } = await Promise.race([leitura, prazo]);
    const texto = bruto
      .split('\n')
      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { texto, paginas, inicioPaginas: inicioDasPaginas(texto, textos) };
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(msg.startsWith('PDF inválido') ? msg : `PDF inválido: ${msg}`);
  } finally {
    clearTimeout(relogio);
    leitura.catch(() => {});
    await doc?.loadingTask?.destroy().catch(() => {});
  }
}
