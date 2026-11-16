import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarEnviar, criarProximas, ErroWidget, historicoParaEnvio } from '../src/conversa';
import type { Mensagem } from '../src/tipos';

const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('criarEnviar', () => {
  const ndjson = (...linhas: unknown[]) => {
    const texto = linhas.map((l) => JSON.stringify(l) + '\n').join('');
    // Quebra no meio de uma linha para testar a montagem.
    const meio = Math.floor(texto.length / 2);
    const corpo = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(texto.slice(0, meio)));
        c.enqueue(new TextEncoder().encode(texto.slice(meio)));
        c.close();
      },
    });
    return new Response(corpo, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  };
  it('pede resposta gradual e passa as prévias; devolve o fim', async () => {
    const f = vi.fn().mockResolvedValue(
      ndjson({ parcial: 'O prazo [1].' }, { parcial: 'O prazo [1]. A taxa [1].' }, { fim: { resposta: 'Final [1].', fontes: [], assinatura: 'S' } }),
    );
    const vistos: string[] = [];
    const r = await criarEnviar('https://w', f)('oi', [], (t) => vistos.push(t));
    expect(f.mock.calls[0]![1].headers.accept).toContain('application/x-ndjson');
    expect(vistos).toEqual(['O prazo [1].', 'O prazo [1]. A taxa [1].']);
    expect(r).toEqual({ resposta: 'Final [1].', fontes: [], assinatura: 'S' });
  });
  it('{erro} na resposta gradual lança com a mensagem do servidor', async () => {
    const f = vi.fn().mockResolvedValue(ndjson({ parcial: 'x [1].' }, { erro: 'Indisponível agora.' }));
    const e = await criarEnviar('https://w', f)('oi', []).catch((x) => x);
    expect(e).toBeInstanceOf(ErroWidget);
    expect(e.mensagem).toBe('Indisponível agora.');
  });
  it('resposta gradual sem {fim} vira erro de rede', async () => {
    const f = vi.fn().mockResolvedValue(ndjson({ parcial: 'x [1].' }));
    const e = await criarEnviar('https://w', f)('oi', []).catch((x) => x);
    expect(e.mensagem).toMatch(/Não consegui falar/);
  });
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

describe('fontes do servidor', () => {
  it('descarta elementos inválidos', async () => {
    const ok = { titulo: 't', url: 'https://a', site: 's', data: '2026-01-01' };
    const f = vi
      .fn()
      .mockResolvedValue(resp(200, { resposta: 'r', fontes: [null, 3, { titulo: 1 }, ok] }));
    expect((await criarEnviar('https://w', f)('x', [])).fontes).toEqual([ok]);
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
  it('trunca cada texto a 2000 caracteres (limite do Worker)', () => {
    const h = historicoParaEnvio([
      { papel: 'usuario', texto: 'a' },
      { papel: 'modelo', texto: 'x'.repeat(3000) },
    ]);
    expect(h.map((m) => m.texto.length)).toEqual([1, 2000]);
  });
});

describe('tempo limite', () => {
  afterEach(() => vi.useRealTimers());
  it('fetch que nunca responde lança a mensagem padrão após 30 s', async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))),
        ),
    );
    const p = criarEnviar('https://w', f as unknown as typeof fetch)('x', []).catch((x) => x);
    await vi.advanceTimersByTimeAsync(30_000);
    const e = await p;
    expect(e).toBeInstanceOf(ErroWidget);
    expect(e.mensagem).toContain('Não consegui falar');
  });
});

describe('assinatura das respostas (M4)', () => {
  it('criarEnviar devolve a assinatura quando o servidor manda', async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { resposta: 'ok', fontes: [], assinatura: 'abc' }));
    expect(await criarEnviar('https://w', f)('oi', [])).toEqual({ resposta: 'ok', fontes: [], assinatura: 'abc' });
  });
  it('historicoParaEnvio reenvia a assinatura só nas falas do modelo', () => {
    const h = historicoParaEnvio([
      { papel: 'usuario', texto: 'a', assinatura: 'nao-vai' },
      { papel: 'modelo', texto: 'b', assinatura: 'sig' },
    ]);
    expect(h).toEqual([{ papel: 'usuario', texto: 'a' }, { papel: 'modelo', texto: 'b', assinatura: 'sig' }]);
  });
});

describe('próximas datas', () => {
  it('criarProximas faz GET /proximas e filtra o formato', async () => {
    const corpo = {
      processos: [
        { nome: 'Vestibular', ano: 2027, etapas: [{ etapa: 'Aplicação da prova', quando: '22/11/2026', fonte: { titulo: 'Cronograma', url: 'https://coperse.furg.br/c.pdf' } }, { etapa: 3 }] },
        { nome: 'Sem etapas', ano: 2027, etapas: [] },
        { nome: 7 },
      ],
    };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(corpo), { status: 200 }));
    const r = await criarProximas('https://w', f)();
    expect(f.mock.calls[0]![0]).toBe('https://w/proximas');
    expect(r).toEqual({ processos: [{ nome: 'Vestibular', ano: 2027, etapas: [corpo.processos[0]!.etapas![0]] }] });
  });
  it('erro do servidor vira ErroWidget com a mensagem', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ erro: 'Agora não.' }), { status: 503 }));
    const e = await criarProximas('https://w', f)().catch((x) => x);
    expect(e.mensagem).toBe('Agora não.');
  });
});

describe('filtrarAviso', () => {
  it('aceita só tipo conhecido e endereço http(s)', async () => {
    const { filtrarAviso } = await import('../src/conversa');
    const bom = { tipo: 'info', texto: 't', url: 'https://x/a.pdf', titulo: 'A' };
    expect(filtrarAviso(bom)).toEqual(bom);
    expect(filtrarAviso({ ...bom, url: 'javascript:alert(1)' })).toBeUndefined();
    expect(filtrarAviso({ ...bom, tipo: 'outro' })).toBeUndefined();
    expect(filtrarAviso(null)).toBeUndefined();
  });
});
