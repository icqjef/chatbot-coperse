import { ErroHttpProvedor, esperarPadrao, passageiro, tempoEsgotado, type OpcoesTentativa } from './tentativas';

export interface Mensagem {
  papel: 'usuario' | 'modelo';
  texto: string;
}

export interface OpcoesGerar {
  /** Momento (Date.now) a partir do qual não se começa nova tentativa nem se espera mais pelo provedor. */
  ate?: number;
}

export interface Gerador {
  gerar(sistema: string, mensagens: Mensagem[], opcoes?: OpcoesGerar): Promise<string>;
  /** Como `gerar`, chamando `aoReceber` com o texto acumulado a cada pedaço que chega. */
  gerarAosPoucos?(
    sistema: string,
    mensagens: Mensagem[],
    aoReceber: (acumulado: string) => void,
    opcoes?: OpcoesGerar,
  ): Promise<string>;
}

/** O provedor recusou a resposta (RECITATION/SAFETY): não é falha de serviço. */
export class RespostaBloqueada extends Error {
  constructor(motivo: string) {
    super(`Resposta bloqueada pelo provedor: ${motivo}`);
    this.name = 'RespostaBloqueada';
  }
}

export interface EnvGeracao {
  PROVEDOR_LLM: string;
  GEMINI_API_KEY: string;
  MODELO_RESPOSTA?: string;
  /** Modelo usado quando o principal falha de forma passageira duas vezes (ou esgota o tempo). */
  MODELO_RESERVA?: string;
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEMPO_PADRAO_MS = 12_000;
const ESPERA_PADRAO_MS = 600;
// Abaixo disso não vale começar uma tentativa: a resposta não chegaria a tempo.
const MINIMO_MS = 2_000;

// Sem temperature/topP/topK (obsoletos nos modelos novos). Sem thinkingConfig:
// o gemini-3.5-flash-lite já usa raciocínio "minimal" por padrão (aistudio.google.com/docs/thinking).
export function criarGerador(
  env: EnvGeracao,
  fetchFn: typeof fetch = fetch,
  opcoes: OpcoesTentativa & { maxTokens?: number } = {},
): Gerador {
  if (env.PROVEDOR_LLM !== 'gemini') throw new Error(`PROVEDOR_LLM desconhecido: ${env.PROVEDOR_LLM}`);
  const principal = env.MODELO_RESPOSTA || 'gemini-3.5-flash-lite';
  const reserva = env.MODELO_RESERVA && env.MODELO_RESERVA !== principal ? env.MODELO_RESERVA : null;
  const tempoMs = opcoes.tempoMs ?? TEMPO_PADRAO_MS;
  const esperaMs = opcoes.esperaMs ?? ESPERA_PADRAO_MS;
  const esperar = opcoes.esperar ?? esperarPadrao;

  function corpo(sistema: string, mensagens: Mensagem[]): string {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: mensagens.map((m) => ({
        role: m.papel === 'usuario' ? 'user' : 'model',
        parts: [{ text: m.texto }],
      })),
      generationConfig: { maxOutputTokens: opcoes.maxTokens ?? 1024 },
    });
  }

  async function pedir(url: string, sistema: string, mensagens: Mensagem[], limiteMs: number): Promise<Response> {
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: corpo(sistema, mensagens),
      signal: AbortSignal.timeout(limiteMs),
    });
    if (!resp.ok) {
      const bruto = ((await resp.json().catch(() => ({}))) as any)?.error?.message;
      const msg = typeof bruto === 'string' ? bruto.split(env.GEMINI_API_KEY).join('[chave]').slice(0, 300) : '';
      throw new ErroHttpProvedor(`Falha na geração do Gemini: HTTP ${resp.status}${msg ? ' — ' + msg : ''}`, resp.status);
    }
    return resp;
  }

  /** Texto (sem partes de raciocínio) e motivo de término de um pedaço da resposta do Gemini. */
  function lerCandidato(dados: any): { texto: string; fim?: string; existe: boolean } {
    const cand = dados?.candidates?.[0];
    const partes: any[] = cand?.content?.parts ?? [];
    const texto = partes
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    return { texto, fim: cand?.finishReason, existe: Boolean(cand) };
  }

  function conferir(texto: string, fim: string | undefined, existe: boolean): string {
    if (fim === 'SAFETY' || fim === 'RECITATION') throw new RespostaBloqueada(fim);
    // MAX_TOKENS com texto: aceita o trecho parcial.
    if (!existe || !texto) throw new Error('Gemini não devolveu texto');
    return texto;
  }

  async function chamar(modelo: string, sistema: string, mensagens: Mensagem[], limiteMs: number): Promise<string> {
    const resp = await pedir(`${BASE}/${modelo}:generateContent`, sistema, mensagens, limiteMs);
    const c = lerCandidato(await resp.json());
    return conferir(c.texto, c.fim, c.existe);
  }

  /**
   * Resposta em pedaços (Server-Sent Events). `aoReceber` recebe o texto acumulado a cada pedaço.
   * Falha depois do primeiro pedaço não é passageira: repetir mostraria o começo de novo à pessoa.
   */
  async function chamarAosPoucos(
    modelo: string,
    sistema: string,
    mensagens: Mensagem[],
    limiteMs: number,
    aoReceber: (acumulado: string) => void,
  ): Promise<string> {
    const resp = await pedir(`${BASE}/${modelo}:streamGenerateContent?alt=sse`, sistema, mensagens, limiteMs);
    if (!resp.body) throw new Error('Gemini não devolveu texto');
    const leitor = resp.body.pipeThrough(new TextDecoderStream()).getReader();
    let resto = '';
    let texto = '';
    let fim: string | undefined;
    let existe = false;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += value;
        let n: number;
        while ((n = resto.indexOf('\n')) >= 0) {
          const linha = resto.slice(0, n).trim();
          resto = resto.slice(n + 1);
          if (!linha.startsWith('data:')) continue;
          const c = lerCandidato(JSON.parse(linha.slice(5)));
          existe ||= c.existe;
          if (c.fim) fim = c.fim;
          if (c.texto) {
            texto += c.texto;
            aoReceber(texto);
          }
        }
      }
    } catch (e) {
      if (texto) throw new Error(`Gemini interrompeu a resposta: ${e instanceof Error ? e.name : 'erro'}`);
      throw e;
    }
    return conferir(texto, fim, existe);
  }

  // Plano: principal; se a falha passageira foi rápida, principal de novo após espera curta;
  // depois a reserva (outra geração de modelo, outra capacidade). Tempo esgotado vai direto à reserva.
  async function comTentativas(
    mensagens: Mensagem[],
    opcoesGerar: OpcoesGerar,
    chamarModelo: (modelo: string, limiteMs: number) => Promise<string>,
  ): Promise<string> {
    if (mensagens.length === 0 || mensagens.at(-1)?.papel === "modelo")
      throw new Error('A última mensagem deve ser do usuário (papel "modelo" é rejeitado pelo Gemini)');
    const ate = opcoesGerar.ate ?? Infinity;
    const restante = () => ate - Date.now();
    const plano: { modelo: string; espera: boolean }[] = [{ modelo: principal, espera: false }];
    let ultimoErro: unknown = new Error('Gemini: sem tempo para tentar');
    for (let i = 0; i < plano.length; i++) {
      const passo = plano[i]!;
      if (passo.espera) {
        if (restante() < esperaMs + MINIMO_MS) break;
        await esperar(esperaMs);
      }
      const limiteMs = Math.min(tempoMs, restante());
      if (limiteMs < MINIMO_MS) break;
      try {
        const texto = await chamarModelo(passo.modelo, limiteMs);
        if (passo.modelo !== principal) console.error(`Gemini: resposta pelo modelo reserva ${passo.modelo}`);
        return texto;
      } catch (e) {
        ultimoErro = e;
        if (!passageiro(e)) throw e;
        if (i === 0 && !tempoEsgotado(e)) plano.push({ modelo: principal, espera: true });
        if (i <= 1 && reserva && !plano.some((p) => p.modelo === reserva)) plano.push({ modelo: reserva, espera: false });
      }
    }
    throw ultimoErro;
  }

  return {
    gerar(sistema: string, mensagens: Mensagem[], opcoesGerar: OpcoesGerar = {}): Promise<string> {
      return comTentativas(mensagens, opcoesGerar, (modelo, limiteMs) => chamar(modelo, sistema, mensagens, limiteMs));
    },
    gerarAosPoucos(sistema, mensagens, aoReceber, opcoesGerar = {}) {
      return comTentativas(mensagens, opcoesGerar, (modelo, limiteMs) =>
        chamarAosPoucos(modelo, sistema, mensagens, limiteMs, aoReceber),
      );
    },
  };
}
