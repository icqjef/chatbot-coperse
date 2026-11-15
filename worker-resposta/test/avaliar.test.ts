import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';
import { assinar } from '../src/historico';

const ORIGEM = 'https://sisu.furg.br';
const CHAVE = 'CHAVE-SECRETA-123';

function montar(opcoes: { falhar?: boolean; filtro?: boolean } = {}) {
  const gravados: unknown[][] = [];
  const db = {
    prepare: () => ({
      bind: (...p: unknown[]) => ({
        // SELECT url FROM paginas: só esta URL existe no índice
        all: async () => ({ results: p.includes('https://sisu.furg.br/edital') ? [{ url: 'https://sisu.furg.br/edital' }] : [] }),
        run: async () => {
          if (opcoes.falhar) throw new Error('d1');
          gravados.push(p);
          return {};
        },
      }),
    }),
  } as unknown as D1Database;
  const env = {
    DB: db,
    GEMINI_API_KEY: CHAVE,
    FILTRO: { limit: async () => ({ success: opcoes.filtro ?? true }) },
  } as unknown as Env;
  return { env, gravados };
}

async function avaliar(env: Env, corpo: unknown, origem = ORIGEM) {
  return worker.fetch(
    new Request('https://chatbot.example/avaliar', {
      method: 'POST',
      headers: { Origin: origem, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
      body: JSON.stringify(corpo),
    }),
    env,
  );
}

describe('POST /avaliar', () => {
  it('guarda só as fontes que existem no índice', async () => {
    const { env, gravados } = montar();
    const resposta = 'R [1].';
    const fontes = ['https://sisu.furg.br/edital', 'https://mal.example/x', 'javascript:alert(1)', 7];
    expect((await avaliar(env, { util: false, resposta, fontes, assinatura: await assinar(resposta, CHAVE) })).status).toBe(200);
    expect(gravados[0]![3]).toBe(JSON.stringify(['https://sisu.furg.br/edital']));
  });
  it('grava dia, voto e resposta; nunca a pergunta nem o IP', async () => {
    const { env, gravados } = montar();
    const resposta = 'O prazo é 10/12/2026 [1].';
    const r = await avaliar(env, { util: false, pergunta: 'meu CPF 123.456.789-09, qual o prazo?', resposta, assinatura: await assinar(resposta, CHAVE) });
    expect(JSON.stringify(gravados)).not.toContain('CPF');
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(gravados).toHaveLength(1);
    const [dia, util, guardada, fontes] = gravados[0]!;
    expect(fontes).toBeNull();
    expect(dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(util).toBe(0);
    expect(guardada).toBe(resposta);
    expect(JSON.stringify(gravados)).not.toContain('203.0.113.7');
  });
  it('assinatura inválida ou ausente -> 400 sem gravar', async () => {
    const { env, gravados } = montar();
    expect((await avaliar(env, { util: true, pergunta: 'x?', resposta: 'texto inventado', assinatura: 'a'.repeat(43) })).status).toBe(400);
    expect((await avaliar(env, { util: true, pergunta: 'x?', resposta: 'texto inventado' })).status).toBe(400);
    expect(gravados).toHaveLength(0);
  });
  it('formato inválido -> 400', async () => {
    const { env } = montar();
    const resposta = 'ok';
    const assinatura = await assinar(resposta, CHAVE);
    for (const c of [{ util: 'sim', resposta, assinatura }, { util: true, resposta: '', assinatura }, { util: true, resposta: 'x'.repeat(2001), assinatura }]) {
      expect((await avaliar(env, c)).status).toBe(400);
    }
  });
  it('origem não permitida -> 403', async () => {
    const { env } = montar();
    expect((await avaliar(env, {}, 'https://mal.example')).status).toBe(403);
  });
  it('filtro barrando -> 429', async () => {
    const { env } = montar({ filtro: false });
    const resposta = 'ok';
    expect((await avaliar(env, { util: true, pergunta: 'x', resposta, assinatura: await assinar(resposta, CHAVE) })).status).toBe(429);
  });
  it('falha no D1 -> 503', async () => {
    const { env } = montar({ falhar: true });
    const resposta = 'ok';
    expect((await avaliar(env, { util: true, pergunta: 'x', resposta, assinatura: await assinar(resposta, CHAVE) })).status).toBe(503);
  });
  it('OPTIONS /avaliar -> 204 com CORS', async () => {
    const { env } = montar();
    const r = await worker.fetch(new Request('https://chatbot.example/avaliar', { method: 'OPTIONS', headers: { Origin: ORIGEM } }), env);
    expect(r.status).toBe(204);
  });
});
