import { carregarOrigens } from '@chatbot/comum';
import origensJson from '../../config/origens.json';
import { cabecalhosCors, origemPermitida } from './cors';
import { tratarReindexar, tratarSaude } from './operacao';
import { comFiltro, criarLimites, type CotaDiaria, type FiltroNativo } from './limites';
import { tratarPerguntar, type RateLimit } from './perguntar';
import { tratarAvaliar } from './avaliar';
import { paginaPainel, scriptPainel, tratarPainelDados } from './painel';
import { WIDGET } from './widget-gerado';
import { DEMO_HTML } from './demo';
import { paginaPrivacidade } from './privacidade';

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  /** Durable Object dos limites (produção). Sem ele (testes), valem LIMITADOR e COTA do próprio env. */
  LIMITES?: DurableObjectNamespace;
  /** Limitador nativo da Cloudflare, antes do DO (M6). */
  FILTRO?: FiltroNativo;
  LIMITADOR: RateLimit;
  COTA?: CotaDiaria;
  LIMITE_POR_MINUTO?: string;
  LIMITE_DIARIO_VISITANTE?: string;
  COTA_DIARIA?: string;
  AMBIENTE: string;
  PROVEDOR_LLM: string;
  MODELO_RESPOSTA: string;
  MODELO_RESERVA?: string;
  MODELO_EMBEDDING: string;
  DIMENSAO_EMBEDDING: string;
  LIMIAR_SIMILARIDADE: string;
  GEMINI_API_KEY: string;
  REGISTRAR_PERGUNTAS?: string;
  REINDEX_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW: string;
}

export { Limites } from './limites';

const ORIGENS = carregarOrigens(origensJson);

export default {
  async fetch(req: Request, envBruto: Env, ctx?: ExecutionContext): Promise<Response> {
    let env = envBruto;
    if (envBruto.LIMITES) {
      const { limitador, cota } = criarLimites(envBruto.LIMITES, envBruto);
      env = { ...envBruto, LIMITADOR: comFiltro(envBruto.FILTRO, limitador), COTA: cota };
    }
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/saude') {
      return tratarSaude(req, env);
    }
    if (url.pathname === '/reindexar') {
      if (req.method === 'POST') return tratarReindexar(req, env);
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    if (url.pathname === '/privacidade' && req.method === 'GET') return paginaPrivacidade();
    if (url.pathname === '/painel' && req.method === 'GET') return paginaPainel();
    if (url.pathname === '/painel.js' && req.method === 'GET') return scriptPainel();
    if (url.pathname === '/painel/dados') {
      if (req.method === 'POST') return tratarPainelDados(req, env);
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    if (req.method === 'GET' && url.pathname === '/widget.js') {
      return new Response(WIDGET, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (req.method === 'GET' && url.pathname === '/demo') {
      return new Response(DEMO_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (url.pathname === '/perguntar' || url.pathname === '/avaliar') {
      if (req.method === 'POST') {
        return url.pathname === '/avaliar' ? tratarAvaliar(req, env, ORIGENS) : tratarPerguntar(req, env, ORIGENS, ctx);
      }
      if (req.method === 'OPTIONS') {
        const origem = req.headers.get('Origin');
        const cors = cabecalhosCors(origem, ORIGENS);
        if (!origemPermitida(origem, ORIGENS)) return new Response(null, { status: 403, headers: cors });
        return new Response(null, { status: 204, headers: cors });
      }
      return new Response(null, { status: 405, headers: { ...cabecalhosCors(req.headers.get('Origin'), ORIGENS), Allow: 'POST, OPTIONS' } });
    }
    return new Response('Não encontrado', { status: 404 });
  },
};
