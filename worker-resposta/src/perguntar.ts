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
const MAX_CORPO_BYTES = 32 * 1024;
const LIMIAR_PADRAO = 0.5;

const MSG_GRANDE = 'Pergunta grande demais.';
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
  // Alternância estrita: começa em "usuario" e termina em "modelo" (a pergunta nova fecha como "usuario").
  if (historico.length % 2 !== 0) return null;
  const msgs: Mensagem[] = [];
  for (const [i, m] of historico.entries()) {
    if (typeof m !== 'object' || m === null) return null;
    const { papel, texto } = m as Record<string, unknown>;
    const esperado = i % 2 === 0 ? 'usuario' : 'modelo';
    if (papel !== esperado || typeof texto !== 'string') return null;
    if (texto.length > MAX_MENSAGEM) return null;
    msgs.push({ papel: esperado, texto: mascararDadosPessoais(texto) });
  }
  return { pergunta: mascararDadosPessoais(p), historico: msgs };
}

export function json(corpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Lê o corpo contando bytes; devolve null se passar do limite (aborta a leitura). */
async function lerCorpoLimitado(req: Request): Promise<string | null> {
  const declarado = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declarado) && declarado > MAX_CORPO_BYTES) return null;
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let texto = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CORPO_BYTES) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    texto += decoder.decode(value, { stream: true });
  }
  return texto + decoder.decode();
}

let avisouSemChave = false;

export async function tratarPerguntar(req: Request, env: EnvPerguntar, origens: string[]): Promise<Response> {
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);

  const texto = await lerCorpoLimitado(req);
  if (texto === null) return json({ erro: MSG_GRANDE }, 413, cors);
  let entrada: EntradaPergunta | null = null;
  try {
    entrada = validar(JSON.parse(texto));
  } catch {
    entrada = null;
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
  // A Cloudflare sempre define CF-Connecting-IP em produção; sem ele (teste local) todos
  // os visitantes dividem a chave 'sem-ip' + dia.
  const ip = req.headers.get('CF-Connecting-IP') || 'sem-ip';
  try {
    const { success } = await env.LIMITADOR.limit({ key: await chaveLimite(ip, agora()) });
    if (!success) return json({ erro: MSG_LIMITE }, 429, cors);

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
    // Só a parte inicial ("... HTTP 429"); o texto do provedor (depois do travessão) não vai ao log.
    const msg = String(e instanceof Error ? e.message : e).split(env.GEMINI_API_KEY).join('[chave]');
    console.error('Falha ao responder:', msg.split(' — ')[0]!.slice(0, 120));
    return json({ erro: MSG_INDISPONIVEL }, 503, cors);
  }
}
