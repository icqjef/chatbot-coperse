import { describe, expect, it, vi } from 'vitest';
import { criarEnviar, ErroWidget, historicoParaEnvio } from '../src/conversa';
import type { Mensagem } from '../src/tipos';

const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('criarEnviar', () => {
  it('200 devolve o objeto e o corpo enviado é {pergunta, historico}', async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { resposta: 'ok', fontes: [] }));
    const h: Mensagem[] = [
      { papel: 'usuario', texto: 'a' },
      { papel: 'modelo', texto: 'b' },
    ];
    expect(await criarEnviar('https://w', f)('oi', h)).toEqual({ resposta: 'ok', fontes: [] });
    expect(f.mock.calls[0]![0]).toBe('https://w/perguntar');
    expect(f.mock.calls[0]![1].method).toBe('POST');
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ pergunta: 'oi', historico: h });
  });
  it('429 lança com a mensagem do servidor', async () => {
    const f = vi.fn().mockResolvedValue(resp(429, { erro: 'Muitas perguntas, aguarde.' }));
    const e = await criarEnviar('https://w', f)('x', []).catch((x) => x);
    expect(e).toBeInstanceOf(ErroWidget);
    expect(e.mensagem).toBe('Muitas perguntas, aguarde.');
  });
  it('falha de rede lança a mensagem padrão', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fail'));
    const e = await criarEnviar('https://w', f)('x', []).catch((x) => x);
    expect(e.mensagem).toBe(
      'Não consegui falar com o assistente. Verifique sua conexão e tente de novo.',
    );
  });
  it('JSON inválido lança a mensagem padrão', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    const e = await criarEnviar('https://w', f)('x', []).catch((x) => x);
    expect(e.mensagem).toContain('Não consegui falar');
  });
});

describe('historicoParaEnvio', () => {
  it('12 mensagens devolvem as 8 últimas começando por usuario', () => {
    const t: Mensagem[] = Array.from({ length: 12 }, (_, i) => ({
      papel: i % 2 ? 'modelo' : 'usuario',
      texto: String(i),
    }));
    const h = historicoParaEnvio(t);
    expect(h).toHaveLength(8);
    expect(h[0]).toEqual({ papel: 'usuario', texto: '4' });
    expect(h[7]!.papel).toBe('modelo');
  });
});
