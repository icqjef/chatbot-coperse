import { describe, it, expect } from 'vitest';
import worker, { type Env } from '../src/index';

const env = { DB: {}, VECTORIZE: {}, AMBIENTE: 'teste' } as unknown as Env;
const base = 'https://chatbot.example';

describe('rotas', () => {
  it('GET /saude responde pelo D1', async () => {
    const db = {
      prepare: () => ({ first: async () => ({ n: 0 }) }),
    } as unknown as D1Database;
    const r = await worker.fetch(new Request(`${base}/saude`), { ...env, DB: db });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, fila: 0 });
  });
  it('GET /widget.js', async () => {
    const r = await worker.fetch(new Request(`${base}/widget.js`), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('javascript');
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await r.text()).toContain('chatbot-coperse');
  });
  it('OPTIONS /perguntar com origem não permitida -> 403', async () => {
    const r = await worker.fetch(
      new Request(`${base}/perguntar`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      env,
    );
    expect(r.status).toBe(403);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('OPTIONS /perguntar com origem permitida -> 204 com CORS', async () => {
    const r = await worker.fetch(
      new Request(`${base}/perguntar`, { method: 'OPTIONS', headers: { Origin: 'https://coperse.furg.br' } }),
      env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://coperse.furg.br');
    expect(r.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
  it('rota desconhecida -> 404', async () => {
    const r = await worker.fetch(new Request(`${base}/nada`), env);
    expect(r.status).toBe(404);
  });
});
