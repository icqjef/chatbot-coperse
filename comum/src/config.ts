import type { Site } from './tipos';

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const listaDeTextos = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export function carregarSites(json: unknown): Site[] {
  if (!Array.isArray(json)) throw new Error('sites.json deve ser uma lista de sites.');
  const ids = new Set<string>();
  return json.map((bruto, i) => {
    const pos = `Site #${i + 1}`;
    if (!ehObjeto(bruto)) throw new Error(`${pos}: deve ser um objeto.`);
    const { id, nome, base, feed, paginas_chave, profundidade, dominios_permitidos, processo_padrao, excluir } = bruto;
    if (typeof id !== 'string' || id === '') throw new Error(`${pos}: campo "id" obrigatório.`);
    if (ids.has(id)) throw new Error(`${pos}: "id" repetido: ${id}.`);
    ids.add(id);
    if (typeof nome !== 'string' || nome === '') throw new Error(`Site ${id}: campo "nome" obrigatório.`);
    if (typeof base !== 'string' || !base.startsWith('https://'))
      throw new Error(`Site ${id}: "base" deve existir e começar com https://.`);
    if (feed !== undefined && (typeof feed !== 'string' || !feed.startsWith('https://')))
      throw new Error(`Site ${id}: "feed" deve começar com https://.`);
    if (!listaDeTextos(paginas_chave)) throw new Error(`Site ${id}: "paginas_chave" deve ser uma lista de textos.`);
    if (!listaDeTextos(dominios_permitidos) || dominios_permitidos.length === 0)
      throw new Error(`Site ${id}: "dominios_permitidos" deve ser uma lista não vazia de textos.`);
    if (processo_padrao !== undefined && typeof processo_padrao !== 'string')
      throw new Error(`Site ${id}: "processo_padrao" deve ser texto.`);
    if (excluir !== undefined) {
      if (!listaDeTextos(excluir)) throw new Error(`Site ${id}: "excluir" deve ser uma lista de textos.`);
      for (const e of excluir) {
        try {
          new RegExp(e);
        } catch {
          throw new Error(`Site ${id}: expressão regular inválida em "excluir": ${e}.`);
        }
      }
    }
    const prof = profundidade ?? 2;
    if (typeof prof !== 'number' || !Number.isInteger(prof) || prof < 0)
      throw new Error(`Site ${id}: "profundidade" deve ser um inteiro maior ou igual a 0.`);
    const site: Site = { id, nome, base, paginas_chave, profundidade: prof, dominios_permitidos };
    if (feed !== undefined) site.feed = feed;
    if (excluir !== undefined) site.excluir = excluir;
    if (processo_padrao !== undefined) site.processo_padrao = processo_padrao;
    return site;
  });
}

export function carregarOrigens(json: unknown): string[] {
  if (!listaDeTextos(json)) throw new Error('origens.json deve ser uma lista de textos.');
  for (const o of json) {
    let ok = false;
    try {
      const u = new URL(o);
      ok = u.protocol === 'https:' && u.origin === o;
    } catch {
      ok = false;
    }
    if (!ok) throw new Error(`Origem inválida: "${o}". Use https://dominio, sem caminho nem curinga.`);
  }
  return json;
}
