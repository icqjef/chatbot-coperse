import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Site, Embedder } from '@chatbot/comum/tipos';
import { carregarRegras } from '@chatbot/comum/classificar';
import { executar, codigoSaida, type OpcoesExecucao } from '../src/principal.js';
import { ErroHttp, type Resposta } from '../src/http.js';
import { criarCfFalso } from './fakes.js';
import { carregarEstado, enfileirar } from '../src/fila.js';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../config/${p}`, import.meta.url), 'utf8'));
const regras = carregarRegras(json('processos.json'), json('listas.json'));
const V = 'https://vestibular.furg.br';

const pagina = (titulo: string, links: [string, string][] = [], corpo = `Conteúdo da página ${titulo}.`) =>
  `<html><head><title>${titulo}</title></head><body><main><p>${corpo}</p>${links
    .map(([href, t]) => `<p><a href="${href}">${t}</a></p>`)
    .join('')}</main></body></html>`;

/** mini-site: 4 páginas e 3 PDFs */
const MINI: Record<string, Resposta> = {
  [`${V}/`]: { tipo: 'html', texto: pagina('Página inicial', [
    ['/processo-2027', 'Processo Seletivo Quilombolas 2027'],
    ['/noticias', 'Notícias recentes'],
    ['https://outro.br/externo', 'Site externo'],
    ['/index.php?format=feed&type=rss', 'Feed RSS'],
  ]) },
  [`${V}/processo-2027`]: { tipo: 'html', texto: pagina('Processo Seletivo Quilombolas 2027', [
    ['/docs/edital.pdf', 'Edital de abertura'],
    ['/docs/resultado-final.pdf', 'Resultado Final'],
    ['/homologacao', 'Homologação das inscrições'],
  ]) },
  [`${V}/noticias`]: { tipo: 'html', texto: pagina('Notícias recentes') },
  [`${V}/homologacao`]: { tipo: 'html', texto: pagina('Homologação das inscrições', [['/docs/anexo.pdf', 'Anexo I cursos ofertados']], 'Fulano de Tal, Beltrana de Tal, deferidas.') },
  [`${V}/docs/edital.pdf`]: { tipo: 'pdf', bytes: new TextEncoder().encode('Edital: inscrições de 1 a 10 de dezembro.') },
  [`${V}/docs/resultado-final.pdf`]: { tipo: 'pdf', bytes: new TextEncoder().encode('Fulano 9,5 Beltrana 9,0') },
  [`${V}/docs/anexo.pdf`]: { tipo: 'pdf', bytes: new TextEncoder().encode('Anexo I: cursos e vagas.') },
};

const site = (extra: Partial<Site> = {}): Site => ({
  id: 'vestibular', nome: 'Vestibular', base: V, paginas_chave: [`${V}/`], profundidade: 3,
  dominios_permitidos: ['vestibular.furg.br'], ...extra,
});

function montar(o: { paginas?: Record<string, Resposta | Error>; vetores?: number; agora?: string } = {}) {
  const f = criarCfFalso({ vetores: o.vetores });
  const paginas = o.paginas ?? MINI;
  const embutidos: string[] = [];
  const embedder: Embedder = { async embed(t) { embutidos.push(...t); return t.map(() => new Array(768).fill(0.5)); } };
  const buscados: string[] = [];
  const esperas: number[] = [];
  const relogio = { t: 0 };
  const estado = { agora: o.agora ?? '2026-11-12T00:00:00.000Z' };
  const deps = {
    cf: f.cf, embedder, agora: () => estado.agora,
    async buscar(url: string): Promise<Resposta> {
      buscados.push(url);
      relogio.t += 1000;
      const r = paginas[url];
      if (r instanceof Error) throw r;
      if (!r) throw new ErroHttp(404, url);
      return r;
    },
    async extrairPdf(b: Uint8Array) { return { texto: new TextDecoder().decode(b), paginas: 1 }; },
  };
  const opcoes = (extra: Partial<OpcoesExecucao> = {}): OpcoesExecucao => ({
    maxItens: 400, prazoMs: 25 * 60_000, sites: [site()], regras, tetoVetores: 6000,
    esperar: async (ms) => { esperas.push(ms); }, relogio: () => relogio.t, ...extra,
  });
  return { f, deps, buscados, esperas, embutidos, opcoes, estado, relogio };
}

describe('executar: rastreamento pela fila', () => {
  it('rastreia o mini-site a partir da página-chave; listas viram só resumo', async () => {
    const m = montar();
    const r = await executar(m.opcoes(), m.deps);
    expect(r).toMatchObject({ nova: 7, erro: 0, teto_atingido: false, fila_restante: 0 });
    for (const u of ['/', '/processo-2027', '/noticias', '/homologacao', '/docs/edital.pdf', '/docs/anexo.pdf', '/docs/resultado-final.pdf'])
      expect(m.f.paginas.get(`${V}${u}`)?.status, u).toBe('ok');
    // PDF de resultado: lista, 1 trecho, nunca baixado
    expect(m.buscados).not.toContain(`${V}/docs/resultado-final.pdf`);
    expect(m.f.paginas.get(`${V}/docs/resultado-final.pdf`)?.tipo).toBe('lista');
    expect(m.f.trechos().filter((t) => t.url === `${V}/docs/resultado-final.pdf`)).toHaveLength(1);
    // página HTML de homologação: lista, mas os links são seguidos
    expect(m.f.paginas.get(`${V}/homologacao`)?.tipo).toBe('lista');
    expect(m.buscados).toContain(`${V}/docs/anexo.pdf`);
    expect(m.embutidos.join(' ')).not.toMatch(/Fulano/);
    expect(m.f.paginas.get(`${V}/docs/edital.pdf`)?.tipo).toBe('pdf');
    // uma espera de 1 s antes de cada requisição
    expect(m.esperas).toHaveLength(m.buscados.length);
    expect(m.esperas.every((ms) => ms === 1000)).toBe(true);
    expect(m.f.registro.execucoes).toHaveLength(1);
    expect(m.f.registro.execucoes[0]).toMatchObject({ paginas: 7, erros: 0 });
  });

  it('respeita a profundidade do site', async () => {
    const m = montar();
    await executar(m.opcoes({ sites: [site({ profundidade: 1 })] }), m.deps);
    expect(m.buscados).toContain(`${V}/processo-2027`);
    expect(m.buscados).not.toContain(`${V}/docs/edital.pdf`);
    expect(m.buscados).not.toContain(`${V}/homologacao`);
  });

  it('nunca busca link fora do domínio nem feed', async () => {
    const m = montar();
    await executar(m.opcoes(), m.deps);
    expect(m.buscados.some((u) => u.includes('outro.br'))).toBe(false);
    expect(m.buscados.some((u) => u.includes('format=feed'))).toBe(false);
  });

  it('PDF herda processo e ano da página que o linkou', async () => {
    const m = montar();
    await executar(m.opcoes(), m.deps);
    expect(m.f.paginas.get(`${V}/docs/edital.pdf`)).toMatchObject({ processo: 'quilombolas', ano: 2027, titulo: 'Edital de abertura' });
    // a página inicial cai no processo padrão do site
    const m2 = montar();
    await executar(m2.opcoes({ sites: [site({ processo_padrao: 'vestibular' })] }), m2.deps);
    expect(m2.f.paginas.get(`${V}/`)?.processo).toBe('vestibular');
  });

  it('para no prazo e retoma na execução seguinte sem reembedar', async () => {
    const m = montar();
    const r1 = await executar(m.opcoes({ prazoMs: 2000 }), m.deps);
    expect(m.buscados).toHaveLength(2);
    expect(r1.fila_restante).toBeGreaterThan(0);
    const embedsAntes = m.embutidos.length;
    const r2 = await executar(m.opcoes(), m.deps);
    expect(r2.fila_restante).toBe(0);
    expect(r2).toMatchObject({ igual: 1, nova: 5 });
    // cada url foi embedada uma única vez nas duas execuções
    const urls = m.f.registro.upserts.flat().map((v) => v.metadata.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(m.embutidos.length - embedsAntes).toBe(5);
  });

  it('para no limite de itens', async () => {
    const m = montar();
    const r = await executar(m.opcoes({ maxItens: 3 }), m.deps);
    expect(r.nova).toBe(3);
    expect(r.fila_restante).toBeGreaterThan(0);
  });

  it('teto de vetores: para, deixa o item na fila e sai com 0', async () => {
    const m = montar({ vetores: 5 });
    const r = await executar(m.opcoes({ tetoVetores: 6 }), m.deps);
    expect(r).toMatchObject({ nova: 1, teto: 1, teto_atingido: true });
    expect(r.fila_restante).toBeGreaterThan(0);
    expect(codigoSaida(r)).toBe(0);
    const naFila = [...m.f.fila.keys()];
    expect(naFila).toContain(`${V}/processo-2027`);
  });

  it('404 em três execuções seguidas remove a página', async () => {
    const sumiu = `${V}/sumiu`;
    const m = montar({ paginas: {} });
    const o = m.opcoes({ sites: [site({ paginas_chave: [sumiu] })] });
    const r1 = await executar(o, m.deps);
    expect(r1).toMatchObject({ erro: 1, removida: 0 });
    expect(m.f.fila.get(sumiu)?.tentativas).toBe(1);
    m.estado.agora = '2026-11-12T10:00:00.000Z';
    expect(await executar(o, m.deps)).toMatchObject({ erro: 1, removida: 0 });
    m.estado.agora = '2026-11-12T20:00:00.000Z';
    const r3 = await executar(o, m.deps);
    expect(r3).toMatchObject({ erro: 0, removida: 1 });
    expect(m.f.paginas.get(sumiu)?.status).toBe('removida');
    expect(m.f.fila.has(sumiu)).toBe(false);
    expect(m.buscados).toEqual([sumiu, sumiu, sumiu]);
  });

  it('erro diferente de 404 não remove, só adia', async () => {
    const u = `${V}/instavel`;
    const m = montar({ paginas: { [u]: new ErroHttp(500, u) } });
    const o = m.opcoes({ sites: [site({ paginas_chave: [u] })] });
    for (const h of ['00', '10', '20']) {
      m.estado.agora = `2026-11-12T${h}:00:00.000Z`;
      await executar(o, m.deps);
    }
    expect(m.f.paginas.get(u)?.status).toBe('erro');
    expect(m.f.paginas.get(u)?.falhas).toBe(3);
  });

  it('PDF escaneado vira vazia; PDF grande demais vira erro e é adiado', async () => {
    const vazio = `${V}/docs/escaneado.pdf`;
    const grande = `${V}/docs/enorme.pdf`;
    const m = montar({ paginas: {
      [`${V}/`]: { tipo: 'html', texto: pagina('Página inicial', [['/docs/escaneado.pdf', 'Edital digitalizado'], ['/docs/enorme.pdf', 'Edital completo']]) },
      [vazio]: { tipo: 'pdf', bytes: new Uint8Array(0) },
      [grande]: new Error('Arquivo maior que 15 MB'),
    } });
    const r = await executar(m.opcoes(), m.deps);
    expect(r).toMatchObject({ nova: 1, vazia: 1, erro: 1 });
    expect(m.f.paginas.get(vazio)?.status).toBe('vazia');
    expect(m.f.paginas.get(grande)).toMatchObject({ status: 'erro', titulo: 'Edital completo', erro: 'Arquivo maior que 15 MB' });
    expect(m.f.fila.get(grande)).toMatchObject({ tentativas: 1 });
    expect(m.f.fila.get(grande)?.proxima_tentativa).toBeTruthy();
  });

  it('resposta de tipo "outro" é concluída e contada como ignorada', async () => {
    const m = montar({ paginas: { [`${V}/`]: { tipo: 'outro' } } });
    const r = await executar(m.opcoes(), m.deps);
    expect(r).toMatchObject({ ignorada: 1, fila_restante: 0 });
    expect(codigoSaida(r)).toBe(0);
  });
});

describe('executar: feeds', () => {
  const feedXml = (itens: [string, string][]) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${itens.map(([t, l]) =>
      `<item><title>${t}</title><link>${l}</link><pubDate>Tue, 10 Mar 2026 12:00:00 +0000</pubDate></item>`).join('')}</channel></rss>`;
  const C = 'https://coperse.furg.br';
  const coperse = (): Site => ({
    id: 'coperse', nome: 'COPERSE', base: C, feed: `${C}/feed`, paginas_chave: [], profundidade: 0, dominios_permitidos: ['coperse.furg.br'],
  });

  it('semeia os itens do feed com título e data do feed; fora do domínio conta erro', async () => {
    const m = montar({ paginas: {
      [`${C}/feed`]: { tipo: 'html', texto: feedXml([['Inscrições do Vestibular 2027', `${C}/n1#topo`], ['Externo', 'https://outro.br/n2']]) },
      [`${C}/n1`]: { tipo: 'html', texto: pagina('Título da página') },
    } });
    const orig = console.error; console.error = () => {};
    try {
      const r = await executar(m.opcoes({ sites: [coperse()] }), m.deps);
      expect(r).toMatchObject({ nova: 1, erro: 1 });
    } finally { console.error = orig; }
    expect(m.buscados).toEqual([`${C}/feed`, `${C}/n1`]);
    expect(m.f.paginas.get(`${C}/n1`)).toMatchObject({
      titulo: 'Inscrições do Vestibular 2027', data_publicacao: '2026-03-10T12:00:00.000Z', processo: 'vestibular', ano: 2027,
    });
  });

  it('falha no feed: registra o motivo e segue para o próximo site', async () => {
    const m = montar({ paginas: { ...MINI, [`${C}/feed`]: new Error('HTTP 500') } });
    const msgs: string[] = [];
    const orig = console.error; console.error = (s: string) => { msgs.push(String(s)); };
    try {
      const r = await executar(m.opcoes({ sites: [coperse(), site()] }), m.deps);
      expect(r.erro).toBe(1);
      expect(r.nova).toBe(7);
    } finally { console.error = orig; }
    expect(msgs).toEqual(['feed coperse: HTTP 500']);
  });

  it('não usa o host sisu3 para classificar o processo', async () => {
    const S = 'https://sisu3.furg.br';
    const m = montar({ paginas: { [`${S}/x`]: { tipo: 'html', texto: pagina('Calendário acadêmico') } } });
    const sisu: Site = { id: 'sisu', nome: 'SiSU', base: S, paginas_chave: [`${S}/x`], profundidade: 0, dominios_permitidos: ['sisu3.furg.br'] };
    await executar(m.opcoes({ sites: [sisu] }), m.deps);
    expect(m.f.paginas.get(`${S}/x`)?.processo).toBe('geral');
  });

  it('URL achada por link e depois publicada no feed fica com título e data do feed', async () => {
    const paginas: Record<string, Resposta> = {
      [`${C}/feed`]: { tipo: 'html', texto: feedXml([]) },
      [`${C}/`]: { tipo: 'html', texto: pagina('Início', [['/n1', 'Link para n1']]) },
      [`${C}/n1`]: { tipo: 'html', texto: pagina('Título da página') },
    };
    const m = montar({ paginas });
    const o = m.opcoes({ sites: [{ ...coperse(), paginas_chave: [`${C}/`], profundidade: 1 }], maxItens: 1 });
    const r1 = await executar(o, m.deps);
    expect(r1.fila_restante).toBe(1); // n1 descoberto por link, sem orçamento
    paginas[`${C}/feed`] = { tipo: 'html', texto: feedXml([['Notícia do feed', `${C}/n1`]]) };
    await executar(o, m.deps);
    expect(m.f.paginas.get(`${C}/n1`)).toMatchObject({ titulo: 'Notícia do feed', data_publicacao: '2026-03-10T12:00:00.000Z' });
  });
});

