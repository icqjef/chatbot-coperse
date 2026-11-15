/**
 * Contagem das perguntas por dia e desfecho, para o painel e o resumo semanal. Guarda só o número:
 * o texto da pergunta não é gravado (registro de perguntas desligado, decisão de 2026-11-12).
 */
import { diaSaoPaulo } from './limites';
import { SEM_BASE } from './regras';

export type TipoPergunta = 'respondida' | 'sem_base' | 'recusa' | 'conversa';

export function tipoDaResposta(r: { resposta: string; fontes: unknown[]; contato: boolean }, social: boolean): TipoPergunta {
  if (social) return 'conversa';
  if (r.fontes.length) return 'respondida';
  return r.resposta.includes(SEM_BASE) ? 'sem_base' : 'recusa';
}

/**
 * Só conta perguntas vindas dos sites da FURG: a página de teste e a avaliação automática
 * (`avaliar.mjs`) usam a origem do próprio Worker (*.workers.dev) e ficariam misturadas aos candidatos.
 */
export function contaNoPainel(origem: string): boolean {
  try {
    return !new URL(origem).hostname.endsWith('.workers.dev');
  } catch {
    return false;
  }
}

/** Soma 1 no dia e tipo. Falha no D1 não atrapalha a resposta ao candidato. */
export async function contarPergunta(db: D1Database, tipo: TipoPergunta, agora: Date): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO contagem_perguntas (dia, tipo, n) VALUES (?, ?, 1) ON CONFLICT (dia, tipo) DO UPDATE SET n = n + 1')
      .bind(diaSaoPaulo(agora), tipo)
      .run();
  } catch {
    console.error('Falha ao contar a pergunta');
  }
}
