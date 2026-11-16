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
  opcoes: OpcoesTentativa = {},
): Gerador {
  if (env.PROVEDOR_LLM !== 'gemini') throw new Error(`PROVEDOR_LLM desconhecido: ${env.PROVEDOR_LLM}`);
  const principal = env.MODELO_RESPOSTA || 'gemini-3.5-flash-lite';
  const reserva = env.MODELO_RESERVA && env.MODELO_RESERVA !== principal ? env.MODELO_RESERVA : null;
  const tempoMs = opcoes.tempoMs ?? TEMPO_PADRAO_MS;
  const esperaMs = opcoes.esperaMs ?? ESPERA_PADRAO_MS;
  const esperar = opcoes.esperar ?? esperarPadrao;

  async function chamar(modelo: string, sistema: string, mensagens: Mensagem[], limiteMs: number): Promise<string> {
    const resp = await fetchFn(`${BASE}/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensagens.map((m) => ({
          role: m.papel === 'usuario' ? 'user' : 'model',
          parts: [{ text: m.texto }],
        })),
        generationConfig: { maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(limiteMs),
    });
    if (!resp.ok) {
      const bruto = ((await resp.json().catch(() => ({}))) as any)?.error?.message;
      const msg = typeof bruto === 'string' ? bruto.split(env.GEMINI_API_KEY).join('[chave]').slice(0, 300) : '';
      throw new ErroHttpProvedor(`Falha na geração do Gemini: HTTP ${resp.status}${msg ? ' — ' + msg : ''}`, resp.status);
    }
    const dados = (await resp.json()) as any;
    const cand = dados?.candidates?.[0];
    const partes: any[] = cand?.content?.parts ?? [];
    const texto = partes
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'RECITATION')
      throw new RespostaBloqueada(cand.finishReason);
    // MAX_TOKENS com texto: aceita o trecho parcial.
    if (!cand || !texto) throw new Error('Gemini não devolveu texto');
    return texto;
  }

  return {
    async gerar(sistema: string, mensagens: Mensagem[], opcoesGerar: OpcoesGerar = {}): Promise<string> {
      if (mensagens.length === 0 || mensagens.at(-1)?.papel === "modelo")
        throw new Error('A última mensagem deve ser do usuário (papel "modelo" é rejeitado pelo Gemini)');
      const ate = opcoesGerar.ate ?? Infinity;
      const restante = () => ate - Date.now();
      // Plano: principal; se a falha passageira foi rápida, principal de novo após espera curta;
      // depois a reserva (outra geração de modelo, outra capacidade). Tempo esgotado vai direto à reserva.
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
          const texto = await chamar(passo.modelo, sistema, mensagens, limiteMs);
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
    },
  };
}
