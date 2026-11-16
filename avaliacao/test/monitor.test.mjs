import { describe, it, expect, vi, afterEach } from 'vitest';
import { conferir } from '../monitor.mjs';

const agora = new Date().toISOString();
const saude = (extra = {}) => ({ ok: true, paginas_ok: 1000, fila: 0, ultima_indexacao: { inicio: agora, fim: agora }, ...extra });
const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status });

function falso(rotas) {
  return vi.fn(async (u) => {
    const caminho = new URL(u).pathname;
    const r = rotas[caminho];
    if (r instanceof Error) throw r;
    return r();
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('monitor', () => {
  it('tudo certo, com pergunta', async () => {
    vi.stubGlobal('fetch', falso({ '/saude': () => resp(200, saude()), '/perguntar': () => resp(200, { resposta: 'x', fontes: [{}] }) }));
    const r = await conferir({ pergunta: true });
    expect(r.problemas).toEqual([]);
  });

  it('sem pergunta não chama /perguntar', async () => {
    const f = falso({ '/saude': () => resp(200, saude()) });
    vi.stubGlobal('fetch', f);
    expect((await conferir({ pergunta: false })).problemas).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('indexação parada, índice pequeno e 503 na pergunta viram problemas', async () => {
    const velho = new Date(Date.now() - 13 * 3_600_000).toISOString();
    vi.stubGlobal('fetch', falso({
      '/saude': () => resp(200, saude({ paginas_ok: 10, ultima_indexacao: { inicio: velho, fim: velho } })),
      '/perguntar': () => resp(503, { erro: 'indisponível' }),
    }));
    const { problemas } = await conferir({ pergunta: true });
    expect(problemas).toHaveLength(3);
    expect(problemas.join(' ')).toMatch(/10 páginas.*12 h.*HTTP 503/s);
  });

  it('resposta sem fonte é problema; 429 não é', async () => {
    vi.stubGlobal('fetch', falso({ '/saude': () => resp(200, saude()), '/perguntar': () => resp(200, { resposta: 'x', fontes: [] }) }));
    expect((await conferir({ pergunta: true })).problemas[0]).toMatch(/sem fonte/);
    vi.stubGlobal('fetch', falso({ '/saude': () => resp(200, saude()), '/perguntar': () => resp(429, { erro: 'limite' }) }));
    expect((await conferir({ pergunta: true })).problemas).toEqual([]);
  });

  it('/saude fora do ar', async () => {
    vi.stubGlobal('fetch', falso({ '/saude': new TypeError('fetch failed') }));
    expect((await conferir({ pergunta: false })).problemas[0]).toMatch(/não respondeu: fetch failed/);
  });
});
