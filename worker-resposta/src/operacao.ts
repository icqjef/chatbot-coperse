import { chaveLimite, json } from './perguntar';
import type { Env } from './index';

const MIN_SENHA = 16;
const MSG_INDISPONIVEL = 'Operação indisponível.';

async function sha256(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/** Compara os SHA-256 dos dois textos (mesmo tamanho sempre), sem vazar tamanho nem posição da diferença. */
export async function iguaisEmTempoConstante(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  // timingSafeEqual existe no runtime do Workers; o Node dos testes não o tem, então há laço próprio.
  const nativo = (crypto.subtle as unknown as { timingSafeEqual?: (x: Uint8Array, y: Uint8Array) => boolean })
    .timingSafeEqual;
  if (typeof nativo === 'function') return nativo.call(crypto.subtle, ha, hb);
  let dif = 0;
  for (let i = 0; i < ha.length; i++) dif |= ha[i]! ^ hb[i]!;
  return dif === 0;
}

async function contar(db: D1Database, sql: string): Promise<number> {
  const linha = await db.prepare(sql).first<{ n: number }>();
  return linha?.n ?? 0;
}

export async function tratarSaude(env: Pick<Env, 'DB'>): Promise<Response> {
  try {
    const ultima = await env.DB.prepare(
      'SELECT inicio, fim, paginas, erros FROM execucoes ORDER BY id DESC LIMIT 1',
    ).first<{ inicio: string; fim: string | null; paginas: number; erros: number }>();
    const fila = await contar(env.DB, 'SELECT COUNT(*) AS n FROM fila');
    const paginasOk = await contar(env.DB, "SELECT COUNT(*) AS n FROM paginas WHERE status = 'ok'");
    return json({ ok: true, ultima_indexacao: ultima ?? null, fila, paginas_ok: paginasOk }, 200, {});
  } catch {
    return json({ ok: false }, 503, {});
  }
}

export async function tratarReindexar(req: Request, env: Env): Promise<Response> {
  if (!env.REINDEX_TOKEN || env.REINDEX_TOKEN.length < MIN_SENHA || !env.GITHUB_TOKEN) {
    return json({ erro: MSG_INDISPONIVEL }, 503, {});
  }
  // O limite vem antes da senha, para também frear tentativas de adivinhá-la.
  const ip = req.headers.get('CF-Connecting-IP') || 'sem-ip';
  const { success } = await env.LIMITADOR.limit({ key: await chaveLimite(ip, new Date()) });
  if (!success) return json({ erro: 'Muitas chamadas. Aguarde um minuto.' }, 429, {});

  const enviado = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1] ?? '';
  if (!(await iguaisEmTempoConstante(enviado, env.REINDEX_TOKEN))) {
    return json({ erro: 'Não autorizado.' }, 401, {});
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'chatbot-coperse',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );
    if (r.status !== 204) {
      console.error('GitHub recusou a reindexação: HTTP', r.status);
      return json({ erro: 'O GitHub não aceitou o pedido.' }, 502, {});
    }
  } catch {
    console.error('Falha de rede ao chamar o GitHub');
    return json({ erro: 'O GitHub não aceitou o pedido.' }, 502, {});
  }
  return json({ ok: true }, 202, {});
}
