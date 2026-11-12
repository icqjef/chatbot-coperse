import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Site, Embedder } from '@chatbot/comum/tipos';
import { indexarPagina, idTrecho } from '../src/indexar.js';
import { criarCfFalso } from './fakes.js';

const html = readFileSync(new URL('./fixtures/coperse-artigo.html', import.meta.url), 'utf8');
const site: Site = { id: 'coperse', nome: 'COPERSE', base: 'https://coperse.furg.br', paginas_chave: [], profundidade: 1, dominios_permitidos: ['coperse.furg.br'] };
const entrada = { site, url: 'https://coperse.furg.br/a', titulo: 'Título do feed', data: '2026-03-10T12:00:00Z' };

function montar(htmlAtual: () => string | Error = () => html, falhas = {}) {
  const f = criarCfFalso(falhas);
  let embeds = 0;
  const embedder: Embedder = {
    async embed(t) {
      embeds++;
      return t.map(() => new Array(768).fill(0.5));
    },
  };
  const deps = {
    cf: f.cf,
    embedder,
    async buscarHtml() {
      const r = htmlAtual();
      if (r instanceof Error) throw r;
      return r;
    },
    agora: () => '2026-11-12T00:00:00Z',
  };
  return { f, deps, embeds: () => embeds };
}

const corpo = (n: number) =>
  `<html><body><main>${Array.from({ length: n }, (_, i) => `<p>Parágrafo ${i} ${'palavra '.repeat(150)}</p>`).join('')}</main></body></html>`;

describe('indexarPagina', () => {
  it('indexa página nova com metadados e ids no formato', async () => {
    const { f, deps } = montar();
    expect(await indexarPagina(entrada, deps)).toBe('nova');
    const vetores = f.registro.upserts.flat();
    expect(vetores.length).toBeGreaterThan(0);
    expect(vetores.length).toBe(f.trechos().length);
    expect(f.fts().length).toBe(vetores.length);
    for (const v of vetores) {
      expect(v.id).toMatch(/^[0-9a-f]{40}-\d+$/);
      expect(v.metadata.url).toBe(entrada.url);
      expect(v.metadata.site).toBe('coperse');
      expect(v.metadata.data).toBe(entrada.data);
      expect(v.metadata.ano).toBe(2026);
    }
    expect(f.paginas.get(entrada.url)).toMatchObject({ status: 'ok', titulo: 'Título do feed', falhas: 0 });
    expect(idTrecho('x', 3)).toMatch(/^[0-9a-f]{40}-3$/);
  });

  it('mesma página de novo é igual e não escreve nada', async () => {
    const { f, deps } = montar();
    await indexarPagina(entrada, deps);
    const ups = f.registro.upserts.length;
    const dels = f.registro.deletes;
    expect(await indexarPagina(entrada, { ...deps, agora: () => '2026-12-01T00:00:00Z' })).toBe('igual');
    expect(f.registro.upserts.length).toBe(ups);
    expect(f.registro.apagados.length).toBe(0);
    expect(f.registro.deletes).toBe(dels);
    expect(f.paginas.get(entrada.url)!.data_vista).toBe('2026-12-01T00:00:00Z');
  });

  it('página alterada troca os trechos e apaga todos os ids antigos', async () => {
    let atual = corpo(8);
    const { f, deps } = montar(() => atual);
    await indexarPagina(entrada, deps);
    const antigos = f.trechos().map((t) => t.id);
    expect(antigos.length).toBeGreaterThan(1);
    atual = corpo(1);
    expect(await indexarPagina(entrada, deps)).toBe('alterada');
    const esperados = [idTrecho(entrada.url, 0)];
    expect([...f.registro.apagados[0]!].sort()).toEqual(antigos.filter((id) => !esperados.includes(id)).sort());
    expect(f.registro.apagados).toHaveLength(1);
    expect(f.trechos().map((t) => t.id)).toEqual(esperados);
    expect(f.fts().map((t) => t.trecho_id)).toEqual(esperados);
  });

  it('falha no meio dos inserts (e no registro do erro) não deixa a página como igual', async () => {
    const f = { insertTrechoN: 2, upsertErro: true };
    const { f: cfa, deps } = montar(() => corpo(6), f);
    expect(await indexarPagina(entrada, deps)).toBe('erro');
    expect(cfa.paginas.get(entrada.url)).toMatchObject({ hash: null, status: 'indexando' });
    f.insertTrechoN = -1; // sem novas falhas
    expect(await indexarPagina(entrada, deps)).not.toBe('igual');
    const ids = cfa.trechos().map((t) => t.id).sort();
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => idTrecho(entrada.url, i)).sort());
    expect(ids.length).toBeGreaterThan(1);
    expect(cfa.paginas.get(entrada.url)).toMatchObject({ status: 'ok' });
  });

  it('erro de busca vira status erro com falhas=1 e não lança', async () => {
    const { f, deps } = montar(() => new Error('timeout'));
    expect(await indexarPagina(entrada, deps)).toBe('erro');
    expect(f.paginas.get(entrada.url)).toMatchObject({ status: 'erro', falhas: 1, erro: 'timeout' });
  });

  it('HTML sem corpo é vazia e não chama o embedder', async () => {
    const { f, deps, embeds } = montar(() => '<html><body></body></html>');
    expect(await indexarPagina(entrada, deps)).toBe('vazia');
    expect(embeds()).toBe(0);
    expect(f.paginas.get(entrada.url)).toMatchObject({ status: 'vazia' });
  });

  it('data inválida usa agora()', async () => {
    const { f, deps } = montar();
    await indexarPagina({ ...entrada, data: '' }, deps);
    expect(f.registro.upserts.flat()[0]!.metadata.data).toBe('2026-11-12T00:00:00Z');
    expect(f.paginas.get(entrada.url)!.ano).toBe(2026);
  });
});