describe('executar: correções da revisão', () => {
  it('cada URL é buscada uma única vez por execução, mesmo com links de volta', async () => {
    const irmas: [string, string][] = [['/', 'Início do site'], ['/a', 'Página A'], ['/b', 'Página B'], ['/c', 'Página C']];
    const m = montar({ paginas: Object.fromEntries(['/', '/a', '/b', '/c'].map((p) => [`${V}${p}`, { tipo: 'html', texto: pagina(`Página ${p}`, irmas) }])) });
    const r = await executar(m.opcoes(), m.deps);
    expect(r).toMatchObject({ nova: 4, igual: 0 });
    expect([...m.buscados].sort()).toEqual([`${V}/`, `${V}/a`, `${V}/b`, `${V}/c`]);
  });

  it('ano não vem da query string', async () => {
    const u = `${V}/pagina?id=2019`;
    const m = montar({ paginas: { [u]: { tipo: 'html', texto: pagina('Calendário') } } });
    await executar(m.opcoes({ sites: [site({ paginas_chave: [u] })] }), m.deps);
    expect(m.f.paginas.get(u)?.ano).toBe(2026);
  });

  it('PDF com título genérico ("Clique aqui") usa o nome do arquivo', async () => {
    const u = `${V}/docs/Edital_Vestibular_2027.pdf`;
    const m = montar({ paginas: { [u]: { tipo: 'pdf', bytes: new TextEncoder().encode('Edital completo.') } } });
    const estado = await carregarEstado(m.f.cf);
    await enfileirar(m.f.cf, estado, [{ url: u, site: 'vestibular', profundidade: 1, origem: `${V}/`, prioridade: 2, titulo: 'Clique aqui', processo: null, ano: null, data: null }], { agora: m.estado.agora });
    await executar(m.opcoes({ sites: [site({ paginas_chave: [] })] }), m.deps);
    expect(m.f.paginas.get(u)).toMatchObject({ titulo: 'Edital Vestibular 2027', processo: 'vestibular', ano: 2027 });
  });
});

describe('codigoSaida', () => {
  it('1 só se nada deu certo e houve erro', () => {
    const z = { nova: 0, alterada: 0, igual: 0, vazia: 0, erro: 0, teto: 0, ignorada: 0, removida: 0 };
    expect(codigoSaida({ ...z, erro: 3 })).toBe(1);
    expect(codigoSaida({ ...z, erro: 3, igual: 1 })).toBe(0);
    expect(codigoSaida({ ...z, erro: 3, teto: 1 })).toBe(0);
    expect(codigoSaida({ ...z, erro: 3, removida: 1 })).toBe(0);
    expect(codigoSaida(z)).toBe(0);
  });
});
