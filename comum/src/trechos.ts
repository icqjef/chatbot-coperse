const ESPACO = /\s/;
const esp = (s: string, i: number): boolean => ESPACO.test(s.charAt(i));

function ultimoFimDeFrase(s: string, minimo: number): number {
  let melhor = -1;
  const re = /[.!?…]["')\]]?(?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const fim = m.index + m[0].length;
    if (fim >= minimo) melhor = fim;
  }
  return melhor;
}

/** Divide em trechos de até `maxCaracteres`, cortando em parágrafo, depois fim de frase, depois espaço. */
export function dividirEmTrechos(
  texto: string,
  opcoes: { maxCaracteres?: number; sobreposicao?: number } = {},
): string[] {
  const max = opcoes.maxCaracteres ?? 3200;
  const sobre = Math.min(opcoes.sobreposicao ?? 400, Math.floor(max / 2));
  const t = texto.trim();
  if (!t) return [];
  const trechos: string[] = [];
  let ini = 0;
  while (ini < t.length) {
    const limite = Math.min(ini + max, t.length);
    let fim = limite;
    if (limite < t.length) {
      const janela = t.slice(ini, limite);
      const minimo = Math.floor(max / 2);
      const par = janela.lastIndexOf('\n\n');
      if (par >= minimo) fim = ini + par;
      else {
        const fr = ultimoFimDeFrase(janela, minimo);
        if (fr > 0) fim = ini + fr;
        else {
          let i = janela.length;
          while (i > 0 && !esp(janela, i - 1)) i--;
          if (i > 0) fim = ini + i;
        }
      }
    }
    const peca = t.slice(ini, fim).trim();
    if (peca) trechos.push(peca);
    if (fim >= t.length) break;
    // próximo início: recua pela sobreposição e avança até começo de palavra
    let prox = fim - sobre;
    if (prox > 0 && !esp(t, prox - 1)) {
      while (prox < fim && !esp(t, prox)) prox++;
    }
    while (prox < fim && esp(t, prox)) prox++;
    ini = prox > ini ? prox : fim;
  }
  return trechos;
}

function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m || Number.isNaN(Date.parse(iso))) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function prefixarTrecho(
  t: string,
  m: { titulo: string; data: string; processo: string; ano: number | null },
): string {
  let cab = m.titulo;
  if (m.processo !== 'geral') cab += ` — ${m.processo}${m.ano != null ? ` ${m.ano}` : ''}`;
  const d = formatarData(m.data);
  if (d) cab += ` (${d})`;
  return `${cab}\n\n${t}`;
}
