import { carregarRegras, inferirProcesso } from '@chatbot/comum/classificar';
import listasJson from '../../config/listas.json';
import processosJson from '../../config/processos.json';
import { criarEmbedder } from '@chatbot/comum/provedores/embeddings';
import { criarGerador, RespostaBloqueada, type Gerador, type Mensagem } from '@chatbot/comum/provedores/geracao';
import { buscarTrechos, type Trecho } from './busca';
import { cabecalhosCors, origemPermitida } from './cors';
import { SEM_BASE, extrairFontes, mascararDadosPessoais, montarSistema, type Fonte } from './regras';

export interface RateLimit {
  limit(opcoes: { key: string; diario?: boolean }): Promise<{ success: boolean; motivo?: 'minuto' | 'dia' }>;
}

export interface EnvPerguntar {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  LIMITADOR: RateLimit;
  COTA?: { consumir(): Promise<boolean> };
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
const MAX_CORPO_BYTES = 48 * 1024;
const LIMIAR_PADRAO = 0.5;
const MAX_RECUSA = 400;

const MSG_GRANDE = 'Pergunta grande demais.';
export const MSG_LIMITE = 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.';
export const MSG_LIMITE_DIA = 'Você atingiu o limite de perguntas de hoje. Tente amanhã ou escreva para coperse@furg.br.';
const MSG_COTA =
  'O assistente atingiu o limite de perguntas de hoje. Tente de novo amanhã ou escreva para coperse@furg.br.';
const MSG_INDISPONIVEL =
  'O assistente está indisponível no momento. Tente de novo em instantes ou escreva para coperse@furg.br.';

export interface EntradaPergunta {
  pergunta: string;
  historico: Mensagem[];
}

export interface DepsResposta {
  buscar: (pergunta: string, processo: string | null) => Promise<{ trechos: Trecho[]; melhorSimilaridade: number }>;
  gerador: Gerador;
  agora: () => Date;
}

const MAX_SEGUIMENTO = 60;
// Compiladas uma vez, no carregamento do módulo (orçamento de CPU curto).
const REGRAS = carregarRegras(processosJson, listasJson);

/**
 * Consulta usada na busca vetorial. Um seguimento curto ("e de Medicina?") não tem contexto
 * sozinho; junta-se a última pergunta do usuário. O gerador continua recebendo o histórico normal.
 */
export function consultaDeBusca(pergunta: string, historico: Mensagem[]): string {
  const p = pergunta.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (p.length >= MAX_SEGUIMENTO) return pergunta;
  // Só é seguimento se começa com um elo ("e de Medicina?") ou não cita processo algum ("Quantas vagas tem?").
  // Pergunta nova que cita o processo ("Quando é a prova do Vestibular?") não herda o assunto anterior.
  const elo = /^(e\b|mesmo\b|tambem\b)/.test(p);
  const citaProcesso = /\b(vestibular|sisu|quilombola|indigena|transgen\w*|trans|ead|distancia|complementar|ociosa|enem)\b/.test(p);
  if (!elo && citaProcesso) return pergunta;
  const anterior = [...historico].reverse().find((m) => m.papel === 'usuario');
  return anterior ? `${anterior.texto}\n${pergunta}` : pergunta;
}

export async function responderPergunta(
  entrada: EntradaPergunta,
  deps: DepsResposta,
): Promise<{ resposta: string; fontes: Fonte[] }> {
  const consulta = consultaDeBusca(entrada.pergunta, entrada.historico);
  const { trechos } = await deps.buscar(consulta, inferirProcesso([entrada.pergunta], REGRAS) ?? inferirProcesso([consulta], REGRAS));
  if (trechos.length === 0) return { resposta: SEM_BASE, fontes: [] };
  let bruta: string;
  try {
    bruta = await deps.gerador.gerar(montarSistema(trechos, deps.agora()), [
      ...entrada.historico,
      { papel: 'usuario', texto: entrada.pergunta },
    ]);
  } catch (e) {
    if (e instanceof RespostaBloqueada) return { resposta: SEM_BASE, fontes: [] };
    throw e;
  }
  const { resposta, fontes, citou } = extrairFontes(bruta, trechos);
  if (fontes.length === 0) {
    // Recusa ou encaminhamento (regras 3 a 5): curta, sem citar número algum e apontando para a COPERSE.
    // Qualquer outra resposta sem citação vira SEM_BASE, para não passar conteúdo sem fonte.
    if (!citou && resposta.length <= MAX_RECUSA && resposta.includes('coperse@furg.br')) {
      return { resposta, fontes: [] };
    }
    return { resposta: SEM_BASE, fontes: [] };
  }
  return { resposta, fontes };
}

/**
 * Identificador do visitante: IPv4 inteiro; IPv6 só o prefixo /64 (4 primeiros grupos, com o `::`
 * expandido), porque um único usuário controla o /64 inteiro e mudaria de endereço para escapar do limite.
 */
export function prefixoIp(ip: string): string {
  const semEscopo = ip.split('%')[0]!;
  if (!semEscopo.includes(':')) return ip;
  // IPv4 mapeado em IPv6 (::ffff:a.b.c.d): vale o IPv4.
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(semEscopo);
  if (mapeado) return mapeado[1]!;
  const [cabeca = '', cauda] = semEscopo.split('::') as [string, string?];
  const ini = cabeca ? cabeca.split(':') : [];
  const fim = cauda === undefined ? [] : cauda ? cauda.split(':') : [];
  const grupos = cauda === undefined ? ini : [...ini, ...Array<string>(Math.max(0, 8 - ini.length - fim.length)).fill('0'), ...fim];
  while (grupos.length < 8) grupos.push('0');
  return grupos.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':');
}

