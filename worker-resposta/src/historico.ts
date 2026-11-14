/**
 * Assinatura das respostas do bot (M4 da revisão de segurança). O histórico da conversa vem do
 * navegador; sem prova de origem, alguém poderia forjar falas do "modelo" e fazer o bot repetir
 * texto inventado com citação real. Cada resposta sai com um HMAC do texto, e o histórico só
 * aproveita os pares (pergunta, resposta) cuja resposta traz assinatura válida.
 *
 * A chave é derivada do segredo GEMINI_API_KEY, que já existe no Cloudflare: nenhum segredo novo.
 * Trocar a chave do Gemini só faz as conversas abertas perderem o contexto anterior.
 */

/** Espelha MAX_MENSAGEM: o widget corta o texto do histórico nesse tamanho antes de enviar. */
const TAMANHO_ASSINADO = 2000;
const ROTULO = 'chatbot-coperse/historico/v1:';

let cache: { segredo: string; chave: Promise<CryptoKey> } | undefined;

function chave(segredo: string): Promise<CryptoKey> {
  if (cache?.segredo !== segredo) {
    const bruta = new TextEncoder().encode(ROTULO + segredo);
    cache = { segredo, chave: crypto.subtle.importKey('raw', bruta, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']) };
  }
  return cache.chave;
}

function paraBase64Url(b: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(s)) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=');
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function assinar(texto: string, segredo: string): Promise<string> {
  const dados = new TextEncoder().encode(texto.slice(0, TAMANHO_ASSINADO));
  return paraBase64Url(await crypto.subtle.sign('HMAC', await chave(segredo), dados));
}

/** Comparação em tempo constante (crypto.subtle.verify). */
export async function assinaturaValida(texto: string, assinatura: unknown, segredo: string): Promise<boolean> {
  if (typeof assinatura !== 'string') return false;
  const bytes = deBase64Url(assinatura);
  if (!bytes) return false;
  const dados = new TextEncoder().encode(texto.slice(0, TAMANHO_ASSINADO));
  return crypto.subtle.verify('HMAC', await chave(segredo), bytes, dados);
}

export interface MensagemRecebida {
  papel: 'usuario' | 'modelo';
  texto: string;
  assinatura?: unknown;
}

/** Fica só com os pares (usuario, modelo) cuja fala do modelo tem assinatura válida. */
export async function paresAutenticos(historico: MensagemRecebida[], segredo: string): Promise<MensagemRecebida[]> {
  const saida: MensagemRecebida[] = [];
  for (let i = 0; i + 1 < historico.length; i += 2) {
    const [u, m] = [historico[i]!, historico[i + 1]!];
    if (await assinaturaValida(m.texto, m.assinatura, segredo)) saida.push(u, m);
  }
  return saida;
}
