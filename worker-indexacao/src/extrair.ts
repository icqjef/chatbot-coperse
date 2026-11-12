import * as cheerio from 'cheerio';
import type { PaginaExtraida, LinkEncontrado } from '@chatbot/comum/tipos';
import { nomeDoArquivo, normalizar } from '@chatbot/comum/classificar';

const BLOCOS = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'table', 'section', 'article', 'ul', 'ol']);

const limpa = (s: string) => s.replace(/[ \t\r\n\u00a0]+/g, ' ').trim();

function texto(no: any): string {
  if (no.type === 'text') return no.data ?? '';
  if (no.type !== 'tag') return '';
  const nome = no.name.toLowerCase();
  if (nome === 'tr') {
    const celulas = (no.children ?? [])
      .filter((c: any) => c.type === 'tag' && /^t[dh]$/i.test(c.name))
      .map((c: any) => limpa(filhos(c)));
    return `\n\n${celulas.join(' | ')}\n`;
  }
  const dentro = filhos(no);
  return BLOCOS.has(nome) ? `\n\n${dentro}\n\n` : dentro;
}

function filhos(no: any): string {
  return (no.children ?? []).map(texto).join('');
}

const GENERICO = /^(clique|clicando|acesse|veja|aqui|visualizar|baixe|download)\b/;

export function ehGenerico(t: string): boolean {
  const n = normalizar(t);
  return GENERICO.test(n) || n.replace(/[^a-z]/g, '').length < 4;
}

function tituloDoArquivo(url: URL): string {
  return limpa(nomeDoArquivo(url.toString()).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' '));
}

function coletarLinks($: cheerio.CheerioAPI, urlPagina: string): LinkEncontrado[] {
  const achados = new Map<string, { titulo: string; bom: boolean }>();
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    if (!href || /^(mailto|tel|javascript):/i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, urlPagina);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    url.hash = '';
    const chave = url.toString();
    let titulo = limpa($(el).text());
    const bom = !ehGenerico(titulo);
    if (!bom) {
      const pai = limpa($(el).closest('li, p, td, div').text()).slice(0, 200);
      titulo = pai && !ehGenerico(pai) ? pai : tituloDoArquivo(url) || titulo;
    }
    const antes = achados.get(chave);
    if (!antes || (!antes.bom && bom)) achados.set(chave, { titulo, bom });
  });
  return [...achados].map(([url, { titulo }]) => ({ url, titulo }));
}

function dataPublicada(raiz: cheerio.Cheerio<any>): string | undefined {
  const cand = [
    raiz.find('time[datetime]').first().attr('datetime'),
    raiz.find('[itemprop="datePublished"]').first().attr('datetime'),
    raiz.find('[itemprop="datePublished"]').first().attr('content'),
  ];
  for (const c of cand) {
    if (c && !Number.isNaN(Date.parse(c))) return new Date(c).toISOString();
  }
  return undefined;
}

export function extrairPagina(html: string, urlPagina: string): PaginaExtraida {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  // Links antes de remover nav/header/footer: os menus levam às páginas de processo.
  const links = coletarLinks($, urlPagina);
  const candidatos: [string, cheerio.Cheerio<any>][] = [
    ['artigo', $('[itemprop="articleBody"]')],
    ['artigo', $('.item-page')],
    ['main', $('main')],
    ['body', $('body')],
  ];
  const [origem, corpo] = candidatos.find(([, e]) => e.length > 0) ?? ['body', $('body')];
  // Data do próprio artigo primeiro; depois a página inteira.
  const data = dataPublicada(origem === 'artigo' ? corpo : $.root()) ?? dataPublicada($.root());
  $('nav, header, footer, form').remove();
  let bruto = corpo.toArray().map(texto).join('\n\n');
  // Páginas com streaming (Next.js) deixam em <main> só um "Carregando…"; o conteúdo vem fora dele.
  if (origem === 'main' && bruto.trim().length < 200) bruto = $('body').toArray().map(texto).join('\n\n');
  const out = bruto
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const tituloEl = $('.item-page h1, .item-page h2').first();
  const titulo = limpa(tituloEl.length ? tituloEl.text() : $('title').first().text());
  return { titulo, texto: out, data, links };
}
