import { describe, it, expect } from 'vitest';
import type { Site, Embedder, Documento } from '@chatbot/comum/tipos';
import { dividirEmTrechos } from '@chatbot/comum/trechos';
import { indexarDocumento, idTrecho, resumoDeLista, registrarErro, removerPagina } from '../src/indexar.js';
import { criarCfFalso } from './fakes.js';

const site: Site = { id: 'coperse', nome: 'COPERSE', base: 'https://coperse.furg.br', paginas_chave: [], profundidade: 1, dominios_permitidos: ['coperse.furg.br'] };
const paragrafos = (n: number, prefixo = 'Parágrafo') =>
  Array.from({ length: n }, (_, i) => `${prefixo} ${i} ${'palavra '.repeat(150)}`).join('\n\n');
const doc: Documento = {
  site, url: 'https://coperse.furg.br/a', tipo: 'html', titulo: 'Título do feed', data: '2026-03-10T12:00:00Z',
  processo: 'geral', ano: 2026, texto: paragrafos(3),
};

function montar(falhas = {}, teto?: { restante: number }) {
  const f = criarCfFalso(falhas);
  let embeds = 0;
  const consumos: number[] = [];
  const embedder: Embedder = {
    async embed(t) {
      embeds++;
      return t.map(() => new Array(768).fill(0.5));
    },
  };
  const deps = {
    cf: f.cf,
    embedder,
    agora: () => '2026-11-12T00:00:00Z',
    ...(teto ? { teto: { restante: () => teto.restante, consumir: (n: number) => { consumos.push(n); } } } : {}),
  };
  return { f, deps, embeds: () => embeds, consumos };
}

