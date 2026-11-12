import { carregarOrigens } from '@chatbot/comum';
import origensJson from '../../config/origens.json';
import { cabecalhosCors } from './cors';
import { WIDGET_TESTE } from './widget-teste';

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AMBIENTE: string;
}

const ORIGENS = carregarOrigens(origensJson);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    void env;
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/saude') {
      return Response.json({ ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/widget.js') {
      return new Response(WIDGET_TESTE, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    if (req.method === 'OPTIONS' && url.pathname === '/perguntar') {
      const cors = cabecalhosCors(req.headers.get('Origin'), ORIGENS);
      if (Object.keys(cors).length === 0) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    return new Response('Não encontrado', { status: 404 });
  },
};
