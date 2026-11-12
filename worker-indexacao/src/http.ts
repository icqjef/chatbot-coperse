export class ErroHttp extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} ao buscar ${url}`);
    this.name = 'ErroHttp';
  }
}

export interface Resposta {
  tipo: 'html' | 'pdf' | 'outro';
  texto?: string;
  bytes?: Uint8Array;
  ultimaModificacao?: string;
}

const LIMITE_BYTES = 15 * 1024 * 1024;
const USER_AGENT = 'ChatbotCOPERSE-Indexador/0.1';

function dataIso(lm: string | null): string | undefined {
  const t = lm ? Date.parse(lm) : NaN;
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
const ERRO_TAMANHO = 'Arquivo maior que 15 MB';

async function lerCorpo(resp: Response): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  let total = 0;
  if (!resp.body) {
    const b = new Uint8Array(await resp.arrayBuffer());
    if (b.length > LIMITE_BYTES) throw new Error(ERRO_TAMANHO);
    return b;
  }
  const leitor = resp.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > LIMITE_BYTES) {
      await leitor.cancel();
      throw new Error(ERRO_TAMANHO);
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.length;
  }
  return bytes;
}

export function criarBuscar(fetchFn: typeof fetch = fetch): (url: string) => Promise<Resposta> {
  return async (url) => {
    const resp = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new ErroHttp(resp.status, url);
    const ct = (resp.headers.get('content-type') ?? '').toLowerCase();
    const incerto = !ct || ct.includes('octet-stream') || ct.includes('download');
    let tipo: Resposta['tipo'] = ct.includes('application/pdf')
      ? 'pdf'
      : incerto
        ? 'outro'
        : ct.includes('html') || ct.includes('xml') || ct.startsWith('text/')
          ? 'html'
          : 'outro';
    const ultimaModificacao = dataIso(resp.headers.get('last-modified'));
    if (tipo === 'outro' && !incerto) {
      await resp.body?.cancel();
      return { tipo, ultimaModificacao };
    }
    const declarado = Number(resp.headers.get('content-length'));
    if (declarado > LIMITE_BYTES) {
      await resp.body?.cancel();
      throw new Error(ERRO_TAMANHO);
    }
    const bytes = await lerCorpo(resp);
    if (incerto) {
      const ehPdf =
        /\.pdf(\?|$)/i.test(url) ||
        url.includes('/api/documentos/publico') ||
        (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
      if (!ehPdf) return { tipo: 'outro', ultimaModificacao };
      tipo = 'pdf';
    }
    if (tipo === 'pdf') return { tipo, bytes, ultimaModificacao };
    return { tipo, texto: new TextDecoder().decode(bytes), ultimaModificacao };
  };
}

/** HEAD: só os cabeçalhos (Last-Modified), sem baixar o corpo. Usado nas listas em PDF, que nunca são baixadas. */
export function criarCabecalho(fetchFn: typeof fetch = fetch): (url: string) => Promise<{ ultimaModificacao?: string }> {
  return async (url) => {
    const resp = await fetchFn(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new ErroHttp(resp.status, url);
    return { ultimaModificacao: dataIso(resp.headers.get('last-modified')) };
  };
}
