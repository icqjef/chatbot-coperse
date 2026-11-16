/**
 * Cache das respostas às perguntas repetidas ("quando é a prova?"): a mesma pergunta, no mesmo dia e
 * em até 2 horas, recebe a mesma resposta sem chamar o Gemini nem gastar a cota. Só vale para a
 * primeira pergunta da conversa (seguimentos dependem do histórico) e para respostas com fonte.
 * A chave é o SHA-256 do texto normalizado e do dia; a pergunta em si não é guardada.
 */
import { diaSaoPaulo } from './limites';
import type { Resultado } from './perguntar';

export const TTL_MS = 2 * 3_600_000;

/** Minúsculas, sem acento, sem pontuação e com espaços simples: "Quando é a prova?" = "quando e a prova". */
export function normalizar(pergunta: string): string {
  return pergunta
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** `contexto`: processo da página onde o widget está ("quando sai o resultado?" muda de resposta entre sites). */
export async function chaveCache(pergunta: string, agora: Date, contexto = ''): Promise<string> {
  const dados = new TextEncoder().encode(`${diaSaoPaulo(agora)}|${contexto}|${normalizar(pergunta)}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', dados));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Falha no D1 vale como "não está no cache". */
export async function lerCache(db: D1Database, chave: string, agora: Date): Promise<Resultado | null> {
  try {
    const linha = await db
      .prepare('SELECT resultado FROM respostas_cache WHERE chave = ? AND criado >= ?')
      .bind(chave, agora.getTime() - TTL_MS)
      .first<{ resultado: string }>();
    if (!linha) return null;
    const r = JSON.parse(linha.resultado) as Resultado;
    return Array.isArray(r.fontes) && r.fontes.length > 0 && typeof r.resposta === 'string' ? r : null;
  } catch {
    return null;
  }
}

/** Grava e apaga o que venceu, num lote só. Falha no D1 não atrapalha a resposta. */
export async function gravarCache(db: D1Database, chave: string, r: Resultado, agora: Date): Promise<void> {
  if (r.fontes.length === 0) return;
  try {
    await db.batch([
      db
        .prepare('INSERT OR REPLACE INTO respostas_cache (chave, resultado, criado) VALUES (?, ?, ?)')
        .bind(chave, JSON.stringify({ resposta: r.resposta, fontes: r.fontes, sugestoes: r.sugestoes, contato: r.contato, ...(r.aviso ? { aviso: r.aviso } : {}), ...(r.oficial ? { oficial: true } : {}) }), agora.getTime()),
      db.prepare('DELETE FROM respostas_cache WHERE criado < ?').bind(agora.getTime() - TTL_MS),
    ]);
  } catch {
    console.error('Falha ao gravar o cache');
  }
}
