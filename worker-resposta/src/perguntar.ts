import { carregarRegras, inferirProcesso } from '@chatbot/comum/classificar';
import listasJson from '../../config/listas.json';
import processosJson from '../../config/processos.json';
import { chaveCache, gravarCache, lerCache } from './cache';
import { cronogramaComoTrechos, NOMES, perguntaDeData } from './cronograma';
import { processoDaPagina } from './sites';
import { buscarOficial, comMemoria } from './oficiais';
import { decidirAviso, edicaoCitada, ultimaRetificacao, type Aviso, type Retificacao } from './retificacao';
import { criarEmbedder } from '@chatbot/comum/provedores/embeddings';
import { criarGerador, RespostaBloqueada, type Gerador, type Mensagem } from '@chatbot/comum/provedores/geracao';
import { buscarTrechos, type LinhaDiagnostico, type Trecho } from './busca';
import { diaSaoPaulo } from './limites';
import { expandirTermos } from './termos';
import { corrigirTempo, correcaoDeTempo, problemasDeTempo, semAvisoVencido } from './tempo';
import { assinar, paresAutenticos, type MensagemRecebida } from './historico';
import { ENCERRAMENTO, limparDatas, respostaSocial, saudacaoInicial, semSaudacaoDoModelo } from './conversa';
import { cabecalhosCors, origemPermitida } from './cors';
import { contaNoPainel, contarPergunta, tipoDaResposta } from './contagem';
import { MARCA_ENCERRAMENTO, SEM_BASE, comEncaminhamento, extrairFontes, mascararDadosPessoais, montarSistema, separarSugestoes, type Fonte } from './regras';

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
  MODELO_RESERVA?: string;
  MODELO_EMBEDDING?: string;
  DIMENSAO_EMBEDDING?: string;
  LIMIAR_SIMILARIDADE?: string;
  GEMINI_API_KEY: string;
  /** "true" grava o texto das perguntas (mascarado, sem IP, 90 dias) para o painel. */
  REGISTRAR_PERGUNTAS?: string;
}

const MAX_PERGUNTA = 500;
const MAX_HISTORICO = 8;
const MAX_MENSAGEM = 2000;
const MAX_CORPO_BYTES = 48 * 1024;
const LIMIAR_PADRAO = 0.5;
const MAX_RECUSA = 400;
// O widget desiste em 30 s; o Worker para de tentar o Gemini antes, para ainda responder com a mensagem de indisponível.
const PRAZO_GEMINI_MS = 26_000;
// Embedding da pergunta: texto curto, resposta rápida; tempo maior só atrasaria a reserva da geração.
const TEMPO_EMBEDDING_MS = 6_000;

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
  /** Processo da página onde o widget está (sites.ts); vale quando a pergunta não diz o processo. */
  processoPagina?: string | null;
}

export interface DepsResposta {
  buscar: (pergunta: string, processo: string | null) => Promise<{ trechos: Trecho[]; melhorSimilaridade: number }>;
  gerador: Gerador;
  agora: () => Date;
  /** Resposta gradual: recebe a prévia já filtrada (só frases completas e com fonte) enquanto o modelo escreve. */
  aoParcial?: (texto: string) => void;
  /** Cronograma conferido do processo (cronograma.ts): entra à frente dos trechos nas perguntas sobre datas. */
  cronograma?: (processo: string) => Promise<Trecho[]>;
  /** Última retificação de edital/cronograma da edição (retificacao.ts), para o aviso na resposta. */
  retificacao?: (processo: string, ano: number) => Promise<Retificacao | null>;
  /** Resposta oficial da COPERSE (oficiais.ts) para a mesma pergunta: vale mais que a gerada. */
  oficial?: (consulta: string, processo: string | null) => Promise<Resultado | null>;
}

const FIM_DE_FRASE = /[.!?](?=\s)|\n/g;

/**
 * Prévia do texto que o modelo ainda está escrevendo: só frases completas, antes de "Sugestões:", com os mesmos
 * filtros da resposta final (tempo verbal, aviso vencido, fontes, datas, saudação). Null enquanto não houver
 * citação válida: texto sem fonte nunca aparece, nem por instantes. A resposta final sempre substitui a prévia.
 */
