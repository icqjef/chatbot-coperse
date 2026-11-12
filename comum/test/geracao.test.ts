import { describe, it, expect, vi } from 'vitest';
import { criarGerador } from '../src/provedores/geracao';

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
    await expect(criarGerador(env, seg as any).gerar('s', msgs)).rejects.toThrow('Gemini não devolveu texto');
  });

  it('provedor desconhecido lança erro', () => {
    expect(() => criarGerador({ ...env, PROVEDOR_LLM: 'x' })).toThrow(/PROVEDOR_LLM/);
  });
});
