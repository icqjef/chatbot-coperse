/**
 * POST /avaliar: "Esta resposta ajudou?" (👍/👎). Grava só o dia, o voto, o começo da resposta do
 * bot e as páginas citadas nela (só URLs que existem no índice). A pergunta do candidato não é gravada (registro de perguntas desligado, decisão de 2026-11-12),
 * nem IP ou identificador. Só aceita resposta com a assinatura do Worker (M4): ninguém grava texto
 * inventado como se fosse do bot.
 */
import { assinaturaValida } from './historico';
import { cabecalhosCors, origemPermitida } from './cors';
import { diaSaoPaulo } from './limites';
import type { FiltroNativo } from './limites';
import { chaveLimite, json } from './perguntar';
import { mascararDadosPessoais } from './regras';

export interface EnvAvaliar {
  DB: D1Database;
  FILTRO?: FiltroNativo;
  GEMINI_API_KEY: string;
}

const MAX_CORPO = 8 * 1024;
const MAX_RESPOSTA = 2000;
const GUARDA_RESPOSTA = 600;
const MAX_FONTES = 8;

/** URLs enviadas pelo widget que existem na tabela `paginas`; o resto é descartado. */
async function fontesConhecidas(db: D1Database, x: unknown): Promise<string[]> {
  if (!Array.isArray(x)) return [];
  const urls = [...new Set(x.filter((u): u is string => typeof u === 'string' && u.length <= 500 && /^https:\/\//.test(u)))].slice(0, MAX_FONTES);
  if (!urls.length) return [];
  const r = await db
    .prepare(`SELECT url FROM paginas WHERE url IN (${urls.map(() => '?').join(',')})`)
    .bind(...urls)
    .all<{ url: string }>();
  const existem = new Set(r.results.map((l) => l.url));
  return urls.filter((u) => existem.has(u));
}

export async function tratarAvaliar(req: Request, env: EnvAvaliar, origens: string[], agora = new Date()): Promise<Response> {
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);
  if (env.FILTRO) {
    const ip = req.headers.get('CF-Connecting-IP') || 'sem-ip';
    try {
      const { success } = await env.FILTRO.limit({ key: `avaliar:${await chaveLimite(ip, agora)}` });
      if (!success) return json({ erro: 'Muitas avaliações em pouco tempo.' }, 429, cors);
    } catch {
      // filtro fora do ar: segue (a assinatura já impede gravar texto inventado)
    }
  }
  const texto = await req.text();
  if (texto.length > MAX_CORPO) return json({ erro: 'Avaliação inválida.' }, 400, cors);
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return json({ erro: 'Avaliação inválida.' }, 400, cors);
  }
  const { util, resposta, assinatura, fontes } = c ?? {};
  if (typeof util !== 'boolean' || typeof resposta !== 'string' || !resposta || resposta.length > MAX_RESPOSTA) {
    return json({ erro: 'Avaliação inválida.' }, 400, cors);
  }
  if (!env.GEMINI_API_KEY || !(await assinaturaValida(resposta, assinatura, env.GEMINI_API_KEY))) {
    return json({ erro: 'Avaliação inválida.' }, 400, cors);
  }
  try {
    const urls = await fontesConhecidas(env.DB, fontes);
    await env.DB.prepare('INSERT INTO avaliacoes (dia, util, resposta, fontes) VALUES (?, ?, ?, ?)')
      .bind(diaSaoPaulo(agora), util ? 1 : 0, mascararDadosPessoais(resposta.slice(0, GUARDA_RESPOSTA)), urls.length ? JSON.stringify(urls) : null)
      .run();
  } catch {
    console.error('Falha ao gravar avaliação');
    return json({ erro: 'Não foi possível registrar a avaliação.' }, 503, cors);
  }
  return json({ ok: true }, 200, cors);
}
