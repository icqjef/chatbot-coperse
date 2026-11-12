import { describe, it, expect } from 'vitest';
import { criarBuscar, ErroHttp } from '../src/http.js';

const fx = (corpo: ConstructorParameters<typeof Response>[0], headers: Record<string, string> = {}, status = 200) =>
  (async () => new Response(corpo, { status, headers })) as typeof fetch;

describe('criarBuscar', () => {
  it('envia User-Agent e devolve html', async () => {
    let ua = '';
    const f = (async (_u: any, init: any) => { ua = init.headers['User-Agent']; return new Response('<p>ok</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } }); }) as typeof fetch;
    const r = await criarBuscar(f)('https://x.furg.br');
    expect(r).toMatchObject({ tipo: 'html', texto: '<p>ok</p>' });
    expect(ua).toBe('ChatbotCOPERSE-Indexador/0.1');
  });
  it('pdf devolve bytes', async () => {
    const r = await criarBuscar(fx(new Uint8Array([37, 80, 68, 70]), { 'content-type': 'application/pdf' }))('https://x.furg.br/a.pdf');
    expect(r.tipo).toBe('pdf');
    expect(Array.from(r.bytes!)).toEqual([37, 80, 68, 70]);
  });
  it('outro tipo não lê o corpo', async () => {
    const r = await criarBuscar(fx('xx', { 'content-type': 'image/png' }))('https://x.furg.br/a.png');
    expect(r).toMatchObject({ tipo: 'outro' });
    expect(r.texto).toBeUndefined();
  });
  it('last-modified vira ISO', async () => {
    const r = await criarBuscar(fx('x', { 'content-type': 'text/html', 'last-modified': 'Wed, 01 Oct 2026 13:00:00 GMT' }))('https://x.furg.br');
    expect(r.ultimaModificacao).toBe('2026-10-01T13:00:00.000Z');
  });
  it('HTTP 404 lança ErroHttp com status', async () => {
    const p = criarBuscar(fx('no', {}, 404))('https://x.furg.br');
    await expect(p).rejects.toBeInstanceOf(ErroHttp);
    await expect(p).rejects.toMatchObject({ status: 404 });
  });
  it('content-length de 20 MB lança sem ler o corpo', async () => {
    const f = (async () => ({
      ok: true, status: 200,
      headers: new Headers({ 'content-type': 'application/pdf', 'content-length': String(20 * 1024 * 1024) }),
      arrayBuffer: async () => { throw new Error('leu o corpo'); },
      body: null,
    })) as unknown as typeof fetch;
    await expect(criarBuscar(f)('https://x.furg.br/a.pdf')).rejects.toThrow('maior que 15 MB');
  });
  it('corpo sem content-length acima de 15 MB lança', async () => {
    const pedaco = new Uint8Array(1024 * 1024);
    let n = 0;
    const corpo = new ReadableStream<Uint8Array>({ pull(c) { if (n++ < 17) c.enqueue(pedaco); else c.close(); } });
    await expect(criarBuscar(fx(corpo, { 'content-type': 'application/pdf' }))('https://x.furg.br/a.pdf')).rejects.toThrow('maior que 15 MB');
  });
});
