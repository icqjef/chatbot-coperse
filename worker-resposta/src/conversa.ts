/**
 * Mensagens sociais (saudação, agradecimento, despedida, "quem é você", data e hora) respondidas
 * aqui, sem busca nem Gemini: não gastam a cota e não dependem de trechos. Só vale quando a mensagem
 * inteira é social; "bom dia, quando é a prova?" segue para o fluxo normal.
 */

type Intencao = 'saudacao' | 'comoVai' | 'identidade' | 'data' | 'hora' | 'agradecimento' | 'despedida';

const FUSO = 'America/Sao_Paulo';

// Ordem importa: frases mais longas antes das que são prefixo delas.
const PADROES: [Intencao | null, string][] = [
  ['saudacao', 'bom dia|boa tarde|boa noite|ola+|oi+e?|opa|e ai|eai|eae|hey|hi|hello|salve|saudacoes'],
  ['comoVai', 'tudo (?:bem|bom|certo|tranquilo|joia)(?: com (?:voce|vc|tu))?|td (?:bem|bom)|como (?:vai|vais|esta|estas|voce esta|vc esta|voce vai|vc vai)(?: (?:voce|vc|tu))?|beleza|blz|suave'],
  ['identidade', 'quem (?:e|es) (?:voce|vc|tu)|quem e o assistente|o que (?:voce|vc|tu) (?:faz|fazes|pode fazer|sabe fazer|sabe)|o que (?:e )?(?:voce|vc)(?: e)?|qual (?:e )?(?:o )?(?:seu|teu) nome|como (?:voce|vc|tu) (?:se chama|te chamas)|como se chama|(?:voce|vc|tu) (?:e|es) (?:um |uma )?(?:robo|bot|chatbot|humano|humana|pessoa|gente|real|ia|inteligencia artificial|maquina|atendente)|como (?:voce|vc|tu) funciona|(?:pode |poderia )?(?:se )?apresentar|(?:se )?apresente(?: se)?|apresenta te|(?:voce|vc) pode me ajudar|pode me ajudar|me ajuda|preciso de ajuda|ajuda'],
  ['data', '(?:que|qual) (?:e )?(?:o )?dia (?:da semana |do mes )?(?:e hoje|e hj|e |de hoje|hoje|estamos)|(?:que|qual) (?:e )?(?:o )?dia (?:da semana|do mes)|(?:que|qual) (?:e )?(?:a )?data (?:de )?(?:hoje|atual|e hoje)|(?:que|qual) (?:e )?(?:a )?data|hoje e (?:que|qual) dia(?: da semana| do mes)?|(?:em )?que dia (?:estamos|e hoje|e hj)|estamos em que dia|dia da semana(?: hoje| de hoje)?|dia do mes(?: hoje| de hoje)?|data de hoje|data atual|dia de hoje'],
  ['hora', '(?:que|quais) horas? (?:sao|e|e agora|sao agora)|(?:qual|que) (?:e )?(?:a )?hora(?: atual| certa| agora)?|hora atual|hora certa|horario atual|as horas'],
  ['agradecimento', 'muit(?:o|issimo) obrigad[oa]s?|obrigad[oa]s?|obrigadao|brigad[oa]|obg|valeu|vlw|agradec\\w*|grat[oa]|thanks|thank you|(?:me )?ajudou(?: muito| bastante)?|otimo|perfeito|entendi|entendido|certo|ok|okay|blz|show|legal|massa|top'],
  ['despedida', 'tchau|xau|ate (?:logo|mais|breve|a proxima|amanha)|adeus|falou|flw|bye'],
  // palavras de ligação que podem aparecer entre as frases sociais
  [null, 'e|por favor|pf|pfv|pfvr|entao|ai|assistente|bot|chatbot|coperse|amig[oa]|gente|pessoal|me diga|me diz|diga|diz|voce sabe|vc sabe|sabe|sabe me dizer|pode me dizer|poderia me dizer|pode me informar|poderia informar|me informe|informe|mesmo|muito|pela ajuda|pela informacao|pelas informacoes|pela resposta|de novo|hoje|agora|hj|sim|ta|tudo|novamente|a|o|me|tb|tambem'],
];