describe('indexarDocumento', () => {
  it('indexa documento novo com tipo, processo, ano e metadados do documento', async () => {
    const { f, deps } = montar();
    const d = { ...doc, tipo: 'pdf' as const, processo: 'sisu-2026', ano: 2025 };
    expect(await indexarDocumento(d, deps)).toBe('nova');
    const vetores = f.registro.upserts.flat();
    expect(vetores.length).toBeGreaterThan(0);
    expect(vetores.length).toBe(f.trechos().length);
    expect(f.fts().length).toBe(vetores.length);
    for (const v of vetores) {
      expect(v.id).toMatch(/^[0-9a-f]{40}-\d+$/);
      expect(v.metadata).toMatchObject({ url: d.url, site: 'coperse', data: d.data, processo: 'sisu-2026', ano: 2025 });
    }
    expect(f.paginas.get(d.url)).toMatchObject({ status: 'ok', titulo: 'Título do feed', falhas: 0, tipo: 'pdf', processo: 'sisu-2026', ano: 2025 });
    expect(idTrecho('x', 3)).toMatch(/^[0-9a-f]{40}-3$/);
  });

  it('grava trechos e FTS por inserirLinhas, nunca por INSERT individual via d1', async () => {
    const { f, deps } = montar();
    const sqls: string[] = [];
    const d1 = f.cf.d1;
    f.cf.d1 = async (sql, p) => { sqls.push(sql.replace(/\s+/g, ' ').trim()); return d1(sql, p); };
    await indexarDocumento(doc, deps);
    expect(sqls.some((s) => /^INSERT INTO trechos/i.test(s))).toBe(false);
    expect(f.trechos().length).toBeGreaterThan(0);
  });

  it('tipo lista: resumo vira exatamente um trecho', async () => {
    const { f, deps } = montar();
    const texto = resumoDeLista('Lista dos Convocados', '2026-11-10T12:00:00Z', 'https://c/a.pdf');
    expect(await indexarDocumento({ ...doc, tipo: 'lista', texto }, deps)).toBe('nova');
    expect(f.trechos()).toHaveLength(1);
    expect(f.paginas.get(doc.url)).toMatchObject({ tipo: 'lista' });
  });

  it('lista nunca indexa o texto recebido, só o resumo (sem nomes)', async () => {
    const { f, deps } = montar();
    const entradas: string[] = [];
    const embed = deps.embedder.embed;
    deps.embedder.embed = async (t, tipo) => { entradas.push(...t); return embed(t, tipo); };
    const longo = ('Fulano de Tal, CPF 000.000.000-00. ' + 'palavra '.repeat(300)).repeat(5);
    await indexarDocumento({ ...doc, tipo: 'lista', texto: longo }, deps);
    const resumo = resumoDeLista(doc.titulo, doc.data, doc.url);
    expect(f.trechos().map((t) => t.texto)).toEqual([resumo]);
    expect(JSON.stringify([f.trechos(), f.fts(), entradas])).not.toContain('Fulano');
  });

  it('resumoDeLista com data inválida omite a data, sem NaN', () => {
    const r = resumoDeLista('Lista X', 'lixo', 'https://c/a.pdf');
    expect(r).toBe('Lista X. Disponível em: https://c/a.pdf. Este documento traz uma lista nominal; o assistente não reproduz o conteúdo, consulte o link.');
    expect(r).not.toContain('NaN');
  });

  it('resumoDeLista usa a frase exata e a data dd/mm/aaaa', () => {
    expect(resumoDeLista('Lista dos Convocados', '2026-11-10T12:00:00Z', 'https://c/a.pdf')).toBe(
      'Lista dos Convocados. Documento publicado em 10/11/2026. Disponível em: https://c/a.pdf. Este documento traz uma lista nominal; o assistente não reproduz o conteúdo, consulte o link.',
    );
  });

  it('mesmo documento de novo é igual e não escreve nada', async () => {
    const { f, deps } = montar();
    await indexarDocumento(doc, deps);
    const ups = f.registro.upserts.length;
    const dels = f.registro.deletes;
    expect(await indexarDocumento(doc, { ...deps, agora: () => '2026-12-01T00:00:00Z' })).toBe('igual');
    expect(f.registro.upserts.length).toBe(ups);
    expect(f.registro.apagados.length).toBe(0);
    expect(f.registro.deletes).toBe(dels);
    expect(f.paginas.get(doc.url)!.data_vista).toBe('2026-12-01T00:00:00Z');
  });

  it('documento alterado troca os trechos e apaga só os ids obsoletos', async () => {
    const { f, deps } = montar();
    await indexarDocumento({ ...doc, texto: paragrafos(8) }, deps);
    const antigos = f.trechos().map((t) => t.id);
    expect(antigos.length).toBeGreaterThan(1);
    expect(await indexarDocumento({ ...doc, texto: paragrafos(1, 'Outro') }, deps)).toBe('alterada');
    const esperados = [idTrecho(doc.url, 0)];
    expect([...f.registro.apagados[0]!].sort()).toEqual(antigos.filter((id) => !esperados.includes(id)).sort());
    expect(f.registro.apagados).toHaveLength(1);
    expect(f.trechos().map((t) => t.id)).toEqual(esperados);
    expect(f.fts().map((t) => t.trecho_id)).toEqual(esperados);
  });

  it('falha no meio dos inserts (e no registro do erro) não deixa o documento como igual', async () => {
    const inj = { insertTrechoN: 2, upsertErro: true };
    const { f, deps } = montar(inj);
    const d = { ...doc, texto: paragrafos(6) };
    expect(await indexarDocumento(d, deps)).toBe('erro');
    expect(f.paginas.get(d.url)).toMatchObject({ hash: null, status: 'indexando' });
    inj.insertTrechoN = -1;
    expect(await indexarDocumento(d, deps)).not.toBe('igual');
    const ids = f.trechos().map((t) => t.id).sort();
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => idTrecho(d.url, i)).sort());
    expect(ids.length).toBeGreaterThan(1);
    expect(f.paginas.get(d.url)).toMatchObject({ status: 'ok' });
  });

  it('falha no meio registra status erro com falhas=1', async () => {
    const { f, deps } = montar({ insertTrechoN: 1 });
    expect(await indexarDocumento(doc, deps)).toBe('erro');
    expect(f.paginas.get(doc.url)).toMatchObject({ status: 'erro', falhas: 1, erro: 'D1 indisponível' });
  });

  it('grava indexando antes de qualquer DELETE', async () => {
    const { f, deps } = montar();
    await indexarDocumento({ ...doc, texto: paragrafos(4) }, deps);
    f.registro.eventos.length = 0;
    await indexarDocumento({ ...doc, texto: paragrafos(2, 'Outro') }, deps);
    const ev = f.registro.eventos;
    expect(ev.indexOf('paginas:indexando')).toBeGreaterThanOrEqual(0);
    expect(ev.indexOf('paginas:indexando')).toBeLessThan(ev.indexOf('delete'));
  });

  it('texto vazio é vazia e não chama o embedder', async () => {
    const { f, deps, embeds } = montar();
    expect(await indexarDocumento({ ...doc, texto: '  ' }, deps)).toBe('vazia');
    expect(embeds()).toBe(0);
    expect(f.paginas.get(doc.url)).toMatchObject({ status: 'vazia' });
  });

  it('data inválida usa agora()', async () => {
    const { f, deps } = montar();
    await indexarDocumento({ ...doc, data: '' }, deps);
    expect(f.registro.upserts.flat()[0]!.metadata.data).toBe('2026-11-12T00:00:00Z');
  });
});