export function previa(acumulado: string, trechos: Trecho[], pergunta: string, hoje: string): string | null {
  if (acumulado.trimStart().startsWith(MARCA_ENCERRAMENTO.slice(0, 8))) return null;
  let texto = separarSugestoes(acumulado).texto;
  // Com "Sugestões:" já escrita, o texto antes dela está completo (o corte tira o espaço depois da última frase).
  let fim = texto.length < acumulado.length ? texto.length : 0;
  if (!fim) for (const m of texto.matchAll(FIM_DE_FRASE)) fim = m.index + 1;
  if (!fim) return null;
  texto = semAvisoVencido(corrigirTempo(texto.slice(0, fim), hoje), hoje);
  const { resposta, fontes } = extrairFontes(texto, trechos);
  if (!fontes.length) return null;
  const saudacao = saudacaoInicial(pergunta);
  const corpo = limparDatas(semSaudacaoDoModelo(resposta));
  return saudacao ? `${saudacao} ${corpo}` : corpo;
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
): Promise<Resultado> {
  const r = await responderSemSaudacao(entrada, deps);
  const saudacao = saudacaoInicial(entrada.pergunta);
  const corpo = limparDatas(semSaudacaoDoModelo(r.resposta));
  return { ...r, resposta: saudacao ? `${saudacao} ${corpo}` : corpo };
}

/**
 * `sugestoes`: próximas perguntas prováveis (botões no widget). `contato`: o bot não respondeu com
 * base nas páginas (sem base, recusa ou encaminhamento) e o widget oferece escrever para a COPERSE.
 */
export interface Resultado {
  resposta: string;
  fontes: Fonte[];
  sugestoes: string[];
  contato: boolean;
  /** Resposta escrita pela COPERSE no painel (o widget mostra "Resposta conferida pela COPERSE"). */
  oficial?: boolean;
  /** Retificação de edital ou cronograma relacionada à resposta (retificacao.ts). */
  aviso?: Aviso;
}

// "Não posso ajudar com" fica de fora: costuma vir seguido de informação útil ("..., mas o prazo é 10/12 [1]").
const RECUSA_DO_MODELO = /^\s*(?:desculpe,?\s*|sinto muito,?\s*(?:mas\s*)?)?n[ãa]o posso (?:atender|fazer|escrever|criar)/i;
const RECUSA =
  'Não posso atender a esse pedido. Respondo só dúvidas sobre os processos seletivos, os cursos de graduação e o ingresso na FURG. ' +
  'Para outros casos, escreva para coperse@furg.br.';

const NAO_ACHOU: Resultado = { resposta: SEM_BASE, fontes: [], sugestoes: [], contato: true };