/** sha256(ip (IPv6: /64) + data UTC) em hex: não guarda o IP e renova a cada dia. */
export async function chaveLimite(ip: string, agora: Date): Promise<string> {
  const dia = agora.toISOString().slice(0, 10);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prefixoIp(ip) + dia));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Aplica o limite por visitante. Devolve a resposta a enviar (429/503) ou null se liberado. */
export async function aplicarLimite(
  req: Request,
  limitador: RateLimit,
  cors: Record<string, string>,
  /** só /perguntar gasta o limite diário do visitante; /saude e /reindexar só passam pelo de minuto */
  diario = false,
): Promise<Response | null> {
  // A Cloudflare sempre define CF-Connecting-IP em produção; sem ele (teste local) todos
  // os visitantes dividem a chave 'sem-ip' + dia.
  const ip = req.headers.get('CF-Connecting-IP') || 'sem-ip';
  try {
    const { success, motivo } = await limitador.limit({ key: await chaveLimite(ip, new Date()), diario });
    return success ? null : json({ erro: motivo === 'dia' ? MSG_LIMITE_DIA : MSG_LIMITE }, 429, cors);
  } catch {
    console.error('Falha no limitador');
    return json({ erro: MSG_INDISPONIVEL }, 503, cors);
  }
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
  const negado = await aplicarLimite(req, env.LIMITADOR, cors, true);
  if (negado) return negado;
  if (env.COTA) {
    let liberada = false;
    try {
      liberada = await env.COTA.consumir();
    } catch {
      console.error('Falha na cota diária');
      return json({ erro: MSG_INDISPONIVEL }, 503, cors);
    }
    if (!liberada) return json({ erro: MSG_COTA }, 429, cors);
  }
  try {
    const embedder = criarEmbedder(env);
    const gerador = criarGerador(env);
    const limiar = Number(env.LIMIAR_SIMILARIDADE);
    const resultado = await responderPergunta(entrada, {
      buscar: (p, processo) =>
        buscarTrechos(
          p,
          { embedder, vectorize: env.VECTORIZE, db: env.DB, agora },
          { limiar: Number.isFinite(limiar) && env.LIMIAR_SIMILARIDADE ? limiar : LIMIAR_PADRAO, processo },
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
