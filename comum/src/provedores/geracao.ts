export interface Mensagem {
  papel: 'usuario' | 'modelo';
  texto: string;
}

export interface Gerador {
  gerar(sistema: string, mensagens: Mensagem[]): Promise<string>;
}

export interface EnvGeracao {
  PROVEDOR_LLM: string;
  GEMINI_API_KEY: string;
  MODELO_RESPOSTA?: string;
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Sem temperature/topP/topK (obsoletos nos modelos novos). Sem thinkingConfig:
// o gemini-3.5-flash-lite já usa raciocínio "minimal" por padrão (aistudio.google.com/docs/thinking).
export function criarGerador(env: EnvGeracao, fetchFn: typeof fetch = fetch): Gerador {
  if (env.PROVEDOR_LLM !== 'gemini') throw new Error(`PROVEDOR_LLM desconhecido: ${env.PROVEDOR_LLM}`);
  const modelo = env.MODELO_RESPOSTA || 'gemini-3.5-flash-lite';
  const url = `${BASE}/${modelo}:generateContent`;

  return {
    async gerar(sistema: string, mensagens: Mensagem[]): Promise<string> {
      if (mensagens.length === 0 || mensagens.at(-1)?.papel === "modelo")
        throw new Error('A última mensagem deve ser do usuário (papel "modelo" é rejeitado pelo Gemini)');
      const resp = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: mensagens.map((m) => ({
            role: m.papel === 'usuario' ? 'user' : 'model',
            parts: [{ text: m.texto }],
          })),
        }),
      });
      if (!resp.ok) {
        const bruto = ((await resp.json().catch(() => ({}))) as any)?.error?.message;
        const msg = typeof bruto === 'string' ? bruto.split(env.GEMINI_API_KEY).join('[chave]').slice(0, 300) : '';
        throw new Error(`Falha na geração do Gemini: HTTP ${resp.status}${msg ? ' — ' + msg : ''}`);
      }
      const dados = (await resp.json()) as any;
      const cand = dados?.candidates?.[0];
      const partes: any[] = cand?.content?.parts ?? [];
      const texto = partes
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      if (!cand || cand.finishReason === 'SAFETY' || !texto) throw new Error('Gemini não devolveu texto');
      return texto;
    },
  };
}
