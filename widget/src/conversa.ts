import type { Enviar, Mensagem } from './tipos';

export class ErroWidget extends Error {
  mensagem: string;
  constructor(mensagem: string) {
    super(mensagem);
    this.mensagem = mensagem;
  }
}

const MSG_REDE = 'Não consegui falar com o assistente. Verifique sua conexão e tente de novo.';

export function criarEnviar(api: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Enviar {
  return async (pergunta, historico) => {
    let resp: Response;
    let corpo: unknown;
    try {
      resp = await fetchFn(`${api}/perguntar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta, historico }),
      });
      corpo = await resp.json();
    } catch {
      throw new ErroWidget(MSG_REDE);
    }
    const c = (corpo ?? {}) as { erro?: unknown; resposta?: unknown; fontes?: unknown };
    if (!resp.ok) {
      throw new ErroWidget(typeof c.erro === 'string' && c.erro ? c.erro : MSG_REDE);
    }
    if (typeof c.resposta !== 'string') throw new ErroWidget(MSG_REDE);
    return { resposta: c.resposta, fontes: Array.isArray(c.fontes) ? c.fontes : [] };
  };
}

// Últimas 8 mensagens, em pares completos, começando por `usuario`.
export function historicoParaEnvio(trocas: Mensagem[]): Mensagem[] {
  const fim = trocas.slice(-8).map(({ papel, texto }) => ({ papel, texto }));
  return fim[0]?.papel === 'modelo' ? fim.slice(1) : fim;
}
