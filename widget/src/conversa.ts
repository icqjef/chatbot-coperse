import type { Avaliar, Enviar, Fonte, Mensagem, Resposta } from './tipos';

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

/**
 * Lê a resposta gradual (uma linha JSON por evento): {"parcial"} vai para `aoParcial`; devolve o {"fim"}.
 * {"erro"} vira ErroWidget com a mensagem do Worker. Sem `body` legível (navegador antigo), lê tudo de uma vez.
 */
async function lerGradual(resp: Response, aoParcial?: (texto: string) => void): Promise<unknown> {
  let fim: unknown;
  let erro: string | undefined;
  const tratar = (linha: string) => {
    if (!linha.trim()) return;
    const e = JSON.parse(linha) as Record<string, unknown>;
    if (typeof e.parcial === 'string') aoParcial?.(e.parcial);
    else if (typeof e.erro === 'string') erro = e.erro;
    else if (e.fim && typeof e.fim === 'object') fim = e.fim;
  };
  if (!resp.body) (await resp.text()).split('\n').forEach(tratar);
  else {
    const leitor = resp.body.getReader();
    const decodificador = new TextDecoder();
    let resto = '';
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      const linhas = resto.split('\n');
      resto = linhas.pop() ?? '';
      linhas.forEach(tratar);
    }
    tratar(resto + decodificador.decode());
  }
  if (erro) throw new ErroWidget(erro);
  return fim;
}

export function criarEnviar(api: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Enviar {
  return async (pergunta, historico, aoParcial) => {
    let resp: Response;
    let corpo: unknown;
    // AbortController + setTimeout: AbortSignal.timeout não existe no Safari < 16.
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    try {
      resp = await fetchFn(`${api}/perguntar`, {
        method: 'POST',
        // O Worker responde aos poucos (NDJSON) quando pode; erros e respostas prontas vêm em JSON.
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' },
        signal: controle.signal,
        body: JSON.stringify({ pergunta, historico }),
      });
      corpo = (resp.headers.get('content-type') ?? '').includes('application/x-ndjson')
        ? await lerGradual(resp, aoParcial)
        : await resp.json();
    } catch (e) {
      throw e instanceof ErroWidget ? e : new ErroWidget(MSG_REDE);
    } finally {
      clearTimeout(relogio);
    }
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (!resp.ok) {
      throw new ErroWidget(typeof c.erro === 'string' && c.erro ? c.erro : MSG_REDE);
    }
    if (typeof c.resposta !== 'string') throw new ErroWidget(MSG_REDE);
    const r: Resposta = { resposta: c.resposta, fontes: filtrarFontes(c.fontes) };
    if (typeof c.assinatura === 'string') r.assinatura = c.assinatura;
    const sugestoes = filtrarSugestoes(c.sugestoes);
    if (sugestoes.length) r.sugestoes = sugestoes;
    if (c.contato === true) r.contato = true;
    return r;
  };
}

/** Até 3 textos curtos: viram botões que enviam a pergunta. */
export function filtrarSugestoes(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 80).slice(0, 3);
}

/** Avaliação 👍/👎: falha de rede não incomoda a pessoa. */
export function criarAvaliar(api: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Avaliar {
  return async (dados) => {
    try {
      await fetchFn(`${api}/avaliar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(dados),
      });
    } catch {
      // sem avaliação; segue a conversa
    }
  };
}

// Últimas 8 mensagens, em pares completos, começando por `usuario`.
export function historicoParaEnvio(trocas: Mensagem[]): Mensagem[] {
  const fim = trocas.slice(-8).map(({ papel, texto, assinatura }): Mensagem => {
    const m: Mensagem = { papel, texto: texto.slice(0, MAX_TEXTO_HISTORICO) };
    return papel === 'modelo' && assinatura ? { ...m, assinatura } : m;
  });
  return fim[0]?.papel === 'modelo' ? fim.slice(1) : fim;
}
