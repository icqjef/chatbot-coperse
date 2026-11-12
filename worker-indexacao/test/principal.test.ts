import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Site, Embedder } from '@chatbot/comum/tipos';
import { executar, codigoSaida } from '../src/principal.js';
import { criarCfFalso } from './fakes.js';

const html = readFileSync(new URL('./fixtures/coperse-artigo.html', import.meta.url), 'utf8');
const mk = (id: string, feed?: string): Site => ({
  id, nome: id, base: `https://${id}.furg.br`, ...(feed ? { feed } : {}),
  paginas_chave: [], profundidade: 1, dominios_permitidos: [`${id}.furg.br`],
});
const feedXml = (n: number, host = 'coperse') =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${Array.from({ length: n }, (_, i) =>
    `<item><title>Notícia ${i}</title><link>https://${host}.furg.br/n${i}</link><guid>g${i}</guid><pubDate>Tue, 10 Mar 2026 12:00:00 +0000</pubDate></item>`).join('')}</channel></rss>`;

function montar(opts: { falhaEm?: string; feedQuebrado?: boolean } = {}) {
  const f = criarCfFalso();
  const execSql: { sql: string; params: unknown[] }[] = [];
  const cf = {
    ...f.cf,
    async d1(sql: string, params: unknown[] = []) {
      if (/execucoes/i.test(sql)) {
        execSql.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return /^INSERT/i.test(sql.trim()) ? [{ id: 7 }] : [];
      }
      return f.cf.d1(sql, params);
    },
  };
  const embedder: Embedder = { async embed(t) { return t.map(() => new Array(768).fill(0.5)); } };
  const buscados: string[] = [];
  const esperas: number[] = [];
  const deps = {
    cf, embedder, agora: () => '2026-11-12T00:00:00Z',
    async buscarHtml(url: string) {
      buscados.push(url);
      if (url.endsWith('feed.xml')) {
        if (opts.feedQuebrado && url.includes('coperse')) throw new Error('HTTP 500');
        return feedXml(8, url.includes('sisu') ? 'sisu' : 'coperse');
      }
      if (url === opts.falhaEm) throw new Error('HTTP 404');
      return html;
    },
  };
  return { f, deps, execSql, buscados, esperar: async (ms: number) => { esperas.push(ms); }, esperas };
}

describe('executar', () => {
  it('indexa só os `limite` primeiros itens, tolera erro e registra execução', async () => {
    const m = montar({ falhaEm: 'https://coperse.furg.br/n2' });
    const sites = [mk('coperse', 'https://coperse.furg.br/feed.xml'), mk('vestibular')];
    const r = await executar({ limite: 5, sites, esperar: m.esperar }, m.deps);
    expect(r.nova + r.erro).toBe(5);
    expect(r).toMatchObject({ nova: 4, erro: 1, alterada: 0, igual: 0, vazia: 0 });
    expect(m.buscados.filter((u) => !u.endsWith('feed.xml'))).toHaveLength(5);
    expect(m.buscados.some((u) => u.includes('vestibular'))).toBe(false);
    expect(m.execSql).toHaveLength(2);
    expect(m.execSql[0]!.sql).toMatch(/^INSERT INTO execucoes/);
    expect(m.execSql[1]!.sql).toMatch(/^UPDATE execucoes/);
    expect(m.execSql[1]!.params).toEqual(expect.arrayContaining([5, 1, 7]));
    expect(m.esperas.length).toBeGreaterThan(0);
    expect(m.esperas.every((ms) => ms === 1000)).toBe(true);
  });

  it('falha ao ler um feed conta como erro e segue para o próximo site', async () => {
    const m = montar({ feedQuebrado: true });
    const sites = [mk('coperse', 'https://coperse.furg.br/feed.xml'), mk('sisu', 'https://sisu.furg.br/feed.xml')];
    const r = await executar({ limite: 2, sites, esperar: m.esperar }, m.deps);
    expect(r).toMatchObject({ nova: 2, erro: 1 });
  });
});

describe('robustez', () => {
  it('registra o motivo da falha do feed e segue', async () => {
    const m = montar({ feedQuebrado: true });
    const msgs: string[] = [];
    const orig = console.error;
    console.error = (s: string) => { msgs.push(String(s)); };
    try {
      const r = await executar({ limite: 1, sites: [mk('coperse', 'https://coperse.furg.br/feed.xml')], esperar: m.esperar }, m.deps);
      expect(r.erro).toBe(1);
    } finally { console.error = orig; }
    expect(msgs).toEqual(['feed coperse: HTTP 500']);
  });
  it('item fora do domínio permitido conta como erro e não é buscado', async () => {
    const m = montar();
    const deps = { ...m.deps, async buscarHtml(u: string) { return u.endsWith('feed.xml') ? feedXml(2, 'outro') : (m.buscados.push(u), html); } };
    const orig = console.error; console.error = () => {};
    try {
      const r = await executar({ limite: 2, sites: [mk('coperse', 'https://coperse.furg.br/feed.xml')], esperar: m.esperar }, deps);
      expect(r).toMatchObject({ erro: 2, nova: 0 });
    } finally { console.error = orig; }
    expect(m.buscados).toEqual([]);
  });
  it('codigoSaida: 1 só se nada deu certo e houve erro', () => {
    const z = { nova: 0, alterada: 0, igual: 0, vazia: 0, erro: 0 };
    expect(codigoSaida({ ...z, erro: 3 })).toBe(1);
    expect(codigoSaida({ ...z, erro: 3, igual: 1 })).toBe(0);
    expect(codigoSaida(z)).toBe(0);
  });
});
