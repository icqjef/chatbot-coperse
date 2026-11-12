import type { Trecho } from './busca';

export const SEM_BASE =
  'Não encontrei essa informação nas páginas da COPERSE. Consulte o edital oficial do processo seletivo ou escreva para coperse@furg.br.';

const REGRAS = `Você é o assistente virtual da COPERSE (Comissão Permanente do Processo Seletivo) da FURG. Responde a candidatos sobre os processos seletivos de ingresso da FURG (Vestibular, SiSU e processos específicos).
Regras:
1. Responda somente com base nos trechos numerados abaixo. Não use conhecimento próprio.
2. Cite a fonte de cada informação com o número do trecho entre colchetes, por exemplo [2]. Não escreva endereços de páginas.
3. Se os trechos não trazem a resposta, diga que não encontrou a informação e oriente consultar o edital oficial ou escrever para coperse@furg.br.
4. Não opine sobre a situação individual do candidato (homologação, recurso, nota, classificação). Oriente a consultar o sistema de inscrição ou a COPERSE.
5. Recuse com educação perguntas que não sejam sobre os processos seletivos da FURG.
6. Não peça nem repita dados pessoais (CPF, nome, e-mail, telefone).
7. Se trechos se contradizem, prevalece o mais recente; informe a data dele.
8. Responda sobre a edição mais recente do processo perguntado e diga qual é (por exemplo, "No Vestibular 2027"). Se só houver informação de edição passada, diga isso e não a apresente como atual.
9. Responda em português do Brasil, de forma curta e direta.`;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
// Telefone brasileiro: DDD obrigatório, 8 ou 9 dígitos (10-11 no total).
const TELEFONE = /(?<![\d/])(?:\+?55\s?)?(?:\(\d{2}\)|\d{2})\s?9?\d{4}-?\d{4}(?![\d/])/g;

/** Substitui CPF, e-mail e telefone brasileiro por [removido]. */
export function mascararDadosPessoais(t: string): string {
  return t.replace(EMAIL, '[removido]').replace(CPF, '[removido]').replace(TELEFONE, '[removido]');
}

function dataBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function montarSistema(trechos: Trecho[], hoje: Date): string {
  const blocos = trechos.map(
    (t, i) =>
      `[${i + 1}] ${t.titulo} — ${t.site} — ${t.processo} ${t.ano} — publicado em ${dataBr(t.data)}\n${t.texto}`,
  );
  return `${REGRAS}\nHoje é ${dataBr(hoje.toISOString())}.\n\nTrechos:\n\n${blocos.join('\n\n')}`;
}

export interface Fonte {
  titulo: string;
  url: string;
  site: string;
  data: string;
}

/** Fontes só a partir dos números [n] citados; números inexistentes saem da resposta. */
export function extrairFontes(resposta: string, trechos: Trecho[]): { resposta: string; fontes: Fonte[] } {
  const fontes: Fonte[] = [];
  const urls = new Set<string>();
  const limpa = resposta.replace(/\[(\d{1,3})\]/g, (_m, num: string) => {
    const t = trechos[Number(num) - 1];
    if (!t) return '';
    if (!urls.has(t.url)) {
      urls.add(t.url);
      fontes.push({ titulo: t.titulo, url: t.url, site: t.site, data: t.data });
    }
    return `[${num}]`;
  });
  return { resposta: limpa.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1'), fontes };
}
