/**
 * Cronograma como dados: etapas e datas extraídas uma vez por documento, conferidas contra o texto original
 * e juntadas entre documentos (o completo mais recente, com retificações parciais mais novas por cima).
 */

export interface LinhaCronograma {
  etapa: string;
  quando: string;
}

export interface LinhaDatada extends LinhaCronograma {
  /** AAAA-MM-DD; null quando o texto não traz o dia de início ("até 21/12/2026"). */
  inicio: string | null;
  /** AAAA-MM-DD; null quando não há data ("em data a ser designada"). */
  fim: string | null;
}

/** Minúsculas, sem acento, espaços simples; corrige ligaduras comuns de PDF ("VesƟbular"). */
export function normalizarTexto(t: string): string {
  return t
    .replace(/Ɵ/g, 'ti')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave da etapa para juntar versões: só letras e números. */
export function chaveEtapa(etapa: string): string {
  return normalizarTexto(etapa).replace(/[^a-z0-9]+/g, ' ').trim();
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dois = (n: number) => String(n).padStart(2, '0');

function iso(d: number, m: number, a: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${a}-${dois(m)}-${dois(d)}`;
}

/**
 * Início e fim de "13/08 a 07/10/2026", "até 21/12/2026", "14/01 e 15/01/2027", "22/11/2026, domingo",
 * "01º de Março de 2027". O ano que falta vem da última data do texto (ou do anterior, se o mês passa do fim).
 */
export function interpretarQuando(quando: string): { inicio: string | null; fim: string | null } {
  const t = normalizarTexto(quando);
  const datas: { d: number; m: number; a?: number }[] = [];
  for (const x of t.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)) datas.push({ d: +x[1]!, m: +x[2]!, ...(x[3] ? { a: +x[3] } : {}) });
  if (!datas.length) {
    for (const x of t.matchAll(/(\d{1,2})[oº°]? de ([a-z]+) de (\d{4})/g)) {
      const m = MESES.indexOf(x[2]!) + 1;
      if (m) datas.push({ d: +x[1]!, m, a: +x[3]! });
    }
  }
  if (!datas.length) return { inicio: null, fim: null };
  const ultima = datas.at(-1)!;
  const anoFim = ultima.a ?? datas.find((x) => x.a)?.a;
  if (!anoFim) return { inicio: null, fim: null };
  const fim = iso(ultima.d, ultima.m, anoFim);
  if (datas.length === 1) return { inicio: /\bate\b/.test(t) ? null : fim, fim };
  const p = datas[0]!;
  const anoIni = p.a ?? (p.m > ultima.m ? anoFim - 1 : anoFim);
  return { inicio: iso(p.d, p.m, anoIni), fim };
}

/** Distância máxima, em caracteres do texto normalizado, entre o fim do nome da etapa e a data dela. */
const MAX_DISTANCIA = 200;

/**
 * Fica só a linha cuja data aparece no documento logo depois do nome da etapa (no máximo 200 caracteres):
 * nada inventado e nada trocado com a etapa vizinha. Sem data, a linha sai.
 */
export function conferirLinhas(texto: string, linhas: LinhaCronograma[]): LinhaCronograma[] {
  const fonte = normalizarTexto(texto);
  const vistas = new Set<string>();
  const ok: LinhaCronograma[] = [];
  for (const l of linhas) {
    if (typeof l?.etapa !== 'string' || typeof l?.quando !== 'string') continue;
    const etapa = normalizarTexto(l.etapa);
    const quando = normalizarTexto(l.quando);
    if (etapa.length < 5 || !/\d/.test(quando) || quando.length > 80) continue;
    // Nome inteiro; se a IA corrigiu alguma letra, os últimos 40 caracteres.
    let i = fonte.indexOf(etapa);
    let fimEtapa = i + etapa.length;
    if (i < 0 && etapa.length > 40) {
      const cauda = etapa.slice(-40);
      i = fonte.indexOf(cauda);
      fimEtapa = i + cauda.length;
    }
    if (i < 0) continue;
    const q = fonte.indexOf(quando, fimEtapa);
    if (q < 0 || q - fimEtapa > MAX_DISTANCIA) continue;
    // A data tem de ser a primeira depois do nome: outra data no meio é a da etapa seguinte.
    if (/\d{1,2}\/\d{1,2}|\d{1,2}[oº°]? de [a-z]+ de \d{4}/.test(fonte.slice(fimEtapa, q))) continue;
    const chave = `${chaveEtapa(l.etapa)}|${quando}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    ok.push({ etapa: l.etapa.replace(/\s+/g, ' ').trim(), quando: l.quando.replace(/\s+/g, ' ').trim() });
  }
  return ok;
}

export interface FonteCronograma {
  url: string;
  titulo: string;
  site: string;
  data: string;
  linhas: LinhaDatada[];
}

/** Um documento com pelo menos isto de etapas é um cronograma completo; menos que isso, uma retificação parcial. */
export const MIN_COMPLETO = 8;

/**
 * Junta as versões de um processo: o documento completo mais recente e, por cima, as retificações mais novas
 * que ele (a mais nova vence em cada etapa). Cada linha guarda de que fonte veio.
 */
export function juntarVersoes(fontes: FonteCronograma[]): { linha: LinhaDatada; fonte: FonteCronograma }[] {
  const ordem = [...fontes].sort((a, b) => b.data.localeCompare(a.data));
  const base = ordem.find((f) => f.linhas.length >= MIN_COMPLETO) ?? ordem[0];
  if (!base) return [];
  const saida = base.linhas.map((linha) => ({ linha, fonte: base }));
  const posicao = new Map(saida.map((x, i) => [chaveEtapa(x.linha.etapa), i]));
  // Das mais antigas para as mais novas: a última a escrever vence.
  for (const f of ordem.filter((f) => f !== base && f.data > base.data).reverse()) {
    for (const linha of f.linhas) {
      const k = chaveEtapa(linha.etapa);
      const i = posicao.get(k);
      if (i === undefined) {
        posicao.set(k, saida.length);
        saida.push({ linha, fonte: f });
      } else saida[i] = { linha, fonte: f };
    }
  }
  return saida;
}
