import * as cheerio from 'cheerio';
import type { PaginaExtraida } from '@chatbot/comum/tipos';

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

export function extrairPagina(html: string): PaginaExtraida {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, form, noscript').remove();
  const corpo = [$('[itemprop="articleBody"]'), $('.item-page'), $('main'), $('body')].find((e) => e.length > 0);
  const bruto = corpo ? corpo.toArray().map(texto).join('\n\n') : '';
  const out = bruto
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const tituloEl = $('.item-page h1, .item-page h2').first();
  const titulo = limpa(tituloEl.length ? tituloEl.text() : $('title').first().text());
  return { titulo, texto: out };
}
