/** `assinatura`: HMAC que o Worker põe em cada resposta; sem ela a resposta não volta como contexto. */
export type Mensagem = { papel: 'usuario' | 'modelo'; texto: string; assinatura?: string };
export type Fonte = { titulo: string; url: string; site: string; data: string };
export type Enviar = (
  pergunta: string,
  historico: Mensagem[],
) => Promise<{ resposta: string; fontes: Fonte[]; assinatura?: string }>;
