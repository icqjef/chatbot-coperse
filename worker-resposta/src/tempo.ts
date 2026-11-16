/**
 * Conferência das datas na resposta do modelo:
 * - tempo verbal: verbo no passado junto de data futura ("foi realizada em 22/11/2026") ou no futuro
 *   junto de data passada;
 * - "Fique atento:" com prazo que já passou.
 * Sem dependências e só com sintaxe que o Node remove sozinho: o teste de qualidade
 * (avaliacao/verificar.mjs) importa este mesmo arquivo.
 */

const DATA = /(?<!\d)(\d{2})\/(\d{2})\/(\d{4})(?!\d)/g;
/** Quanto texto antes da data é olhado em busca do verbo. */
const JANELA = 60;

const PASSADO = [
  'foi', 'foram', 'ocorreu', 'ocorreram', 'aconteceu', 'aconteceram', 'terminou', 'terminaram', 'encerrou',
  'encerraram', 'começou', 'começaram', 'iniciou', 'iniciaram', 'teve', 'tiveram', 'saiu', 'saíram', 'esteve',
  'estiveram', 'realizou', 'realizaram', 'aplicou', 'aplicaram',
];
const FUTURO = [
  'será', 'serão', 'ocorrerá', 'ocorrerão', 'acontecerá', 'acontecerão', 'terminará', 'terminarão', 'encerrará',
  'encerrarão', 'começará', 'começarão', 'iniciará', 'iniciarão', 'terá', 'terão', 'sairá', 'sairão', 'estará',
  'estarão', 'realizará', 'realizarão', 'aplicará', 'aplicarão', 'vai', 'vão',
];
/** Verbos no presente: se o último verbo antes da data é um destes, não há o que conferir ("a prova é em"). */
const NEUTRO = ['é', 'são', 'está', 'estão', 'ocorre', 'acontece', 'termina', 'começa', 'fica', 'ficam', 'vale', 'valem'];
/** "foram prorrogadas até 20/12": o passado é da mudança, não do prazo. */
const MUDANCA = /prorrogad|adiad|alterad|remarcad|antecipad|transferid|estendid|retificad|publicad|divulgad/;
/** "foi divulgada em 08/12/2026": a data é da própria divulgação, então o tempo é conferido. */
const SO_DIVULGACAO = /^\s*(?:publicad|divulgad)[ao]s?\s+(?:em|até|no dia|dia|a partir de)\s*$/u;
/** Troca de tempo, posição a posição (PASSADO[i] ↔ FUTURO[i]); "vai" e "vão" ficam sem par. */
const PARA_FUTURO = new Map(PASSADO.map((v, i) => [v, FUTURO[i]!] as const));
const PARA_PASSADO = new Map(PASSADO.map((v, i) => [FUTURO[i]!, v] as const));

const VERBO = new RegExp(`(?<!\\p{L})(${[...PASSADO, ...FUTURO, ...NEUTRO].join('|')})(?!\\p{L})`, 'gu');
const TEMPO = new Map<string, 'passado' | 'futuro' | 'neutro'>([
  ...PASSADO.map((v) => [v, 'passado'] as const),
  ...FUTURO.map((v) => [v, 'futuro'] as const),
  ...NEUTRO.map((v) => [v, 'neutro'] as const),
]);

export interface ProblemaTempo {
  data: string;
  verbo: string;
  esperado: 'futuro' | 'passado';
  /** Onde o verbo começa no texto. */
  posicao: number;
}

const iso = (m: RegExpMatchArray) => `${m[3]}-${m[2]}-${m[1]}`;

/** Erros de tempo verbal perto de datas dd/mm/aaaa. `hoje` em AAAA-MM-DD (Brasília). */
export function problemasDeTempo(texto: string, hoje: string): ProblemaTempo[] {
  const out: ProblemaTempo[] = [];
  let base = 0;
  // O separador fica no resultado (grupo de captura) para a posição de cada frase no texto ser conhecida.
  for (const frase of texto.split(/((?<=[.!?])\s+|\n+)/)) {
    const deslocamento = base;
    base += frase.length;
    let inicio = 0;
    for (const m of frase.matchAll(DATA)) {
      const comeco = Math.max(inicio, m.index! - JANELA);
      const antes = frase.slice(comeco, m.index).toLowerCase();
      inicio = m.index! + m[0].length;
      const verbos = [...antes.matchAll(VERBO)];
      const ultimo = verbos[verbos.length - 1];
      if (!ultimo) continue;
      const depois = antes.slice(ultimo.index! + ultimo[0].length);
      if (MUDANCA.test(depois) && !SO_DIVULGACAO.test(depois)) continue;
      const tempo = TEMPO.get(ultimo[1]!);
      const data = iso(m);
      const posicao = deslocamento + comeco + ultimo.index!;
      if (data > hoje && tempo === 'passado') out.push({ data: m[0], verbo: ultimo[1]!, esperado: 'futuro', posicao });
      else if (data < hoje && tempo === 'futuro') out.push({ data: m[0], verbo: ultimo[1]!, esperado: 'passado', posicao });
    }
  }
  return out;
}

/**
 * Último recurso, quando a reescrita pelo modelo não resolveu: troca cada verbo errado pelo par no tempo certo
 * ("foram realizadas em 13/12/2026" → "serão realizadas"), mantendo a maiúscula inicial.
 */
export function corrigirTempo(texto: string, hoje: string): string {
  let saida = texto;
  // Do fim para o começo, para as posições anteriores continuarem valendo.
  for (const p of problemasDeTempo(texto, hoje).sort((a, b) => b.posicao - a.posicao)) {
    const novo = (p.esperado === 'futuro' ? PARA_FUTURO : PARA_PASSADO).get(p.verbo);
    if (!novo) continue;
    const original = saida.slice(p.posicao, p.posicao + p.verbo.length);
    const troca = original[0] !== original[0]!.toLowerCase() ? novo[0]!.toUpperCase() + novo.slice(1) : novo;
    saida = saida.slice(0, p.posicao) + troca + saida.slice(p.posicao + p.verbo.length);
  }
  return saida;
}

/** Tira as linhas "Fique atento:" cujas datas já passaram todas (a regra 12 só vale para prazo por vir). */
export function semAvisoVencido(texto: string, hoje: string): string {
  return texto
    .split('\n')
    .filter((linha) => {
      if (!/^\s*fique atento\b/i.test(linha)) return true;
      const datas = [...linha.matchAll(DATA)].map(iso);
      return datas.length === 0 || datas.some((d) => d >= hoje);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** dd/mm/aaaa de AAAA-MM-DD. */
export const dataBrDe = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Instrução acrescentada ao sistema para o modelo reescrever a resposta com o tempo certo. */
export function correcaoDeTempo(problemas: ProblemaTempo[], hoje: string): string {
  const itens = problemas.map((p) =>
    p.esperado === 'futuro'
      ? `${p.data} é depois de hoje: use o futuro ("será", "ocorrerá"), não "${p.verbo}".`
      : `${p.data} já passou: use o passado ("foi", "ocorreu"), não "${p.verbo}".`,
  );
  return `\n\nCorreção obrigatória: numa versão anterior desta resposta o tempo verbal não combinou com as datas. Hoje é ${dataBrDe(hoje)}. ${itens.join(' ')} Escreva a resposta inteira de novo, seguindo todas as regras.`;
}
