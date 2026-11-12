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
      headers: { 'User-Agent': 'ChatbotCOPERSE-Indexador/0.1' },
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new ErroHttp(resp.status, url);
    const ct = (resp.headers.get('content-type') ?? '').toLowerCase();
    const tipo = ct.includes('application/pdf') ? 'pdf' : ct.includes('html') || ct.includes('xml') || ct.startsWith('text/') ? 'html' : 'outro';
    const lm = resp.headers.get('last-modified');
    const t = lm ? Date.parse(lm) : NaN;
    const ultimaModificacao = Number.isNaN(t) ? undefined : new Date(t).toISOString();
    if (tipo === 'outro') {
      await resp.body?.cancel();
      return { tipo, ultimaModificacao };
    }
    const declarado = Number(resp.headers.get('content-length'));
    if (declarado > LIMITE_BYTES) {
      await resp.body?.cancel();
      throw new Error(ERRO_TAMANHO);
    }
    const bytes = await lerCorpo(resp);
    if (tipo === 'pdf') return { tipo, bytes, ultimaModificacao };
    return { tipo, texto: new TextDecoder().decode(bytes), ultimaModificacao };
  };
}
