/**
 * Respostas oficiais da COPERSE (checklist, item 2). A equipe escreve no painel a resposta certa de uma pergunta,
 * com a página oficial de fonte; daí em diante a mesma pergunta (ou uma de mesmo sentido, no mesmo processo)
 * recebe essa resposta, sem passar pelo Gemini.
 */
import type { Embedder } from '@chatbot/comum/tipos';
import type { Fonte } from './regras';

/** Semelhança mínima (cosseno dos vetores de pergunta) para usar a resposta oficial. */
export const LIMIAR_OFICIAL = 0.92;
export const MAX_PERGUNTA_OFICIAL = 300;
export const MAX_RESPOSTA_OFICIAL = 1500;

export interface RespostaOficial {
  resposta: string;
  fontes: Fonte[];
  sugestoes: string[];
  contato: false;
  oficial: true;
}

interface Linha {
  id: number;
  resposta: string;
  processo: string | null;
  vetor: string;
  url: string;
  titulo: string;
  site: string;
  data_publicacao: string;
}

function cosseno(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i]! * b[i]!;
  return s; // os vetores do embedder já vêm normalizados
}

/**
 * Melhor resposta oficial ativa para o vetor da pergunta. Processo: se a oficial é de um processo, a pergunta
 * precisa ser do mesmo (a prova do Vestibular não responde pela prova do processo indígena); oficial sem
 * processo vale para qualquer pergunta. A página de fonte precisa continuar no índice.
 */
export async function buscarOficial(db: D1Database, vetor: number[], processo: string | null): Promise<RespostaOficial | null> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.resposta, o.processo, o.vetor, p.url, p.titulo, p.site, p.data_publicacao
       FROM respostas_oficiais o JOIN paginas p ON p.url = o.fonte_url
       WHERE o.ativa = 1 AND p.status = 'ok'`,
    )
    .all<Linha>();
  let melhor: { l: Linha; s: number } | null = null;
  for (const l of results) {
    if (l.processo && l.processo !== processo) continue;
    let v: number[];
    try {
      v = JSON.parse(l.vetor) as number[];
    } catch {
      continue;
    }
    const s = cosseno(vetor, v);
    if (s >= LIMIAR_OFICIAL && (!melhor || s > melhor.s)) melhor = { l, s };
  }
  if (!melhor) return null;
  const { l } = melhor;
  const texto = /\[1\]/.test(l.resposta) ? l.resposta : `${l.resposta.trim()} [1]`;
  return {
    resposta: texto,
    fontes: [{ titulo: l.titulo, url: l.url, site: l.site, data: l.data_publicacao }],
    sugestoes: [],
    contato: false,
    oficial: true,
  };
}

/** O mesmo texto embutido duas vezes na mesma pergunta (resposta oficial e busca) custa uma chamada só. */
export function comMemoria(embedder: Embedder): Embedder {
  const memo = new Map<string, Promise<number[][]>>();
  return {
    embed(textos, tipo) {
      const chave = `${tipo}\u0000${textos.join('\u0001')}`;
      let p = memo.get(chave);
      if (!p) {
        p = embedder.embed(textos, tipo);
        memo.set(chave, p);
        p.catch(() => memo.delete(chave));
      }
      return p;
    },
  };
}
