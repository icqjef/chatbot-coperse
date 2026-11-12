import { describe, expect, it } from 'vitest';
import { criarCfFalso } from './fakes.js';
import { adiar, carregarEstado, concluir, deveIgnorar, ehPdf, enfileirar, normalizarUrl, proximos, type EstadoRastreio, type NovoItem } from '../src/fila.js';

const AGORA = '2026-11-12T12:00:00.000Z';
const antes = (horas: number) => new Date(Date.parse(AGORA) - horas * 3600_000).toISOString();
const item = (url: string, extra: Partial<NovoItem> = {}): NovoItem => ({
  url, site: 'coperse', profundidade: 1, origem: null, prioridade: 0, titulo: null, processo: null, ano: null, data: null, ...extra,
});
const estadoVazio = (): EstadoRastreio => ({ paginas: new Map(), naFila: new Set() });
const u = (s: string | number) => `https://coperse.furg.br/${s}`;

describe('normalizarUrl', () => {
  it('canoniza host, fragmento e %xx', () => {
    expect(normalizarUrl('https://Coperse.furg.br/a/Homologa%c3%a7%c3%a3o.pdf#x')).toBe(normalizarUrl('https://coperse.furg.br/a/Homologação.pdf'));
  });
  it('não codifica de novo escapes existentes e põe o hex em maiúsculas', () => {
    expect(normalizarUrl('https://coperse.furg.br/a%2Cb')).toBe('https://coperse.furg.br/a%2Cb');
    expect(normalizarUrl('https://coperse.furg.br/a%c3%a7')).toBe('https://coperse.furg.br/a%C3%A7');
    expect(normalizarUrl('https://coperse.furg.br/Homologação')).toBe('https://coperse.furg.br/Homologa%C3%A7%C3%A3o');
    expect(normalizarUrl('https://vestibular.furg.br/api/documentos/publico?arquivo=a%2Fb.pdf')).toBe('https://vestibular.furg.br/api/documentos/publico?arquivo=a%2Fb.pdf');
  });
  it('devolve null para inválidas', () => {
    expect(normalizarUrl('não é url')).toBeNull();
    expect(normalizarUrl('/relativa')).toBeNull();
    expect(normalizarUrl('mailto:a@b.c')).toBeNull();
  });
});

describe('deveIgnorar / ehPdf', () => {
  it('ignora feed, paginação e estáticos', () => {
    expect(deveIgnorar('https://coperse.furg.br/index.php?format=feed&type=rss')).toBe(true);
    expect(deveIgnorar('https://coperse.furg.br/noticias?start=20')).toBe(true);
    expect(deveIgnorar('https://vestibular.furg.br/_next/static/x.js')).toBe(true);
    expect(deveIgnorar('https://coperse.furg.br/processos-seletivos/quilombolas')).toBe(false);
  });
  it('reconhece PDF', () => {
    expect(ehPdf('https://coperse.furg.br/docs/A.PDF')).toBe(true);
    expect(ehPdf('https://vestibular.furg.br/api/documentos/publico?arquivo=x')).toBe(true);
    expect(ehPdf('https://coperse.furg.br/a')).toBe(false);
  });
});

