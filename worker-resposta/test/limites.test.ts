import { describe, expect, it } from 'vitest';
import { Contadores, consumirCota, criarLimites, diaSaoPaulo, Limites } from '../src/limites';

function armazemFalso() {
  const m = new Map<string, unknown>();
  return {
    m,
    async get<T>(k: string) {
      return m.get(k) as T | undefined;
    },
    async put<T>(k: string, v: T) {
      m.set(k, v);
    },
  };
}

describe('Contadores.visitante', () => {
  it('libera 6 por minuto e barra a 7ª, exatamente', () => {
    const c = new Contadores();
    const t = 1_000_000;
    const r = Array.from({ length: 7 }, (_, i) => c.visitante('a', 6, t + i));
    expect(r).toEqual([true, true, true, true, true, true, false]);
  });
  it('a janela renova depois de 60 s', () => {
    const c = new Contadores();
    for (let i = 0; i < 6; i++) c.visitante('a', 6, 0);
    expect(c.visitante('a', 6, 59_999)).toBe(false);
    expect(c.visitante('a', 6, 60_000)).toBe(true);
  });
  it('visitantes diferentes não dividem a contagem', () => {
    const c = new Contadores();
    for (let i = 0; i < 6; i++) c.visitante('a', 6, 0);
    expect(c.visitante('a', 6, 1)).toBe(false);
    expect(c.visitante('b', 6, 1)).toBe(true);
  });
});

describe('Contadores.diario', () => {
  it('libera 40 no dia e barra a 41ª; no dia seguinte volta a liberar', () => {
    const c = new Contadores();
    const r = Array.from({ length: 41 }, () => c.diario('a', 40, '2026-11-14'));
    expect(r.filter(Boolean)).toHaveLength(40);
    expect(r[40]).toBe(false);
    expect(c.diario('b', 40, '2026-11-14')).toBe(true);
    expect(c.diario('a', 40, '2026-11-15')).toBe(true);
  });
  it('descarta chaves de dias anteriores quando o mapa cresce', () => {
    const c = new Contadores();
    for (let i = 0; i < 5001; i++) c.diario(`k${i}`, 40, '2026-11-14');
    c.diario('novo', 40, '2026-11-15');
    expect((c as unknown as { dias: Map<string, unknown> }).dias.size).toBe(1);
  });
});

describe('consumirCota', () => {
  it('libera até o teto e barra depois', async () => {
    const a = armazemFalso();
    const r: boolean[] = [];
    for (let i = 0; i < 4; i++) r.push(await consumirCota(a, '2026-11-13', 3));
    expect(r).toEqual([true, true, true, false]);
  });
  it('zera no dia seguinte e guarda uma só chave', async () => {
    const a = armazemFalso();
    for (let i = 0; i < 3; i++) await consumirCota(a, '2026-11-13', 3);
    expect(await consumirCota(a, '2026-11-14', 3)).toBe(true);
    expect([...a.m.keys()]).toEqual(['cota']);
    expect(a.m.get('cota')).toEqual({ dia: '2026-11-14', n: 1 });
  });
});

describe('diaSaoPaulo', () => {
  it('usa o fuso de Brasília', () => {
    expect(diaSaoPaulo(new Date('2026-11-14T02:30:00Z'))).toBe('2026-11-13');
    expect(diaSaoPaulo(new Date('2026-11-14T03:30:00Z'))).toBe('2026-11-14');
  });
});

describe('Limites (Durable Object) e criarLimites', () => {
  function nsFalso() {
    const obj = new Limites({ storage: armazemFalso() } as unknown as DurableObjectState);
    const ids: string[] = [];
    const ns = {
      idFromName: (n: string) => (ids.push(n), n),
      get: () => ({ fetch: (url: string, init: RequestInit) => obj.fetch(new Request(url, init)) }),
    } as unknown as DurableObjectNamespace;
    return { ns, ids };
  }

  it('limitador: 6 liberados, 7º barrado, sempre no objeto "global"', async () => {
    const { ns, ids } = nsFalso();
    const { limitador } = criarLimites(ns, { LIMITE_POR_MINUTO: '6', COTA_DIARIA: '1000' });
    const r: boolean[] = [];
    for (let i = 0; i < 7; i++) r.push((await limitador.limit({ key: 'k' })).success);
    expect(r).toEqual([true, true, true, true, true, true, false]);
    expect(new Set(ids)).toEqual(new Set(['global']));
  });
  it('limitador: 41ª pergunta do mesmo visitante no dia -> barrada com motivo "dia"', async () => {
    const { ns } = nsFalso();
    const { limitador } = criarLimites(ns, { LIMITE_POR_MINUTO: '100', LIMITE_DIARIO_VISITANTE: '40' });
    const r = [];
    for (let i = 0; i < 41; i++) r.push(await limitador.limit({ key: 'k' }));
    expect(r.slice(0, 40).every((x) => x.success)).toBe(true);
    expect(r[40]).toEqual({ success: false, motivo: 'dia' });
    expect((await limitador.limit({ key: 'outro' })).success).toBe(true);
  });
  it('limitador: barrado no minuto não gasta o limite diário e traz motivo "minuto"', async () => {
    const { ns } = nsFalso();
    const { limitador } = criarLimites(ns, { LIMITE_POR_MINUTO: '2', LIMITE_DIARIO_VISITANTE: '3' });
    const r = [];
    for (let i = 0; i < 6; i++) r.push(await limitador.limit({ key: 'k' }));
    expect(r.map((x) => x.success)).toEqual([true, true, false, false, false, false]);
    expect(r[2]).toEqual({ success: false, motivo: 'minuto' });
  });
  it('limite diário inválido usa o padrão 40', async () => {
    const { ns } = nsFalso();
    const { limitador } = criarLimites(ns, { LIMITE_POR_MINUTO: '1000', LIMITE_DIARIO_VISITANTE: 'x' });
    let ok = 0;
    for (let i = 0; i < 45; i++) if ((await limitador.limit({ key: 'k' })).success) ok++;
    expect(ok).toBe(40);
  });
  it('cota: respeita COTA_DIARIA', async () => {
    const { ns } = nsFalso();
    const { cota } = criarLimites(ns, { COTA_DIARIA: '2' });
    expect([await cota.consumir(), await cota.consumir(), await cota.consumir()]).toEqual([true, true, false]);
  });
  it('valores inválidos usam os padrões (6 e 1000)', async () => {
    const { ns } = nsFalso();
    const { limitador } = criarLimites(ns, { LIMITE_POR_MINUTO: 'abc', COTA_DIARIA: '-1' });
    const r: boolean[] = [];
    for (let i = 0; i < 7; i++) r.push((await limitador.limit({ key: 'k' })).success);
    expect(r.filter(Boolean)).toHaveLength(6);
  });
  it('pedido malformado ao objeto -> 400, e o adaptador lança', async () => {
    const obj = new Limites({ storage: armazemFalso() } as unknown as DurableObjectState);
    const r = await obj.fetch(new Request('https://limites/visitante', { method: 'POST', body: '{}' }));
    expect(r.status).toBe(400);
    const ns = {
      idFromName: (n: string) => n,
      get: () => ({ fetch: async () => new Response(null, { status: 500 }) }),
    } as unknown as DurableObjectNamespace;
    await expect(criarLimites(ns, {}).cota.consumir()).rejects.toThrow();
  });
});
