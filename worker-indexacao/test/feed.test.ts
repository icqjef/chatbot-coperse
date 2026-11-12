import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerFeed } from '../src/feed.js';

const xml = readFileSync(new URL('./fixtures/coperse-feed.xml', import.meta.url), 'utf8');

describe('lerFeed', () => {
  it('lê os itens do feed real', () => {
    const itens = lerFeed(xml);
    expect(itens.length).toBeGreaterThanOrEqual(5);
    const p = itens[0]!;
    expect(p.url.startsWith('https://coperse.furg.br/')).toBe(true);
    expect(p.url).not.toContain('&amp;');
    expect(p.titulo).not.toMatch(/&\w+;|&#/);
    expect(new Date(p.data).toString()).not.toBe('Invalid Date');
    expect(p.guid).toBeTruthy();
  });
  it('decodifica entidades no título e usa url como guid ausente', () => {
    const x = `<rss><channel><item><title>A &amp; B &quot;c&quot; &#233;</title><link>https://x.br/?a=1&amp;b=2</link><pubDate>Tue, 10 Nov 2026 14:56:34 -0300</pubDate></item></channel></rss>`;
    const [i] = lerFeed(x);
    expect(i).toEqual({ titulo: 'A & B "c" é', url: 'https://x.br/?a=1&b=2', data: '2026-11-10T17:56:34.000Z', guid: 'https://x.br/?a=1&b=2' });
  });
  it('ignora item sem link', () => {
    expect(lerFeed('<rss><channel><item><title>x</title></item></channel></rss>')).toEqual([]);
  });
  it('feed vazio devolve []', () => {
    expect(lerFeed('<rss><channel><title>t</title></channel></rss>')).toEqual([]);
  });
  it('XML inválido lança erro com "feed"', () => {
    expect(() => lerFeed('<rss><channel><item></channel>')).toThrow(/feed/);
    expect(() => lerFeed('não é xml')).toThrow(/feed/);
  });
});

describe('lerFeed: formatos', () => {
  it('Atom lança "Formato de feed não suportado"', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title><entry><title>a</title><link href="https://coperse.furg.br/a"/></entry></feed>`;
    expect(() => lerFeed(atom)).toThrow('Formato de feed não suportado');
  });
});