describe('enfileirar', () => {
  // O fake não divide em lotes: prova só que não há consulta por item e que as 150 linhas chegam juntas a
  // inserirLinhas. O cliente real (cloudflare.ts) divide em INSERTs de no máximo 100 parâmetros.
  it('filtra em memória, sem consulta d1 por item, e passa as 150 linhas novas a inserirLinhas', async () => {
    const { cf, fila } = criarCfFalso();
    let consultas = 0;
    const insercoes: number[] = [];
    const cfContado = {
      ...cf,
      d1: (...a: Parameters<typeof cf.d1>) => (consultas++, cf.d1(...a)),
      inserirLinhas: (...a: Parameters<typeof cf.inserirLinhas>) => (insercoes.push(a[2].length), cf.inserirLinhas(...a)),
    };
    const estado = estadoVazio();
    for (let i = 0; i < 100; i++) estado.naFila.add(u(i));
    for (let i = 100; i < 150; i++) estado.paginas.set(u(i), { dataVista: antes(2), status: 'ok', tipo: 'html' });
    // 100 já na fila + 50 vistos há 2 h + 150 novos
    const todos = Array.from({ length: 300 }, (_, i) => item(u(i)));
    const n = await enfileirar(cfContado, estado, todos, { agora: AGORA });
    expect(n).toBe(150);
    expect(consultas).toBe(0);
    expect(insercoes).toEqual([150]);
    expect(fila.size).toBe(150);
    expect(estado.naFila.size).toBe(250);
  });

  it('janelas de revisita', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    estado.paginas.set(u('h21'), { dataVista: antes(21), status: 'ok', tipo: 'html' });
    estado.paginas.set(u('h19'), { dataVista: antes(19), status: 'ok', tipo: 'html' });
    estado.paginas.set(u('a.pdf'), { dataVista: antes(10 * 24), status: 'ok', tipo: 'pdf' });
    estado.paginas.set(u('b.pdf'), { dataVista: antes(31 * 24), status: 'ok', tipo: 'pdf' });
    estado.paginas.set(u('erro'), { dataVista: antes(1), status: 'erro', tipo: 'html' });
    estado.paginas.set(u('vazia'), { dataVista: antes(1), status: 'vazia', tipo: 'html' });
    estado.paginas.set(u('forcada'), { dataVista: antes(1), status: 'ok', tipo: 'html' });
    const comuns = ['h21', 'h19', 'a.pdf', 'b.pdf', 'erro', 'vazia'].map((s) => item(u(s)));
    const n1 = await enfileirar(cf, estado, comuns, { agora: AGORA });
    expect(n1).toBe(3);
    expect([...fila.keys()].sort()).toEqual([u('b.pdf'), u('erro'), u('h21')].sort());
    await enfileirar(cf, estado, [item(u('forcada'))], { agora: AGORA, forcar: true });
    expect(fila.has(u('forcada'))).toBe(true);
  });

  it('normaliza, descarta inválidas e repetidas no próprio lote', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    const n = await enfileirar(cf, estado, [item('https://Coperse.furg.br/x#a'), item(u('x')), item('lixo')], { agora: AGORA });
    expect(n).toBe(1);
    expect([...fila.keys()]).toEqual([u('x')]);
  });

  it('erro permanente (falhas >= 5) usa a janela de 30 dias; erro com menos falhas sempre volta', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    estado.paginas.set(u('perm-recente'), { dataVista: antes(2), status: 'erro', tipo: 'html', falhas: 5 });
    estado.paginas.set(u('perm-10d'), { dataVista: antes(10 * 24), status: 'erro', tipo: 'html', falhas: 7 });
    estado.paginas.set(u('perm-31d'), { dataVista: antes(31 * 24), status: 'erro', tipo: 'html', falhas: 5 });
    estado.paginas.set(u('transitorio'), { dataVista: antes(1), status: 'erro', tipo: 'html', falhas: 2 });
    const n = await enfileirar(cf, estado, ['perm-recente', 'perm-10d', 'perm-31d', 'transitorio'].map((s) => item(u(s))), { agora: AGORA });
    expect(n).toBe(2);
    expect([...fila.keys()].sort()).toEqual([u('perm-31d'), u('transitorio')].sort());
  });

  it('página HTML do tipo lista usa a janela de 20 h', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    estado.paginas.set(u('lista'), { dataVista: antes(21), status: 'ok', tipo: 'lista' });
    expect(await enfileirar(cf, estado, [item(u('lista'))], { agora: AGORA })).toBe(1);
    expect(fila.has(u('lista'))).toBe(true);
  });

  it('repetida no lote mantém a maior prioridade e o primeiro título', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    const n = await enfileirar(cf, estado, [item(u('x'), { prioridade: 1 }), item(u('x'), { prioridade: 4, titulo: 'T' }), item(u('x'), { prioridade: 2, titulo: 'U' })], { agora: AGORA });
    expect(n).toBe(1);
    expect(fila.get(u('x'))).toMatchObject({ prioridade: 4, titulo: 'T' });
  });

  it('forcar eleva a prioridade de item já na fila', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    await enfileirar(cf, estado, [item(u('x'), { prioridade: 1 })], { agora: AGORA });
    const n = await enfileirar(cf, estado, [item(u('x'), { prioridade: 5 })], { agora: AGORA, forcar: true });
    expect(n).toBe(0);
    expect(fila.get(u('x'))!.prioridade).toBe(5);
  });
});

