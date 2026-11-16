/**
 * Contagem das perguntas por dia e desfecho, e registro do texto das perguntas (ligado pelo Jeferson em
 * 2026-11-15 com REGISTRAR_PERGUNTAS="true"). O texto chega aqui já com CPF, e-mail e telefone
 * mascarados, não leva IP nem identificador e é apagado depois de 90 dias.
 */
import { diaSaoPaulo } from './limites';
import { SEM_BASE } from './regras';
import { ENCERRAMENTO } from './conversa';

/** `limite`: barrada porque a cota diária do assistente acabou. */
export type TipoPergunta = 'respondida' | 'sem_base' | 'recusa' | 'conversa' | 'limite';

export const DIAS_REGISTRO = 90;
const MAX_TEXTO = 500;
const MS_DIA = 86_400_000;

export function tipoDaResposta(r: { resposta: string; fontes: unknown[]; contato: boolean }, social: boolean): TipoPergunta {
  if (social || r.resposta === ENCERRAMENTO) return 'conversa';
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

/**
 * Soma 1 no dia e tipo e, com `registrar`, guarda o texto (menos saudações e conversa) e apaga o que
 * passou de 90 dias, tudo num lote só. Falha no D1 não atrapalha a resposta ao candidato.
 */
/** Faixas do tempo até a resposta completa, em segundos (limite superior). */
export const FAIXAS_TEMPO = [
  ['ate1', 1],
  ['ate2', 2],
  ['ate3', 3],
  ['ate5', 5],
  ['ate10', 10],
] as const;

export function faixaDoTempo(ms: number): string {
  for (const [nome, s] of FAIXAS_TEMPO) if (ms <= s * 1000) return nome;
  return 'mais10';
}

/** `ms`: tempo até a resposta completa; soma 1 na faixa do dia (saudações e conversa não entram). */
export async function contarPergunta(
  db: D1Database,
  tipo: TipoPergunta,
  agora: Date,
  registro?: { pergunta: string },
  ms?: number,
): Promise<void> {
  const dia = diaSaoPaulo(agora);
  try {
    const lote = [
      db
        .prepare('INSERT INTO contagem_perguntas (dia, tipo, n) VALUES (?, ?, 1) ON CONFLICT (dia, tipo) DO UPDATE SET n = n + 1')
        .bind(dia, tipo),
    ];
    if (ms !== undefined && tipo !== 'conversa' && tipo !== 'limite') {
      lote.push(
        db
          .prepare('INSERT INTO tempo_resposta (dia, faixa, n) VALUES (?, ?, 1) ON CONFLICT (dia, faixa) DO UPDATE SET n = n + 1')
          .bind(dia, faixaDoTempo(ms)),
      );
    }
    if (registro && tipo !== 'conversa') {
      lote.push(
        db.prepare('INSERT INTO perguntas_registro (dia, tipo, pergunta) VALUES (?, ?, ?)').bind(dia, tipo, registro.pergunta.slice(0, MAX_TEXTO)),
        db.prepare('DELETE FROM perguntas_registro WHERE dia < ?').bind(diaSaoPaulo(new Date(agora.getTime() - DIAS_REGISTRO * MS_DIA))),
      );
    }
    await db.batch(lote);
  } catch {
    console.error('Falha ao contar a pergunta');
  }
}
