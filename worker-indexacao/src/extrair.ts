import * as cheerio from 'cheerio';
import type { PaginaExtraida, LinkEncontrado } from '@chatbot/comum/tipos';
import { normalizar } from '@chatbot/comum/classificar';

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

const GENERICO = /^(clique|clicando|acesse|veja|aqui|visualizar|baixe|download)/;

function ehGenerico(t: string): boolean {
  const n = normalizar(t);
  return GENERICO.test(n) || n.replace(/[^a-z]/g, '').length < 4;
}

function tituloDoArquivo(url: URL): string {
  const nome = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let dec = nome;
  try {
    dec = decodeURIComponent(nome);
  } catch {
    // mantém o nome cru
  }
  return limpa(dec.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' '));
}

function coletarLinks($: cheerio.CheerioAPI, urlPagina: string): LinkEncontrado[] {
  const vistos = new Set<string>();
  const links: LinkEncontrado[] = [];
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
    if (vistos.has(chave)) return;
    vistos.add(chave);
    let titulo = limpa($(el).text());
    if (ehGenerico(titulo)) {
      const pai = limpa($(el).closest('li, p, td, div').text()).slice(0, 200);
      titulo = pai && !ehGenerico(pai) ? pai : tituloDoArquivo(url) || titulo;
    }
    links.push({ url: chave, titulo });
  });
  return links;
}

function dataPublicada($: cheerio.CheerioAPI): string | undefined {
  const cand = [
    $('time[datetime]').first().attr('datetime'),
    $('[itemprop="datePublished"]').first().attr('datetime'),
    $('[itemprop="datePublished"]').first().attr('content'),
  ];
  for (const c of cand) {
    if (c && !Number.isNaN(Date.parse(c))) return new Date(c).toISOString();
  }
  return undefined;
}

export function extrairPagina(html: string, urlPagina: string): PaginaExtraida {
  const $ = cheerio.load(html);
  // Links e data antes de remover nav/header/footer: os menus levam às páginas de processo.
  const links = coletarLinks($, urlPagina);
  const data = dataPublicada($);
  $('script, style, nav, header, footer, form, noscript').remove();
  const corpo = [$('[itemprop="articleBody"]'), $('.item-page'), $('main'), $('body')].find((e) => e.length > 0);
  let bruto = corpo ? corpo.toArray().map(texto).join('\n\n') : '';
  // Páginas com streaming (Next.js) deixam em <main> só um "Carregando…"; o conteúdo vem fora dele.
  if (bruto.trim().length < 200 && corpo && !corpo.is('body')) bruto = $('body').toArray().map(texto).join('\n\n');
  const out = bruto
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const tituloEl = $('.item-page h1, .item-page h2').first();
  const titulo = limpa(tituloEl.length ? tituloEl.text() : $('title').first().text());
  return { titulo, texto: out, data, links };
}
