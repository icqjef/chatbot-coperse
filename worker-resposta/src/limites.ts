import type { RateLimit } from './perguntar';

/** Teto de perguntas do bot inteiro por dia (protege o crédito do Gemini). */
export interface CotaDiaria {
  consumir(): Promise<boolean>;
}

const PERIODO_MS = 60_000;
const MAX_VISITANTES_EM_MEMORIA = 5000;

/** Data em America/Sao_Paulo (aaaa-mm-dd): a cota vira à meia-noite de Brasília. */
export function diaSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** Contagem exata e sem estado externo: testável fora do Durable Object. */
export class Contadores {
  private janelas = new Map<string, { inicio: number; n: number }>();

  private dias = new Map<string, { dia: string; n: number }>();

  /** Teto de perguntas por visitante por dia (aaaa-mm-dd de São Paulo). */
  diario(chave: string, limite: number, dia: string): boolean {
    if (this.dias.size > MAX_VISITANTES_EM_MEMORIA) {
      for (const [k, d] of this.dias) if (d.dia !== dia) this.dias.delete(k);
    }
    let d = this.dias.get(chave);
    if (!d || d.dia !== dia) {
      d = { dia, n: 0 };
      this.dias.set(chave, d);
    }
    if (d.n >= limite) return false;
    d.n++;
    return true;
  }

  /** Janela fixa de 60 s por chave de visitante. */
  visitante(chave: string, limite: number, agora: number): boolean {
    if (this.janelas.size > MAX_VISITANTES_EM_MEMORIA) {
      for (const [k, j] of this.janelas) if (agora - j.inicio >= PERIODO_MS) this.janelas.delete(k);
    }
    let j = this.janelas.get(chave);
    if (!j || agora - j.inicio >= PERIODO_MS) {
      j = { inicio: agora, n: 0 };
      this.janelas.set(chave, j);
    }
    if (j.n >= limite) return false;
    j.n++;
    return true;
  }
}

interface Armazenamento {
  get<T>(chave: string): Promise<T | undefined>;
  put<T>(chave: string, valor: T): Promise<void>;
}

/** Cota do dia gravada no armazenamento (sobrevive a reinícios); uma só chave, sem acumular linhas. */
export async function consumirCota(armazem: Armazenamento, dia: string, teto: number): Promise<boolean> {
  const atual = (await armazem.get<{ dia: string; n: number }>('cota')) ?? { dia, n: 0 };
  const n = atual.dia === dia ? atual.n : 0;
  if (n >= teto) return false;
  await armazem.put('cota', { dia, n: n + 1 });
  return true;
}

/**
 * Durable Object único ("global"): processa um pedido por vez, então as contagens são exatas
 * (o limitador nativo da Cloudflare é aproximado e conta por data center).
 * Os contadores por visitante ficam só em memória: se o objeto for descarregado, as janelas
 * de 1 minuto recomeçam (aceitável). A cota diária fica gravada.
 */
export class Limites {
  private contadores = new Contadores();

  constructor(private readonly estado: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const corpo = (await req.json()) as { chave?: string; limite?: number; limiteDia?: number; dia?: string; teto?: number };
    if (url.pathname === '/visitante' && typeof corpo.chave === 'string' && typeof corpo.limite === 'number') {
      // Minuto primeiro, depois o dia: quem estourou o minuto não gasta o limite diário.
      if (!this.contadores.visitante(corpo.chave, corpo.limite, Date.now())) return Response.json({ ok: false, motivo: 'minuto' });
      if (typeof corpo.limiteDia === 'number' && !this.contadores.diario(corpo.chave, corpo.limiteDia, diaSaoPaulo(new Date()))) {
        return Response.json({ ok: false, motivo: 'dia' });
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/cota' && typeof corpo.dia === 'string' && typeof corpo.teto === 'number') {
      return Response.json({ ok: await consumirCota(this.estado.storage, corpo.dia, corpo.teto) });
    }
    return new Response(null, { status: 400 });
  }
}

async function chamarBruto(ns: DurableObjectNamespace, caminho: string, corpo: unknown): Promise<{ ok: boolean; motivo?: 'minuto' | 'dia' }> {
  const stub = ns.get(ns.idFromName('global'));
  const r = await stub.fetch(`https://limites${caminho}`, { method: 'POST', body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`Limites HTTP ${r.status}`);
  return (await r.json()) as { ok: boolean; motivo?: 'minuto' | 'dia' };
}

async function chamar(ns: DurableObjectNamespace, caminho: string, corpo: unknown): Promise<boolean> {
  return (await chamarBruto(ns, caminho, corpo)).ok;
}

function inteiro(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

/** Adaptadores com a mesma interface que os tratadores já usam. */
export function criarLimites(
  ns: DurableObjectNamespace,
  vars: { LIMITE_POR_MINUTO?: string; COTA_DIARIA?: string; LIMITE_DIARIO_VISITANTE?: string },
): { limitador: RateLimit; cota: CotaDiaria } {
  const limite = inteiro(vars.LIMITE_POR_MINUTO, 6);
  const limiteDia = inteiro(vars.LIMITE_DIARIO_VISITANTE, 40);
  const teto = inteiro(vars.COTA_DIARIA, 1000);
  return {
    limitador: {
      limit: async ({ key }) => {
        const { ok, motivo } = await chamarBruto(ns, '/visitante', { chave: key, limite, limiteDia });
        return ok ? { success: true } : { success: false, motivo };
      },
    },
    cota: { consumir: () => chamar(ns, '/cota', { dia: diaSaoPaulo(new Date()), teto }) },
  };
}