const REGEX = PADROES.map(([i, src]) => [i, new RegExp(`^(?:${src})(?= |$) ?`)] as const);

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Intenções sociais da mensagem, ou null se sobrar qualquer coisa que não seja social. */
export function intencoesSociais(mensagem: string): { intencoes: Set<Intencao>; saudacao: string } | null {
  let s = normalizar(mensagem);
  if (!s || s.length > 120) return null;
  const intencoes = new Set<Intencao>();
  let saudacao = '';
  while (s) {
    let casou = false;
    for (const [i, re] of REGEX) {
      const m = re.exec(s);
      if (!m) continue;
      if (i) intencoes.add(i);
      if (i === 'saudacao' && !saudacao) saudacao = m[0].trim();
      s = s.slice(m[0].length);
      casou = true;
      break;
    }
    if (!casou) return null;
  }
  return intencoes.size ? { intencoes, saudacao } : null;
}

export const APRESENTACAO =
  'Sou o assistente virtual da COPERSE, a Comissão Permanente do Processo Seletivo da FURG. ' +
  'Respondo dúvidas sobre o Vestibular, o SiSU e os outros processos seletivos da FURG com base nas páginas oficiais, sempre indicando a fonte. ' +
  'Sou um programa de computador, não uma pessoa. Não digite dados pessoais como CPF, nome ou e-mail; para casos individuais, escreva para coperse@furg.br.';

const CONVITE = 'Como posso ajudar com os processos seletivos da FURG?';

export function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(agora);
}

export function horaBr(agora: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const h = p.find((x) => x.type === 'hour')?.value ?? '00';
  const m = p.find((x) => x.type === 'minute')?.value ?? '00';
  return `${h}h${m}`;
}

function saudar(saudacao: string): string {
  if (saudacao === 'bom dia') return 'Bom dia!';
  if (saudacao === 'boa tarde') return 'Boa tarde!';
  if (saudacao === 'boa noite') return 'Boa noite!';
  return 'Olá!';
}

/** Resposta pronta para mensagem só social; null para o resto (segue para busca e Gemini). */
export function respostaSocial(mensagem: string, agora: Date): string | null {
  const r = intencoesSociais(mensagem);
  if (!r) return null;
  const { intencoes: i, saudacao } = r;
  const partes: string[] = [];
  if (i.has('saudacao')) partes.push(saudar(saudacao));
  if (i.has('comoVai')) partes.push('Tudo bem, obrigado por perguntar!');
  if (i.has('identidade')) partes.push(APRESENTACAO);
  else if (i.has('saudacao')) partes.push('Sou o assistente virtual da COPERSE e respondo dúvidas sobre o Vestibular, o SiSU e os outros processos seletivos da FURG.');
  const data = dataPorExtenso(agora);
  if (i.has('data') && i.has('hora')) partes.push(`Hoje é ${data}, e agora são ${horaBr(agora)} (horário de Brasília).`);
  else if (i.has('data')) partes.push(`Hoje é ${data}.`);
  else if (i.has('hora')) partes.push(`Agora são ${horaBr(agora)} (horário de Brasília).`);
  const agradeceu = i.has('agradecimento');
  const despediu = i.has('despedida');
  if (agradeceu && despediu) partes.push('Por nada! Até mais e boa sorte no processo seletivo.');
  else if (agradeceu) partes.push('Por nada! Se tiver outra dúvida sobre os processos seletivos da FURG, é só perguntar.');
  else if (despediu) partes.push('Até mais! Boa sorte no processo seletivo.');
  else if (!i.has('data') && !i.has('hora')) partes.push(CONVITE);
  return partes.join(' ');
}
