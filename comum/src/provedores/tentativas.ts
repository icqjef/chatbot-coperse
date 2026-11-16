/**
 * Falhas passageiras do provedor (aistudio.google.com/docs/troubleshooting, "Retry strategy"):
 * 408, 429 e 5xx valem nova tentativa com espera; 400, 401, 402, 403 e 404 não.
 * Tempo esgotado e falha de rede também contam como passageiras.
 */
export class ErroHttpProvedor extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = 'ErroHttpProvedor';
  }
}

const PASSAGEIROS = new Set([408, 429, 500, 502, 503, 504]);

export function tempoEsgotado(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

export function passageiro(e: unknown): boolean {
  if (e instanceof ErroHttpProvedor) return PASSAGEIROS.has(e.status);
  // fetch lança TypeError em falha de rede.
  return tempoEsgotado(e) || e instanceof TypeError;
}

export interface OpcoesTentativa {
  /** Tempo máximo de cada chamada ao provedor. */
  tempoMs?: number;
  /** Espera antes de repetir no mesmo modelo. */
  esperaMs?: number;
  /** Trocável nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

export const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
