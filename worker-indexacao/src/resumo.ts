/**
 * Resumo semanal do assistente (perguntas, avaliações e páginas nas respostas com 👎), lido do D1
 * pelo mesmo token restrito da indexação. O workflow `resumo-semanal.yml` publica o texto como issue.
 *
 * O repositório é público: o resumo traz só números e páginas públicas dos sites, nunca o texto das
 * respostas (esse fica no painel, com senha).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarClienteCloudflare, type ClienteCloudflare } from './cloudflare.js';

const MS_DIA = 86_400_000;
const MAX_PAGINAS = 5;
const PAINEL = 'https://chatbot-coperse.coperse-furg.workers.dev/painel';

/** Dia (aaaa-mm-dd) em Brasília. */
export function diaBr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export interface Semana {
  inicio: string;
  fim: string;
  perguntas: Record<string, number>;
  ajudou: number;
  nao: number;
}

export interface DadosResumo {
  atual: Semana;
  anterior: Semana;
  paginas: { url: string; titulo: string; n: number }[];
}

/** Os 7 dias completos até ontem (Brasília) e os 7 anteriores. */
export function periodos(agora: Date): { atual: [string, string]; anterior: [string, string] } {
  const d = (n: number) => diaBr(new Date(agora.getTime() - n * MS_DIA));
  return { atual: [d(7), d(1)], anterior: [d(14), d(8)] };
}

async function semana(cf: ClienteCloudflare, [inicio, fim]: [string, string]): Promise<Semana> {
  const perguntas: Record<string, number> = {};
  for (const l of await cf.d1('SELECT tipo, SUM(n) AS n FROM contagem_perguntas WHERE dia BETWEEN ? AND ? GROUP BY tipo', [inicio, fim])) {
    perguntas[String(l.tipo)] = Number(l.n);
  }
  const [a] = await cf.d1('SELECT COALESCE(SUM(util), 0) AS ajudou, COUNT(*) - COALESCE(SUM(util), 0) AS nao FROM avaliacoes WHERE dia BETWEEN ? AND ?', [inicio, fim]);
  return { inicio, fim, perguntas, ajudou: Number(a?.ajudou ?? 0), nao: Number(a?.nao ?? 0) };
}

export async function lerDados(cf: ClienteCloudflare, agora: Date): Promise<DadosResumo> {
  const p = periodos(agora);
  const atual = await semana(cf, p.atual);
  const anterior = await semana(cf, p.anterior);
  const n = new Map<string, number>();
  for (const l of await cf.d1('SELECT fontes FROM avaliacoes WHERE util = 0 AND fontes IS NOT NULL AND dia BETWEEN ? AND ?', p.atual)) {
    let urls: unknown = [];
    try {
      urls = JSON.parse(String(l.fontes));
    } catch {
      // linha inválida: ignora
    }
    if (Array.isArray(urls)) for (const u of new Set(urls.filter((x): x is string => typeof x === 'string'))) n.set(u, (n.get(u) ?? 0) + 1);
  }
  const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_PAGINAS);
  const titulos = new Map<string, string>();
  if (top.length) {
    const linhas = await cf.d1(`SELECT url, titulo FROM paginas WHERE url IN (${top.map(() => '?').join(',')})`, top.map(([u]) => u));
    for (const l of linhas) titulos.set(String(l.url), String(l.titulo || l.url));
  }
  return { atual, anterior, paginas: top.map(([url, vezes]) => ({ url, titulo: titulos.get(url) ?? url, n: vezes })) };
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('pt-BR')}%`;

function numeros(s: Semana) {
  const respondidas = s.perguntas.respondida ?? 0;
  const semBase = s.perguntas.sem_base ?? 0;
  const recusa = s.perguntas.recusa ?? 0;
  const total = respondidas + semBase + recusa;
  const votos = s.ajudou + s.nao;
  return { total, semBase, recusa, sem: semBase + recusa, votos, taxa: votos ? s.ajudou / votos : null };
}

function comparar(atual: number | null, anterior: number | null, emPct = false): string {
  if (atual === null || anterior === null) return '';
  const dif = atual - anterior;
  if (Math.abs(dif) < (emPct ? 0.0005 : 0.5)) return ' (igual à semana anterior)';
  const valor = emPct ? `${(Math.round(Math.abs(dif) * 1000) / 10).toLocaleString('pt-BR')} ponto${Math.abs(dif) >= 0.015 ? 's' : ''}` : String(Math.abs(dif));
  return ` (${dif > 0 ? '+' : '−'}${valor} sobre a semana anterior)`;
}

export function tituloResumo(d: DadosResumo): string {
  return `Resumo semanal do assistente: ${br(d.atual.inicio)} a ${br(d.atual.fim)}`;
}

export function montarResumo(d: DadosResumo): string {
  const a = numeros(d.atual);
  const b = numeros(d.anterior);
  const linhas = [
    `Semana de ${br(d.atual.inicio)} a ${br(d.atual.fim)}, contando só as perguntas feitas nos sites da FURG.`,
    '',
    '## Perguntas',
    '',
    `- Perguntas sobre os processos seletivos: **${a.total}**${comparar(a.total, b.total)}`,
    `- Sem resposta: **${a.sem}**${a.total ? ` (${pct(a.sem / a.total)})` : ''}, das quais ${a.semBase} não encontradas nas páginas e ${a.recusa} recusadas (fora do tema ou caso individual)`,
    '',
    '## Avaliações das respostas',
    '',
  ];
  if (a.votos) {
    linhas.push(
      `- Avaliações: **${a.votos}** (👍 ${d.atual.ajudou} · 👎 ${d.atual.nao})`,
      `- Taxa de aprovação: **${pct(a.taxa!)}**${comparar(a.taxa, b.taxa, true)}`,
    );
  } else {
    linhas.push('- Nenhuma avaliação na semana.');
  }
  linhas.push('', '## Páginas nas respostas que não ajudaram', '');
  if (d.paginas.length) {
    for (const p of d.paginas) linhas.push(`- ${p.n}× [${p.titulo.replace(/[[\]]/g, '')}](${p.url})`);
    linhas.push('', 'Vale conferir se essas páginas estão atualizadas e claras.');
  } else {
    linhas.push('- Nenhuma.');
  }
  linhas.push(
    '',
    '---',
    `As respostas marcadas com 👎 e os números por dia estão no [painel](${PAINEL}) (senha da reindexação manual). ` +
      'Este aviso é aberto toda segunda-feira pelo workflow `resumo-semanal` e o da semana anterior é fechado.',
  );
  return linhas.join('\n') + '\n';
}

async function main(): Promise<void> {
  const env = process.env;
  for (const nome of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'D1_DATABASE_ID']) {
    if (!env[nome]) {
      console.error(`Variável de ambiente obrigatória ausente: ${nome}`);
      process.exit(1);
    }
  }
  const cf = criarClienteCloudflare({
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    token: env.CLOUDFLARE_API_TOKEN!,
    databaseId: env.D1_DATABASE_ID!,
    indice: env.VECTORIZE_INDICE || '',
  });
  const dados = await lerDados(cf, new Date());
  const [saida = 'resumo.md'] = process.argv.slice(2);
  writeFileSync(saida, montarResumo(dados));
  console.log(tituloResumo(dados));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`Falha no resumo: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