async function responderSemSaudacao(entrada: EntradaPergunta, deps: DepsResposta): Promise<Resultado> {
  // Grafia errada ou erro da voz ("campos da formiga"): busca, processo e modelo recebem também o termo certo.
  const pergunta = expandirTermos(entrada.pergunta);
  const consulta = consultaDeBusca(pergunta, entrada.historico);
  const daPergunta = inferirProcesso([pergunta], REGRAS) ?? inferirProcesso([consulta], REGRAS);
  const processo = daPergunta ?? entrada.processoPagina ?? null;
  // Só o nome fixo do processo vai ao prompt (nunca o título da página, que vem do navegador).
  const contextoPagina = !daPergunta && entrada.processoPagina ? NOMES[entrada.processoPagina] : undefined;
  if (deps.oficial) {
    const oficial = await deps.oficial(consulta, processo).catch(() => null);
    if (oficial) return oficial;
  }
  const { trechos: achados } = await deps.buscar(consulta, processo);
  let trechos = achados;
  // Pergunta sobre data de um processo: o cronograma conferido vem primeiro e substitui o texto cru do mesmo documento.
  if (processo && deps.cronograma && perguntaDeData(consulta)) {
    const extra = await deps.cronograma(processo).catch(() => [] as Trecho[]);
    if (extra.length) {
      const urls = new Set(extra.map((t) => t.url));
      trechos = [...extra, ...achados.filter((t) => !urls.has(t.url))];
    }
  }
  if (trechos.length === 0) return NAO_ACHOU;
  const sistema = montarSistema(trechos, deps.agora(), contextoPagina);
  const mensagens: Mensagem[] = [...entrada.historico, { papel: 'usuario', texto: pergunta }];
  const hoje = diaSaoPaulo(deps.agora());
  let bruta: string;
  try {
    const aoParcial = deps.aoParcial;
    if (aoParcial && deps.gerador.gerarAosPoucos) {
      // A prévia só é refeita quando termina uma frase: poupa CPU a cada pedaço.
      let frases = 0;
      let ultima = '';
      bruta = await deps.gerador.gerarAosPoucos(sistema, mensagens, (acumulado) => {
        const n = acumulado.match(FIM_DE_FRASE)?.length ?? 0;
        if (n === frases) return;
        frases = n;
        const p = previa(acumulado, trechos, entrada.pergunta, hoje);
        if (p && p !== ultima) aoParcial((ultima = p));
      });
    } else bruta = await deps.gerador.gerar(sistema, mensagens);
  } catch (e) {
    if (e instanceof RespostaBloqueada) return NAO_ACHOU;
    throw e;
  }
  // Encerramento que escapou da lista de conversa.ts: texto fixo, nunca o do modelo (que viria sem fonte).
  if (bruta.includes(MARCA_ENCERRAMENTO)) return { resposta: ENCERRAMENTO, fontes: [], sugestoes: [], contato: false };
  // Tempo verbal que não combina com a data ("foi realizada em" data futura): o modelo reescreve uma vez,
  // avisado do erro. Fica a nova versão só se ela errar menos e continuar citando trechos; o resto é trocado direto.
  const problemas = problemasDeTempo(bruta, hoje);
  if (problemas.length) {
    try {
      const nova = await deps.gerador.gerar(sistema + correcaoDeTempo(problemas, hoje), mensagens);
      if (problemasDeTempo(nova, hoje).length < problemas.length && /\[\d+\]/.test(nova)) bruta = nova;
    } catch {
      // fica a primeira versão
    }
    // O que a reescrita não resolveu é trocado direto, verbo a verbo.
    bruta = corrigirTempo(bruta, hoje);
  }
  const separada = separarSugestoes(bruta, entrada.pergunta);
  const sugestoes = separada.sugestoes;
  const texto = semAvisoVencido(separada.texto, hoje);
  const extraida = extrairFontes(texto, trechos);
  const { fontes, citou } = extraida;
  // Recusa de tema (regra 5) em que o modelo citou trecho mesmo assim (avaliação de 19/11): a fonte não tem
  // sentido e o contato sumiria. Vira a recusa fixa, sem fontes.
  if (RECUSA_DO_MODELO.test(extraida.resposta)) return { resposta: RECUSA, fontes: [], sugestoes: [], contato: true };
  // Regra 4 garantida no código: pergunta sobre a própria situação sempre leva o contato da COPERSE.
  const resposta = comEncaminhamento(extraida.resposta, entrada.pergunta);
  if (fontes.length === 0) {
    // Recusa ou encaminhamento (regras 3 a 5): curta, sem citar número algum e apontando para a COPERSE.
    // Qualquer outra resposta sem citação vira SEM_BASE, para não passar conteúdo sem fonte.
    if (!citou && resposta.length <= MAX_RECUSA && resposta.includes('coperse@furg.br')) {
      return { resposta, fontes: [], sugestoes: [], contato: true };
    }
    return NAO_ACHOU;
  }
  const citados = trechos.filter((t) => fontes.some((f) => f.url === t.url));
  const edicao = edicaoCitada(citados);
  let aviso: Aviso | null = null;
  if (edicao && deps.retificacao) {
    aviso = decidirAviso(citados, await deps.retificacao(edicao.processo, edicao.ano).catch(() => null), deps.agora());
  }
  return { resposta, fontes, sugestoes, contato: false, ...(aviso ? { aviso } : {}) };
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

/** sha256(ip (IPv6: /64) + data de Brasília) em hex: não guarda o IP e renova à meia-noite de Brasília. */
export async function chaveLimite(ip: string, agora: Date): Promise<string> {
  const dia = diaSaoPaulo(agora);
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

/** Formato e tamanhos; a assinatura das falas do modelo é conferida depois (`paresAutenticos`). */
function validar(corpo: unknown): { pergunta: string; historico: MensagemRecebida[]; pagina?: unknown } | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const { pergunta, historico = [], pagina } = corpo as Record<string, unknown>;
  if (typeof pergunta !== 'string') return null;
  const p = pergunta.trim();
  if (p.length === 0 || pergunta.length > MAX_PERGUNTA) return null;
  if (!Array.isArray(historico) || historico.length > MAX_HISTORICO) return null;
  // Alternância estrita: começa em "usuario" e termina em "modelo" (a pergunta nova fecha como "usuario").
  if (historico.length % 2 !== 0) return null;
  const msgs: MensagemRecebida[] = [];
  for (const [i, m] of historico.entries()) {
    if (typeof m !== 'object' || m === null) return null;
    const { papel, texto, assinatura } = m as Record<string, unknown>;
    const esperado = i % 2 === 0 ? 'usuario' : 'modelo';
    if (papel !== esperado || typeof texto !== 'string') return null;
    if (texto.length > MAX_MENSAGEM) return null;
    msgs.push(esperado === 'modelo' ? { papel: esperado, texto, assinatura } : { papel: esperado, texto });
  }
  return { pergunta: p, historico: msgs, pagina };
}

/** Descarta pares com resposta sem assinatura válida e mascara dados pessoais. */
async function prepararEntrada(e: { pergunta: string; historico: MensagemRecebida[] }, segredo: string): Promise<EntradaPergunta> {
  const autenticos = await paresAutenticos(e.historico, segredo);
  return {
    pergunta: mascararDadosPessoais(e.pergunta),
    historico: autenticos.map(({ papel, texto }): Mensagem => ({ papel, texto: mascararDadosPessoais(texto) })),
  };
}

export function json(corpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
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

const NDJSON = 'application/x-ndjson';

export async function tratarPerguntar(
  req: Request,
  env: EnvPerguntar,
  origens: string[],
  ctx?: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  const recebidaEm = Date.now();
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);

  const texto = await lerCorpoLimitado(req);
  if (texto === null) return json({ erro: MSG_GRANDE }, 413, cors);
  let recebida: ReturnType<typeof validar> = null;
  try {
    recebida = validar(JSON.parse(texto));
  } catch {
    recebida = null;
  }
  if (!recebida) return json({ erro: 'Pergunta inválida.' }, 400, cors);

  if (!env.GEMINI_API_KEY) {
    if (!avisouSemChave) {
      avisouSemChave = true;
      console.error('GEMINI_API_KEY ausente: respondendo 503');
    }
    return json({ erro: MSG_INDISPONIVEL }, 503, cors);
  }

  const segredo = env.GEMINI_API_KEY;
  const entrada = { ...(await prepararEntrada(recebida, segredo)), processoPagina: processoDaPagina(recebida.pagina, origem!, REGRAS) };
  const agora = () => new Date();
  const contar = contaNoPainel(origem);
  const registro = env.REGISTRAR_PERGUNTAS === 'true' ? { pergunta: entrada.pergunta } : undefined;
  const responder = async (r: Resultado & { diagnostico?: unknown }, social = false) => {
    if (contar) await contarPergunta(env.DB, tipoDaResposta(r, social), agora(), registro, Date.now() - recebidaEm);
    return json({ ...r, assinatura: await assinar(r.resposta, segredo) }, 200, cors);
  };
  const negado = await aplicarLimite(req, env.LIMITADOR, cors, true);
  if (negado) return negado;
  // Saudação, agradecimento, "quem é você", data e hora: resposta pronta, sem gastar a cota do Gemini.
  const social = respostaSocial(entrada.pergunta, agora());
  if (social) return responder({ resposta: social, fontes: [], sugestoes: [], contato: false }, true);
  // Pergunta repetida nos sites da FURG: resposta guardada, sem Gemini e sem gastar a cota. A página de teste
  // e a avaliação automática (*.workers.dev) sempre geram de novo, para medir o modelo de verdade.
  const chave = contar && entrada.historico.length === 0 ? await chaveCache(entrada.pergunta, agora(), entrada.processoPagina ?? '') : null;
  if (chave) {
    const guardada = await lerCache(env.DB, chave, agora());
    if (guardada) return responder(guardada);
  }
  if (env.COTA) {
    let liberada = false;
    try {
      liberada = await env.COTA.consumir();
    } catch {
      console.error('Falha na cota diária');
      return json({ erro: MSG_INDISPONIVEL }, 503, cors);
    }
    if (!liberada) {
      if (contar) await contarPergunta(env.DB, 'limite', agora(), registro);
      return json({ erro: MSG_COTA }, 429, cors);
    }
  }
  const ate = Date.now() + PRAZO_GEMINI_MS;
  const limiar = Number(env.LIMIAR_SIMILARIDADE);
  let diagnostico: { consulta: string; trechos: LinhaDiagnostico[] } | undefined;
  // Provedores criados aqui dentro: configuração inválida vira 503 (ou {"erro"}) no try de quem chama.
  const gerarResposta = (aoParcial?: (texto: string) => void) => {
    const embedder = comMemoria(criarEmbedder(env, undefined, { tempoMs: TEMPO_EMBEDDING_MS }));
    const base = criarGerador(env);
    const gerador: Gerador = {
      gerar: (sistema, mensagens) => base.gerar(sistema, mensagens, { ate }),
      gerarAosPoucos: (sistema, mensagens, aoReceber) => base.gerarAosPoucos!(sistema, mensagens, aoReceber, { ate }),
    };
    return responderPergunta(entrada, {
      buscar: async (p, processo) => {
        const r = await buscarTrechos(
          p,
          { embedder, vectorize: env.VECTORIZE, db: env.DB, agora },
          { limiar: Number.isFinite(limiar) && env.LIMIAR_SIMILARIDADE ? limiar : LIMIAR_PADRAO, processo },
        );
        diagnostico = { consulta: p, trechos: r.diagnostico ?? [] };
        return r;
      },
      gerador,
      agora,
      aoParcial,
      cronograma: (processo) => cronogramaComoTrechos(env.DB, processo, agora()),
      retificacao: (processo, ano) => ultimaRetificacao(env.DB, processo, ano),
      oficial: async (consulta, processo) => {
        const [vetor] = await embedder.embed([consulta], 'RETRIEVAL_QUERY');
        return vetor ? buscarOficial(env.DB, vetor, processo) : null;
      },
    });
  };
  // Página de teste e avaliação automática (origem *.workers.dev): mostra por que cada página entrou ou não.
  // Só URLs públicas e notas; nunca vai para os sites da FURG.
  const comDiagnostico = (r: Resultado) => (contar || !diagnostico ? r : { ...r, diagnostico });
  const registrarFalha = (e: unknown) => {
    // Só a parte inicial ("... HTTP 429"); o texto do provedor (depois do travessão) não vai ao log.
    const msg = String(e instanceof Error ? e.message : e).split(env.GEMINI_API_KEY).join('[chave]');
    console.error('Falha ao responder:', msg.split(' — ')[0]!.slice(0, 120));
  };

  if (!(req.headers.get('Accept') ?? '').includes(NDJSON)) {
    try {
      const resultado = await gerarResposta();
      const resposta = await responder(comDiagnostico(resultado));
      if (chave) await gravarCache(env.DB, chave, resultado, agora());
      return resposta;
    } catch (e) {
      registrarFalha(e);
      return json({ erro: MSG_INDISPONIVEL }, 503, cors);
    }
  }

  // Resposta gradual (widget novo): uma linha JSON por evento. {"parcial": texto} quantas vezes vier, e por
  // fim {"fim": resposta completa} ou {"erro": mensagem}. A resposta final é a mesma do modo JSON.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const escritor = writable.getWriter();
  const codificador = new TextEncoder();
  const linha = (o: unknown) => escritor.write(codificador.encode(JSON.stringify(o) + '\n')).catch(() => {});
  const trabalho = (async () => {
    try {
      const resultado = await gerarResposta((texto) => void linha({ parcial: texto }));
      const r = comDiagnostico(resultado);
      if (contar) await contarPergunta(env.DB, tipoDaResposta(r, false), agora(), registro, Date.now() - recebidaEm);
      await linha({ fim: { ...r, assinatura: await assinar(r.resposta, segredo) } });
      if (chave) await gravarCache(env.DB, chave, resultado, agora());
    } catch (e) {
      registrarFalha(e);
      await linha({ erro: MSG_INDISPONIVEL });
    } finally {
      await escritor.close().catch(() => {});
    }
  })();
  ctx?.waitUntil(trabalho);
  return new Response(readable, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': `${NDJSON}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