describe('carregarEstado', () => {
  it('lê paginas e fila', async () => {
    const { cf, paginas } = criarCfFalso();
    paginas.set('https://a/x', { url: 'https://a/x', data_vista: AGORA, status: 'ok', tipo: 'html' });
    await enfileirar(cf, estadoVazio(), [item(u('y'))], { agora: AGORA });
    const e = await carregarEstado(cf);
    paginas.set('https://a/e', { url: 'https://a/e', data_vista: AGORA, status: 'erro', tipo: 'pdf', falhas: 5 });
    expect(e.paginas.get('https://a/x')).toEqual({ dataVista: AGORA, status: 'ok', tipo: 'html', falhas: 0 });
    expect((await carregarEstado(cf)).paginas.get('https://a/e')).toEqual({ dataVista: AGORA, status: 'erro', tipo: 'pdf', falhas: 5 });
    expect(e.naFila.has(u('y'))).toBe(true);
  });
});

describe('proximos / concluir / adiar', () => {
  it('ordena por prioridade, profundidade, ordem e respeita proxima_tentativa', async () => {
    const { cf } = criarCfFalso();
    const estado = estadoVazio();
    await enfileirar(cf, estado, [
      item(u('a'), { profundidade: 2 }), item(u('b'), { profundidade: 1 }), item(u('c'), { profundidade: 1 }),
      item(u('d'), { profundidade: 3, prioridade: 9 }), item(u('e'), { profundidade: 1, prioridade: 2 }),
    ], { agora: AGORA });
    const todos = await proximos(cf, 10, AGORA);
    expect(todos.map((i) => i.url)).toEqual([u('d'), u('e'), u('b'), u('c'), u('a')]);
    expect(await proximos(cf, 2, AGORA)).toHaveLength(2);
    await adiar(cf, estado, todos[0]!, AGORA); // d: +2^1 h
    expect((await proximos(cf, 10, AGORA)).map((i) => i.url)).not.toContain(u('d'));
    const depois = await proximos(cf, 10, new Date(Date.parse(AGORA) + 2 * 3600_000).toISOString());
    expect(depois[0]!.url).toBe(u('d'));
    expect(depois[0]!.tentativas).toBe(1);
    await concluir(cf, estado, u('e'));
    expect(estado.naFila.has(u('e'))).toBe(false);
    expect((await proximos(cf, 10, AGORA)).map((i) => i.url)).not.toContain(u('e'));
  });

  it('adiar na 5ª tentativa remove o item', async () => {
    const { cf, fila } = criarCfFalso();
    const estado = estadoVazio();
    await enfileirar(cf, estado, [item(u('z'))], { agora: AGORA });
    let atual = (await proximos(cf, 1, AGORA))[0]!;
    for (let i = 1; i <= 4; i++) {
      await adiar(cf, estado, atual, AGORA);
      expect(fila.has(u('z'))).toBe(true);
      atual = (await proximos(cf, 1, '2027-01-01T00:00:00.000Z'))[0]!;
      expect(atual.tentativas).toBe(i);
    }
    await adiar(cf, estado, atual, AGORA);
    expect(fila.has(u('z'))).toBe(false);
    expect(estado.naFila.has(u('z'))).toBe(false);
  });
});
