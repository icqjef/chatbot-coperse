/**
 * Sugestões a partir do uso real (checklist, item 8): as perguntas mais feitas na semana viram os botões de
 * "Assuntos frequentes" do widget. Privacidade: só perguntas idênticas (depois de normalizadas) feitas 3 vezes
 * ou mais, respondidas com fonte, curtas, sem "[removido]", números longos, e-mail ou apresentação pessoal.
 * A COPERSE pode ocultar qualquer uma no painel.
 */
import { inferirProcesso, type RegrasClassificacao } from '@chatbot/comum/classificar';
import { normalizar } from './cache';
import { cabecalhosCors, origemPermitida } from './cors';
import { diaSaoPaulo } from './limites';
import { json } from './perguntar';

export const MIN_REPETICOES = 3;
export const DIAS_SUGESTOES = 7;
export const MAX_SUGESTOES = 4;
const MIN_TAMANHO = 8;
const MAX_TAMANHO = 70;
const MS_DIA = 86_400_000;
const PESSOAL = /\b(meu nome|me chamo|meu filh|minha filh|meu cpf|minha inscricao|meu numero)|\bsou (a|o) [a-z]/;

export function sugestaoSegura(pergunta: string): boolean {
  const p = pergunta.trim();
  if (p.length < MIN_TAMANHO || p.length > MAX_TAMANHO) return false;
  if (p.includes('[removido]') || p.includes('@') || /\d{5,}/.test(p)) return false;
  return !PESSOAL.test(normalizar(p));
}

function apresentar(p: string): string {
  const t = p.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  const comMaiuscula = t.charAt(0).toUpperCase() + t.slice(1);
  return /\?$/.test(comMaiuscula) ? comMaiuscula : `${comMaiuscula}?`;
}

export interface Sugestao {
  chave: string;
  texto: string;
  vezes: number;
}

/**
 * Agrupa pelo texto normalizado; fica a forma escrita mais comum. `processo`: no site de um processo, só
 * perguntas daquele processo ou sem processo.
 */
export function maisFeitas(
  perguntas: string[],
  ocultas: Set<string>,
  regras: RegrasClassificacao,
  processo?: string,
  maximo = MAX_SUGESTOES,
): Sugestao[] {
  const grupos = new Map<string, { formas: Map<string, number>; vezes: number }>();
  for (const p of perguntas) {
    if (!sugestaoSegura(p)) continue;
    const chave = normalizar(p);
    if (!chave || ocultas.has(chave)) continue;
    const g = grupos.get(chave) ?? { formas: new Map(), vezes: 0 };
    g.vezes++;
    g.formas.set(p.trim(), (g.formas.get(p.trim()) ?? 0) + 1);
    grupos.set(chave, g);
  }
  return [...grupos.entries()]
    .filter(([, g]) => g.vezes >= MIN_REPETICOES)
    .map(([chave, g]) => {
      const forma = [...g.formas.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      return { chave, texto: apresentar(forma), vezes: g.vezes };
    })
    .filter((s) => {
      if (!processo) return true;
      const do_ = inferirProcesso([s.texto], regras);
      return !do_ || do_ === processo;
    })
    .sort((a, b) => b.vezes - a.vezes || a.texto.localeCompare(b.texto))
    .slice(0, maximo);
}

export async function lerSugestoes(db: D1Database, agora: Date, regras: RegrasClassificacao, processo?: string, maximo?: number): Promise<Sugestao[]> {
  const desde = diaSaoPaulo(new Date(agora.getTime() - (DIAS_SUGESTOES - 1) * MS_DIA));
  const [perguntas, ocultas] = await Promise.all([
    db.prepare("SELECT pergunta FROM perguntas_registro WHERE tipo = 'respondida' AND dia >= ?").bind(desde).all<{ pergunta: string }>(),
    db.prepare('SELECT chave FROM sugestoes_ocultas').all<{ chave: string }>(),
  ]);
  return maisFeitas(
    perguntas.results.map((l) => l.pergunta),
    new Set(ocultas.results.map((l) => l.chave)),
    regras,
    processo,
    maximo,
  );
}

/** GET /sugestoes: sem IA; o navegador guarda por 1 hora. Falha devolve lista vazia (o widget usa as fixas). */
export async function tratarSugestoes(
  req: Request,
  env: { DB: D1Database },
  origens: string[],
  regras: RegrasClassificacao,
  processoDoSite: (origem: string) => string | undefined,
  agora = new Date(),
): Promise<Response> {
  const origem = req.headers.get('Origin');
  const cors = cabecalhosCors(origem, origens);
  if (!origemPermitida(origem, origens)) return json({ erro: 'Origem não permitida.' }, 403, cors);
  let sugestoes: string[] = [];
  try {
    sugestoes = (await lerSugestoes(env.DB, agora, regras, processoDoSite(origem))).map((s) => s.texto);
  } catch {
    console.error('Falha ao ler as sugestões');
  }
  return new Response(JSON.stringify({ sugestoes }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
