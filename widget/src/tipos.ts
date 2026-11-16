/** `assinatura`: HMAC que o Worker põe em cada resposta; sem ela a resposta não volta como contexto. */
export type Mensagem = { papel: 'usuario' | 'modelo'; texto: string; assinatura?: string };
export type Fonte = { titulo: string; url: string; site: string; data: string };
/** `sugestoes`: próximas perguntas (botões). `contato`: o bot não achou base e oferece escrever para a COPERSE. */
/** `oficial`: resposta escrita pela COPERSE no painel. */
/** `aviso`: retificação de edital ou cronograma relacionada à resposta. */
export type Aviso = { tipo: 'info' | 'atencao'; texto: string; url: string; titulo: string };
export type Resposta = { resposta: string; fontes: Fonte[]; assinatura?: string; sugestoes?: string[]; contato?: boolean; oficial?: boolean; aviso?: Aviso };
/** `aoParcial`: prévia da resposta enquanto o assistente escreve (texto já com as citações [n]). */
export type Enviar = (pergunta: string, historico: Mensagem[], aoParcial?: (texto: string) => void) => Promise<Resposta>;
/** Próximas etapas dos cronogramas conferidos (GET /proximas). */
export type EtapaProxima = { etapa: string; quando: string; fonte: { titulo: string; url: string } };
export type Proximas = { processos: { nome: string; ano: number; etapas: EtapaProxima[] }[] };
export type BuscarProximas = () => Promise<Proximas>;
export type Avaliar = (dados: { util: boolean; resposta: string; assinatura: string; fontes: string[] }) => Promise<void>;
