/**
 * Aviso de retificação (checklist, item 5). Se a resposta cita um documento anterior à última retificação de
 * edital ou cronograma da mesma edição, avisa e aponta o documento retificado. Se já cita a retificação (ou
 * documento mais novo), diz que ela foi considerada, nos 60 dias depois de publicada.
 */
import type { Trecho } from './busca';

export interface Retificacao {
  url: string;
  titulo: string;
  data: string;
}

export interface Aviso {
  tipo: 'info' | 'atencao';
  texto: string;
  url: string;
  titulo: string;
}

/** Retificação de edital ou cronograma (não de lista de candidatos): pelo título ou pelo nome do arquivo. */
const DE_EDITAL = /(edital|cronograma)[^|]*retifica|retifica[^|]*(edital|cronograma)|_ret\.pdf$/i;
const DIAS_INFO = 60;
const MS_DIA = 86_400_000;

export function ehRetificacaoDeEdital(titulo: string, url: string): boolean {
  return DE_EDITAL.test(`${titulo} | ${url}`) || DE_EDITAL.test(url);
}

export async function ultimaRetificacao(db: D1Database, processo: string, ano: number): Promise<Retificacao | null> {
  const { results } = await db
    .prepare(
      `SELECT url, titulo, data_publicacao FROM paginas
       WHERE status = 'ok' AND processo = ? AND ano = ? AND tipo != 'lista'
         AND (lower(titulo) LIKE '%retifica%' OR lower(url) LIKE '%retifica%' OR lower(url) LIKE '%\\_ret.pdf' ESCAPE '\\')
       ORDER BY data_publicacao DESC LIMIT 10`,
    )
    .bind(processo, ano)
    .all<{ url: string; titulo: string; data_publicacao: string }>();
  const r = results.find((l) => ehRetificacaoDeEdital(l.titulo, l.url));
  return r ? { url: r.url, titulo: r.titulo, data: r.data_publicacao } : null;
}

/** Processo e edição da resposta: o primeiro trecho citado que é de um processo (não "geral"). */
export function edicaoCitada(citados: Trecho[]): { processo: string; ano: number } | null {
  const t = citados.find((x) => x.processo && x.processo !== 'geral' && x.ano != null);
  return t ? { processo: t.processo, ano: t.ano! } : null;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function decidirAviso(citados: Trecho[], r: Retificacao | null, hoje: Date): Aviso | null {
  if (!r) return null;
  const dataR = r.data.slice(0, 10);
  const doMesmo = citados.filter((t) => t.url !== r.url);
  const citaNova = citados.some((t) => t.url === r.url || t.data.slice(0, 10) >= dataR);
  const citaAntiga = doMesmo.some((t) => t.data.slice(0, 10) < dataR);
  if (citaAntiga && !citaNova) {
    return {
      tipo: 'atencao',
      texto: `Atenção: houve retificação em ${dataBr(dataR)}, depois de uma das páginas usadas nesta resposta. Confira o documento retificado:`,
      url: r.url,
      titulo: r.titulo,
    };
  }
  if (citaNova && (hoje.getTime() - Date.parse(dataR)) / MS_DIA <= DIAS_INFO) {
    return { tipo: 'info', texto: `Esta resposta considera a retificação publicada em ${dataBr(dataR)}:`, url: r.url, titulo: r.titulo };
  }
  return null;
}
