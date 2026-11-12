import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ItemFeed } from '@chatbot/comum/tipos';

const parser = new XMLParser({ processEntities: true, htmlEntities: true, trimValues: true });

function texto(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function lerFeed(xml: string): ItemFeed[] {
  const valido = XMLValidator.validate(xml);
  if (valido !== true) throw new Error(`feed inválido: ${valido.err.msg}`);
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new Error(`feed inválido: ${(e as Error).message}`);
  }
  // Só RSS: Atom (e qualquer outra raiz) falha alto em vez de devolver vazio em silêncio.
  if (!doc?.rss) throw new Error('Formato de feed não suportado (só RSS)');
  const bruto = doc?.rss?.channel?.item;
  const itens: any[] = bruto === undefined ? [] : Array.isArray(bruto) ? bruto : [bruto];
  const saida: ItemFeed[] = [];
  for (const it of itens) {
    const url = texto(it?.link).trim();
    if (!url) continue;
    const d = new Date(texto(it.pubDate));
    saida.push({
      titulo: texto(it.title),
      url,
      data: isNaN(d.getTime()) ? '' : d.toISOString(),
      guid: texto(it.guid?.['#text'] ?? it.guid) || url,
    });
  }
  return saida;
}