describe('teto de vetores', () => {
  it('documento novo acima do restante devolve teto sem embedder nem escrita', async () => {
    const t = { restante: 2 };
    const { f, deps, embeds, consumos } = montar({}, t);
    const d = { ...doc, texto: paragrafos(6) };
    expect(await indexarDocumento(d, deps)).toBe('teto');
    expect(embeds()).toBe(0);
    expect(f.paginas.size).toBe(0);
    expect(f.registro.upserts).toHaveLength(0);
    expect(consumos).toEqual([]);
  });

  it('só o acréscimo conta: alterado com 1 trecho a mais cabe em restante 1 e consome 1', async () => {
    const t = { restante: 100 };
    const { f, deps, consumos } = montar({}, t);
    expect(dividirEmTrechos(paragrafos(4))).toHaveLength(2);
    expect(dividirEmTrechos(paragrafos(5))).toHaveLength(3);
    await indexarDocumento({ ...doc, texto: paragrafos(4) }, deps);
    const antes = f.trechos().length;
    consumos.length = 0;
    t.restante = 1;
    expect(await indexarDocumento({ ...doc, texto: paragrafos(5) + '\n\n' + paragrafos(1, 'Extra') }, deps)).toBe('alterada');
    const depois = f.trechos().length;
    expect(depois - antes).toBe(1);
    expect(consumos).toEqual([1]);
  });

  it('trechos a menos consomem número negativo', async () => {
    const t = { restante: 100 };
    const { f, deps, consumos } = montar({}, t);
    await indexarDocumento({ ...doc, texto: paragrafos(8) }, deps);
    const antes = f.trechos().length;
    consumos.length = 0;
    await indexarDocumento({ ...doc, texto: paragrafos(1, 'Outro') }, deps);
    expect(consumos).toEqual([f.trechos().length - antes]);
    expect(consumos[0]!).toBeLessThan(0);
  });
});

describe('registrarErro e removerPagina', () => {
  const e = { site, url: doc.url, titulo: doc.titulo, data: doc.data, tipo: 'pdf' as const, processo: 'geral', ano: 2026 };

  it('registrarErro devolve 1 e depois 2 para a mesma URL', async () => {
    const { f, deps } = montar();
    expect(await registrarErro(e, 'HTTP 404', deps)).toBe(1);
    expect(await registrarErro(e, 'HTTP 404', deps)).toBe(2);
    expect(f.paginas.get(e.url)).toMatchObject({ status: 'erro', falhas: 2, erro: 'HTTP 404', tipo: 'pdf' });
  });

  it('removerPagina apaga vetores, trechos e FTS e marca removida', async () => {
    const { f, deps } = montar();
    await indexarDocumento({ ...doc, texto: paragrafos(4) }, deps);
    const ids = f.trechos().map((t) => t.id);
    await removerPagina(doc.url, deps);
    expect([...f.registro.apagados[0]!].sort()).toEqual([...ids].sort());
    expect(f.trechos()).toHaveLength(0);
    expect(f.fts()).toHaveLength(0);
    expect(f.paginas.get(doc.url)).toMatchObject({ status: 'removida' });
  });
});
