/** `assinatura`: HMAC que o Worker põe em cada resposta; sem ela a resposta não volta como contexto. */
export type Mensagem = { papel: 'usuario' | 'modelo'; texto: string; assinatura?: string };
export type Fonte = { titulo: string; url: string; site: string; data: string };
/** `sugestoes`: próximas perguntas (botões). `contato`: o bot não achou base e oferece escrever para a COPERSE. */
export type Resposta = { resposta: string; fontes: Fonte[]; assinatura?: string; sugestoes?: string[]; contato?: boolean };
export type Enviar = (pergunta: string, historico: Mensagem[]) => Promise<Resposta>;
export type Avaliar = (dados: { util: boolean; resposta: string; assinatura: string }) => Promise<void>;
