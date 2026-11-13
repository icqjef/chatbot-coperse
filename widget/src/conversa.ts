import type { Enviar, Fonte, Mensagem } from './tipos';

export class ErroWidget extends Error {
  mensagem: string;
  constructor(mensagem: string) {
    super(mensagem);
    this.mensagem = mensagem;
  }
}

const MSG_REDE = 'Não consegui falar com o assistente. Verifique sua conexão e tente de novo.';

// Mantém só objetos com titulo, url, site e data em texto.
export function filtrarFontes(x: unknown): Fonte[] {
  if (!Array.isArray(x)) return [];
  const campos = ['titulo', 'url', 'site', 'data'] as const;
  return x
    .filter((f) => f && typeof f === 'object' && campos.every((k) => typeof f[k] === 'string'))
    .map((f) => ({ titulo: f.titulo, url: f.url, site: f.site, data: f.data }));
}

const TEMPO_LIMITE_MS = 30_000;
// Espelha MAX_MENSAGEM de worker-resposta/src/perguntar.ts: acima disso o Worker responde 400.
const MAX_TEXTO_HISTORICO = 2000;

export function criarEnviar(api: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Enviar {
  return async (pergunta, historico) => {
    let resp: Response;
    let corpo: unknown;
    // AbortController + setTimeout: AbortSignal.timeout não existe no Safari < 16.
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    try {
      resp = await fetchFn(`${api}/perguntar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controle.signal,
        body: JSON.stringify({ pergunta, historico }),
      });
      corpo = await resp.json();
    } catch {
      throw new ErroWidget(MSG_REDE);
    } finally {
      clearTimeout(relogio);
    }
    const c = (corpo ?? {}) as { erro?: unknown; resposta?: unknown; fontes?: unknown };
    if (!resp.ok) {
      throw new ErroWidget(typeof c.erro === 'string' && c.erro ? c.erro : MSG_REDE);
    }
    if (typeof c.resposta !== 'string') throw new ErroWidget(MSG_REDE);
    return { resposta: c.resposta, fontes: filtrarFontes(c.fontes) };
  };
}

// Últimas 8 mensagens, em pares completos, começando por `usuario`.
export function historicoParaEnvio(trocas: Mensagem[]): Mensagem[] {
  const fim = trocas.slice(-8).map(({ papel, texto }) => ({ papel, texto: texto.slice(0, MAX_TEXTO_HISTORICO) }));
  return fim[0]?.papel === 'modelo' ? fim.slice(1) : fim;
}
