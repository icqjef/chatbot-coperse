export type Mensagem = { papel: 'usuario' | 'modelo'; texto: string };
export type Fonte = { titulo: string; url: string; site: string; data: string };
export type Enviar = (
  pergunta: string,
  historico: Mensagem[],
) => Promise<{ resposta: string; fontes: Fonte[] }>;
