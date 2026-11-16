import { describe, it, expect, vi } from 'vitest';
import { criarGerador, RespostaBloqueada } from '../src/provedores/geracao';

const env = { PROVEDOR_LLM: 'gemini', GEMINI_API_KEY: 'SEGREDO123' };
const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
const texto = (t: string) => ok({ candidates: [{ content: { parts: [{ text: t }] }, finishReason: 'STOP' }] });
const msgs = [
  { papel: 'usuario' as const, texto: 'oi' },
  { papel: 'modelo' as const, texto: 'olá' },
  { papel: 'usuario' as const, texto: 'datas?' },
];

describe('criarGerador (Gemini)', () => {
  it('monta a requisição esperada', async () => {
    const f = vi.fn(async () => texto('ok'));
    const r = await criarGerador(env, f as any).gerar('SISTEMA', msgs);
    expect(r).toBe('ok');
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('SEGREDO123');
    const corpo = JSON.parse(init.body);
    expect(corpo.systemInstruction.parts[0].text).toBe('SISTEMA');
    expect(corpo.contents).toEqual([
      { role: 'user', parts: [{ text: 'oi' }] },
      { role: 'model', parts: [{ text: 'olá' }] },
      { role: 'user', parts: [{ text: 'datas?' }] },
    ]);
    expect(init.body).not.toMatch(/temperature|topP|topK|top_p|top_k/);
  });

  it('MODELO_RESPOSTA troca o modelo', async () => {
    const f = vi.fn(async () => texto('ok'));
    await criarGerador({ ...env, MODELO_RESPOSTA: 'gemini-x' }, f as any).gerar('s', msgs);
    expect((f.mock.calls[0] as any)[0]).toContain('/models/gemini-x:generateContent');
  });

  it('concatena partes e ignora thought', async () => {
    const f = async () =>
      ok({
        candidates: [
          { content: { parts: [{ text: 'pensando', thought: true }, { text: 'A' }, { text: 'B' }] } },
          { content: { parts: [{ text: 'outro' }] } },
        ],
      });
    expect(await criarGerador(env, f as any).gerar('s', msgs)).toBe('AB');
  });

  it('rejeita última mensagem do modelo sem chamar a API', async () => {
    const f = vi.fn();
    await expect(
      criarGerador(env, f as any).gerar('s', [{ papel: 'modelo', texto: 'x' }]),
    ).rejects.toThrow(/modelo/);
    expect(f).not.toHaveBeenCalled();
  });

  it('HTTP 429 mascara a chave e limita a 300 caracteres', async () => {
    const f = async () =>
      new Response(JSON.stringify({ error: { message: 'cota SEGREDO123 ' + 'x'.repeat(500) } }), { status: 429 });
    const e = (await criarGerador(env, f as any).gerar("s", msgs).catch((x) => x)) as Error;
    expect(e.message).toMatch(/^Falha na geração do Gemini: HTTP 429 — cota \[chave\] /);
    expect(e.message).not.toContain('SEGREDO123');
    expect(e.message.split(" — ")[1]!.length).toBeLessThanOrEqual(300);
  });

  it('sem candidato ou com SAFETY lança erro', async () => {
    await expect(criarGerador(env, (async () => ok({})) as any).gerar('s', msgs)).rejects.toThrow(
      'Gemini não devolveu texto',
    );
    const seg = async () => ok({ candidates: [{ finishReason: 'SAFETY' }] });
    await expect(criarGerador(env, seg as any).gerar('s', msgs)).rejects.toBeInstanceOf(RespostaBloqueada);
  });

  it('limita a saída a 1024 tokens', async () => {
    const f = vi.fn(async () => texto('ok'));
    await criarGerador(env, f as any).gerar('s', msgs);
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).generationConfig).toEqual({ maxOutputTokens: 1024 });
  });

  it('MAX_TOKENS com texto aceita o texto parcial', async () => {
    const f = async () => ok({ candidates: [{ content: { parts: [{ text: 'parcial [1]' }] }, finishReason: 'MAX_TOKENS' }] });
    expect(await criarGerador(env, f as any).gerar('s', msgs)).toBe('parcial [1]');
  });

  it('RECITATION e SAFETY lançam RespostaBloqueada', async () => {
    for (const finishReason of ['RECITATION', 'SAFETY']) {
      const f = async () => ok({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason }] });
      await expect(criarGerador(env, f as any).gerar('s', msgs)).rejects.toBeInstanceOf(RespostaBloqueada);
    }
  });

  it('provedor desconhecido lança erro', () => {
    expect(() => criarGerador({ ...env, PROVEDOR_LLM: 'x' })).toThrow(/PROVEDOR_LLM/);
  });

  describe('falhas passageiras', () => {
    const rapido = { esperar: async () => {} };
    const erro = (status: number) => new Response(JSON.stringify({ error: { message: 'x' } }), { status });
    const modeloDe = (f: any, i: number) => /models\/([^:]+):/.exec(f.mock.calls[i][0])![1];
    const envR = { ...env, MODELO_RESERVA: 'reserva-x' };

    it('503 repete no principal e responde', async () => {
      const f = vi.fn().mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(texto('ok'));
      expect(await criarGerador(envR, f as any, rapido).gerar('s', msgs)).toBe('ok');
      expect([modeloDe(f, 0), modeloDe(f, 1)]).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
    });

    it('duas falhas no principal vão para a reserva', async () => {
      const f = vi.fn().mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(texto('ok'));
      expect(await criarGerador(envR, f as any, rapido).gerar('s', msgs)).toBe('ok');
      expect(f).toHaveBeenCalledTimes(3);
      expect(modeloDe(f, 2)).toBe('reserva-x');
    });

    it('tempo esgotado vai direto para a reserva', async () => {
      const tempo = Object.assign(new Error('t'), { name: 'TimeoutError' });
      const f = vi.fn().mockRejectedValueOnce(tempo).mockResolvedValueOnce(texto('ok'));
      expect(await criarGerador(envR, f as any, rapido).gerar('s', msgs)).toBe('ok');
      expect(modeloDe(f, 1)).toBe('reserva-x');
    });

    it('sem reserva: no máximo duas chamadas e devolve o último erro', async () => {
      const f = vi.fn(async () => erro(500));
      await expect(criarGerador(env, f as any, rapido).gerar('s', msgs)).rejects.toThrow(/HTTP 500/);
      expect(f).toHaveBeenCalledTimes(2);
    });

    it('todas falham: três chamadas no máximo', async () => {
      const f = vi.fn(async () => erro(503));
      await expect(criarGerador(envR, f as any, rapido).gerar('s', msgs)).rejects.toThrow(/HTTP 503/);
      expect(f).toHaveBeenCalledTimes(3);
    });

    it('erro de cliente (400, 403) não repete', async () => {
      for (const st of [400, 403]) {
        const f = vi.fn(async () => erro(st));
        await expect(criarGerador(envR, f as any, rapido).gerar('s', msgs)).rejects.toThrow(`HTTP ${st}`);
        expect(f).toHaveBeenCalledTimes(1);
      }
    });

    it('RespostaBloqueada não repete', async () => {
      const f = vi.fn(async () => ok({ candidates: [{ finishReason: 'SAFETY' }] }));
      await expect(criarGerador(envR, f as any, rapido).gerar('s', msgs)).rejects.toBeInstanceOf(RespostaBloqueada);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it('prazo curto: não começa tentativa sem tempo e limita o tempo da chamada', async () => {
      const f = vi.fn(async () => erro(503));
      await expect(
        criarGerador(envR, f as any, rapido).gerar('s', msgs, { ate: Date.now() + 2500 }),
      ).rejects.toThrow(/HTTP 503/);
      expect(f).toHaveBeenCalledTimes(1);
      const g = vi.fn(async () => texto('ok'));
      await criarGerador(envR, g as any, rapido).gerar('s', msgs, { ate: Date.now() + 1000 }).catch(() => {});
      expect(g).not.toHaveBeenCalled();
    });

    it('envia sinal de tempo-limite', async () => {
      const f = vi.fn(async () => texto('ok'));
      await criarGerador(env, f as any).gerar('s', msgs);
      expect((f.mock.calls[0] as any)[1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('gerarAosPoucos (SSE)', () => {
    const rapido = { esperar: async () => {} };
    const sse = (...pedacos: unknown[]) => {
      const texto = pedacos.map((p) => `data: ${JSON.stringify(p)}\r\n\r\n`).join('');
      // Corta no meio de uma linha para testar a montagem dos pedaços.
      const meio = Math.floor(texto.length / 2);
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(texto.slice(0, meio)));
            c.enqueue(new TextEncoder().encode(texto.slice(meio)));
            c.close();
          },
        }),
        { status: 200 },
      );
    };
    const pedaco = (t: string, fim?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(fim ? { finishReason: fim } : {}) }] });

    it('junta os pedaços, avisa o acumulado e usa streamGenerateContent?alt=sse', async () => {
      const f = vi.fn(async () => sse(pedaco('O prazo '), pedaco('é 10/12 [1].'), pedaco('', 'STOP')));
      const vistos: string[] = [];
      const r = await criarGerador(env, f as any, rapido).gerarAosPoucos!('s', msgs, (a) => vistos.push(a));
      expect(r).toBe('O prazo é 10/12 [1].');
      expect(vistos).toEqual(['O prazo ', 'O prazo é 10/12 [1].']);
      expect((f.mock.calls[0] as any)[0]).toContain(':streamGenerateContent?alt=sse');
    });

    it('falha passageira antes do primeiro pedaço repete', async () => {
      const f = vi.fn()
        .mockResolvedValueOnce(new Response('{}', { status: 503 }))
        .mockResolvedValueOnce(sse(pedaco('ok [1].', 'STOP')));
      expect(await criarGerador(env, f as any, rapido).gerarAosPoucos!('s', msgs, () => {})).toBe('ok [1].');
      expect(f).toHaveBeenCalledTimes(2);
    });

    it('falha depois do primeiro pedaço não repete', async () => {
      let pedidos = 0;
      const quebrado = new Response(
        new ReadableStream({
          // 1º pedido entrega um pedaço; o 2º falha (pedaços na fila seriam descartados pelo erro).
          pull(c) {
            if (pedidos++ === 0) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(pedaco('O prazo '))}\n\n`));
            else c.error(Object.assign(new Error('t'), { name: 'TimeoutError' }));
          },
        }),
        { status: 200 },
      );
      const f = vi.fn(async () => quebrado);
      await expect(
        criarGerador({ ...env, MODELO_RESERVA: 'r' }, f as any, rapido).gerarAosPoucos!('s', msgs, () => {}),
      ).rejects.toThrow(/interrompeu/);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it('SAFETY no fim lança RespostaBloqueada', async () => {
      const f = vi.fn(async () => sse(pedaco('x'), { candidates: [{ finishReason: 'SAFETY' }] }));
      await expect(criarGerador(env, f as any, rapido).gerarAosPoucos!('s', msgs, () => {})).rejects.toBeInstanceOf(RespostaBloqueada);
    });
  });
});
