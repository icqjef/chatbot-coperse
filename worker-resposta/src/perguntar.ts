import { criarEmbedder } from '@chatbot/comum/provedores/embeddings';
import { criarGerador, type Gerador, type Mensagem } from '@chatbot/comum/provedores/geracao';
import { buscarTrechos, type Trecho } from './busca';
import { cabecalhosCors, origemPermitida } from './cors';
import { SEM_BASE, extrairFontes, mascararDadosPessoais, montarSistema, type Fonte } from './regras';

export interface RateLimit {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

export interface EnvPerguntar {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  LIMITADOR: RateLimit;
  PROVEDOR_LLM: string;
  MODELO_RESPOSTA?: string;
  MODELO_EMBEDDING?: string;
  DIMENSAO_EMBEDDING?: string;
  LIMIAR_SIMILARIDADE?: string;
  GEMINI_API_KEY: string;
}

const MAX_PERGUNTA = 500;
const MAX_HISTORICO = 8;
const MAX_MENSAGEM = 2000;
const MAX_CORPO = 30_000;
const LIMIAR_PADRAO = 0.5;

const MSG_LIMITE = 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.';
const MSG_INDISPONIVEL =
  'O assistente está indisponível no momento. Tente de novo em instantes ou escreva para coperse@furg.br.';

export interface EntradaPergunta {
  pergunta: string;
  historico: Mensagem[];
}

export interface DepsResposta {
  buscar: (pergunta: string) => Promise<{ trechos: Trecho[]; melhorSimilaridade: number }>;
  gerador: Gerador;
  agora: () => Date;
}

export async function responderPergunta(
  entrada: EntradaPergunta,
  deps: DepsResposta,
): Promise<{ resposta: string; fontes: Fonte[] }> {
  const { trechos } = await deps.buscar(entrada.pergunta);
  if (trechos.length === 0) return { resposta: SEM_BASE, fontes: [] };
  const bruta = await deps.gerador.gerar(montarSistema(trechos, deps.agora()), [
    ...entrada.historico,
    { papel: 'usuario', texto: entrada.pergunta },
  ]);
  const { resposta, fontes } = extrairFontes(bruta, trechos);
  if (fontes.length === 0) return { resposta: SEM_BASE, fontes: [] };
  return { resposta, fontes };
}

/** sha256(ip + data UTC) em hex: não guarda o IP e renova a cada dia. */
export async function chaveLimite(ip: string, agora: Date): Promise<string> {
  const dia = agora.toISOString().slice(0, 10);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + dia));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validar(corpo: unknown): EntradaPergunta | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const { pergunta, historico = [] } = corpo as Record<string, unknown>;
  if (typeof pergunta !== 'string') return null;
  const p = pergunta.trim();
  if (p.length === 0 || pergunta.length > MAX_PERGUNTA) return null;
  if (!Array.isArray(historico) || historico.length > MAX_HISTORICO) return null;
  const msgs: Mensagem[] = [];
  for (const m of historico) {
    if (typeof m !== 'object' || m === null) return null;
    const { papel, texto } = m as Record<string, unknown>;
    if ((papel !== 'usuario' && papel !== 'modelo') || typeof texto !== 'string') return null;
    if (texto.length > MAX_MENSAGEM) return null;
    msgs.push({ papel, texto: mascararDadosPessoais(texto) });
  }
  return { pergunta: mascararDadosPessoais(p), historico: msgs };
}

function json(corpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

let avisouSemChave = false;

export async function tratarPerguntar(req: Request, env: EnvPerguntar, origens: string[]): Promise<Response> {
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);

  const texto = await req.text();
  let entrada: EntradaPergunta | null = null;
  if (texto.length <= MAX_CORPO) {
    try {
      entrada = validar(JSON.parse(texto));
    } catch {
      entrada = null;
    }
  }
  if (!entrada) return json({ erro: 'Pergunta inválida.' }, 400, cors);

  if (!env.GEMINI_API_KEY) {
    if (!avisouSemChave) {
      avisouSemChave = true;
      console.error('GEMINI_API_KEY ausente: respondendo 503');
    }
    return json({ erro: MSG_INDISPONIVEL }, 503, cors);
  }

  const agora = () => new Date();
  const ip = req.headers.get('CF-Connecting-IP') || 'desconhecido';
  const { success } = await env.LIMITADOR.limit({ key: await chaveLimite(ip, agora()) });
  if (!success) return json({ erro: MSG_LIMITE }, 429, cors);

  try {
    const embedder = criarEmbedder(env);
    const gerador = criarGerador(env);
    const limiar = Number(env.LIMIAR_SIMILARIDADE);
    const resultado = await responderPergunta(entrada, {
      buscar: (p) =>
        buscarTrechos(
          p,
          { embedder, vectorize: env.VECTORIZE, db: env.DB, agora },
          { limiar: Number.isFinite(limiar) && env.LIMIAR_SIMILARIDADE ? limiar : LIMIAR_PADRAO },
        ),
      gerador,
      agora,
    });
    return json(resultado, 200, cors);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).split(env.GEMINI_API_KEY).join('[chave]');
    console.error('Falha ao responder:', msg.slice(0, 300));
    return json({ erro: MSG_INDISPONIVEL }, 503, cors);
  }
}
