import termosJson from '../../config/termos.json';

/**
 * Grafia errada, variante ou erro do reconhecimento de voz ("campos da furg", "formiga", "vestibulat"):
 * acrescenta o termo certo entre parênteses, sem trocar o texto, porque "campos" também é usado no sentido
 * próprio ("campos do formulário"). A busca e o modelo recebem os dois.
 */
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const EQUIVALENCIAS = termosJson.equivalencias.map((e) => ({
  de: new RegExp(e.de),
  para: e.para,
  norm: normalizar(e.para),
  exceto: 'exceto' in e && e.exceto ? new RegExp(e.exceto) : null,
}));
const VOCABULARIO = termosJson.vocabulario.map((p) => ({ p, n: normalizar(p) }));

function distancia(a: string, b: string): number {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(ant[j]! + 1, atual[j - 1]! + 1, ant[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = atual;
  }
  return ant[b.length]!;
}

export function expandirTermos(pergunta: string): string {
  const n = normalizar(pergunta);
  const extras = new Set<string>();
  for (const e of EQUIVALENCIAS) if (e.de.test(n) && !e.exceto?.test(n) && !n.includes(e.norm)) extras.add(e.para);
  for (const tok of new Set(n.split(/[^a-z0-9]+/))) {
    for (const v of VOCABULARIO) {
      // Uma letra de diferença só: com duas, "homologadas" e "inscrições" viravam erro de "homologação" e "inscrição".
      // Plural e singular ("vestibulares", "quilombola") não são erro.
      if (tok.length < 6 || tok.startsWith(v.n) || v.n.startsWith(tok) || n.includes(v.n) || Math.abs(tok.length - v.n.length) > 1) continue;
      if (distancia(tok, v.n) <= 1) extras.add(v.p);
    }
  }
  return extras.size ? `${pergunta} (${[...extras].join('; ')})` : pergunta;
}
