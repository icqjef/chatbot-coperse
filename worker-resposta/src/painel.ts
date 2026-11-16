/**
 * Painel do assistente: GET /painel (página), GET /painel.js (script) e POST /painel/dados (números).
 * Mostra as avaliações (👍/👎), as páginas citadas nas respostas que não ajudaram e quantas perguntas
 * ficaram sem resposta. Os dados exigem a mesma senha da reindexação manual (REINDEX_TOKEN) e passam
 * pelo limite por minuto do visitante antes da senha, para frear tentativas de adivinhá-la.
 */
import type { Env } from './index';
import { iguaisEmTempoConstante } from './operacao';
import { aplicarLimite, json } from './perguntar';
import { diaSaoPaulo } from './limites';

const MIN_SENHA = 32;
const PERIODOS = new Set([7, 30, 90]);
const MAX_NEGATIVAS = 50;
const MAX_PAGINAS_RUINS = 10;
const MAX_SEM_RESPOSTA = 100;
const MS_DIA = 86_400_000;

const CABECALHOS_PAGINA = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

export function paginaPainel(): Response {
  return new Response(PAINEL_HTML, {
    headers: {
      ...CABECALHOS_PAGINA,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

export function scriptPainel(): Response {
  return new Response(PAINEL_JS, {
    headers: { ...CABECALHOS_PAGINA, 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}

export function lerFontes(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  try {
    const v: unknown = JSON.parse(bruto);
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

async function tituloDasPaginas(db: D1Database, urls: string[]): Promise<Map<string, string>> {
  const unicas = [...new Set(urls)].slice(0, 90);
  if (!unicas.length) return new Map();
  const r = await db
    .prepare(`SELECT url, titulo FROM paginas WHERE url IN (${unicas.map(() => '?').join(',')})`)
    .bind(...unicas)
    .all<{ url: string; titulo: string | null }>();
  return new Map(r.results.map((l) => [l.url, l.titulo || l.url]));
}

/** Contagem das URLs (cada avaliação conta uma vez por página), da mais citada para a menos. */
export function contarUrls(listas: (string | null)[], maximo = MAX_PAGINAS_RUINS): [string, number][] {
  const n = new Map<string, number>();
  for (const bruto of listas) for (const url of new Set(lerFontes(bruto))) n.set(url, (n.get(url) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maximo);
}

export async function tratarPainelDados(req: Request, env: Env, agora = new Date()): Promise<Response> {
  const cab = { 'Cache-Control': 'no-store' };
  if (!env.REINDEX_TOKEN || env.REINDEX_TOKEN.length < MIN_SENHA) return json({ erro: 'Painel indisponível.' }, 503, cab);
  const negado = await aplicarLimite(req, env.LIMITADOR, cab);
  if (negado) return negado;
  const enviado = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1] ?? '';
  if (!(await iguaisEmTempoConstante(enviado, env.REINDEX_TOKEN))) return json({ erro: 'Senha incorreta.' }, 401, cab);

  const pedido = Number(new URL(req.url).searchParams.get('dias'));
  const dias = PERIODOS.has(pedido) ? pedido : 30;
  const fim = diaSaoPaulo(agora);
  const inicio = diaSaoPaulo(new Date(agora.getTime() - (dias - 1) * MS_DIA));
  try {
    const registro = env.REGISTRAR_PERGUNTAS === 'true';
    const [porDia, negativas, perguntas, fontesNegativas, semResposta, tempos] = await Promise.all([
      env.DB.prepare(
        'SELECT dia, SUM(util) AS ajudou, COUNT(*) - SUM(util) AS nao FROM avaliacoes WHERE dia >= ? GROUP BY dia ORDER BY dia',
      )
        .bind(inicio)
        .all<{ dia: string; ajudou: number; nao: number }>(),
      env.DB.prepare(`SELECT dia, resposta, fontes FROM avaliacoes WHERE util = 0 AND dia >= ? ORDER BY id DESC LIMIT ${MAX_NEGATIVAS}`)
        .bind(inicio)
        .all<{ dia: string; resposta: string; fontes: string | null }>(),
      env.DB.prepare('SELECT dia, tipo, n FROM contagem_perguntas WHERE dia >= ? ORDER BY dia')
        .bind(inicio)
        .all<{ dia: string; tipo: string; n: number }>(),
      env.DB.prepare('SELECT fontes FROM avaliacoes WHERE util = 0 AND dia >= ? AND fontes IS NOT NULL')
        .bind(inicio)
        .all<{ fontes: string }>(),
      registro
        ? env.DB.prepare(
            `SELECT dia, tipo, pergunta FROM perguntas_registro WHERE tipo IN ('sem_base', 'recusa', 'limite') AND dia >= ? ORDER BY id DESC LIMIT ${MAX_SEM_RESPOSTA}`,
          )
            .bind(inicio)
            .all<{ dia: string; tipo: string; pergunta: string }>()
        : Promise.resolve({ results: [] as { dia: string; tipo: string; pergunta: string }[] }),
      env.DB.prepare('SELECT faixa, SUM(n) AS n FROM tempo_resposta WHERE dia >= ? GROUP BY faixa')
        .bind(inicio)
        .all<{ faixa: string; n: number }>(),
    ]);
    const top = contarUrls(fontesNegativas.results.map((l) => l.fontes));
    const titulos = await tituloDasPaginas(env.DB, [...top.map(([u]) => u), ...negativas.results.flatMap((n) => lerFontes(n.fontes))]);
    return json(
      {
        inicio,
        fim,
        dias,
        porDia: porDia.results,
        perguntas: perguntas.results,
        cota: Number(env.COTA_DIARIA) || 1000,
        registro,
        semResposta: semResposta.results,
        tempos: tempos.results,
        paginasRuins: top.map(([url, n]) => ({ url, titulo: titulos.get(url) ?? url, n })),
        negativas: negativas.results.map((n) => ({
          dia: n.dia,
          resposta: n.resposta,
          fontes: lerFontes(n.fontes).map((url) => ({ url, titulo: titulos.get(url) ?? url })),
        })),
      },
      200,
      cab,
    );
  } catch {
    console.error('Falha ao ler as avaliações');
    return json({ erro: 'Não foi possível ler as avaliações.' }, 503, cab);
  }
}

const ESTILO_TEMA = (s: string) => `
    --fundo: ${s === 'claro' ? '#f4f5f7' : '#111110'}; --superficie: ${s === 'claro' ? '#fcfcfb' : '#1a1a19'}; --borda: ${s === 'claro' ? '#e1e3e6' : '#2e2e2c'};
    --texto: ${s === 'claro' ? '#0b0b0b' : '#f0efec'}; --texto-2: ${s === 'claro' ? '#52514e' : '#c3c2b7'}; --texto-3: ${s === 'claro' ? '#6b6a66' : '#a3a29a'};
    --grade: ${s === 'claro' ? '#e6e6e3' : '#2b2b29'}; --serie-1: ${s === 'claro' ? '#2a78d6' : '#3987e5'}; --serie-2: ${s === 'claro' ? '#eb6834' : '#d95926'};
    --acento: ${s === 'claro' ? '#1f5fbf' : '#6ea4ec'}; --sobre-acento: ${s === 'claro' ? '#fff' : '#0b0b0b'}; --erro: ${s === 'claro' ? '#b3261e' : '#f2a19c'};`;

const PAINEL_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Painel do assistente</title>
<style>
:root { color-scheme: light;${ESTILO_TEMA('claro')} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;${ESTILO_TEMA('escuro')} } }
:root[data-theme="dark"] { color-scheme: dark;${ESTILO_TEMA('escuro')} }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 16px; margin: 0; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--texto-2); margin: 28px 0 10px; }
.sub { color: var(--texto-2); margin: 4px 0 20px; font-size: 14px; }
.cartao { background: var(--superficie); border: 1px solid var(--borda); border-radius: 12px; padding: 16px; }
[hidden] { display: none !important; }
button, input { font: inherit; }
a { color: var(--acento); overflow-wrap: anywhere; }
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
#entrar { max-width: 420px; }
#entrar label { display: block; font-weight: 600; margin-bottom: 6px; }
#entrar .linha { display: flex; gap: 8px; }
#entrar input { flex: 1; min-width: 0; padding: 9px 11px; border: 1px solid var(--borda); border-radius: 8px; background: var(--fundo); color: var(--texto); }
.botao { padding: 9px 16px; border-radius: 8px; border: 0; background: var(--acento); color: var(--sobre-acento); font-weight: 600; cursor: pointer; }
.msg-erro { color: var(--erro); margin: 8px 0 0; font-size: 14px; }
.barra { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; }
.periodo { display: inline-flex; border: 1px solid var(--borda); border-radius: 8px; overflow: hidden; background: var(--superficie); }
.periodo button { border: 0; background: transparent; color: var(--texto-2); padding: 7px 14px; cursor: pointer; }
.periodo button[aria-pressed="true"] { background: var(--acento); color: var(--sobre-acento); font-weight: 600; }
.leve { background: transparent; border: 1px solid var(--borda); color: var(--texto-2); border-radius: 8px; padding: 7px 12px; cursor: pointer; }
.atualizado { color: var(--texto-3); font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.kpi .rotulo { color: var(--texto-2); font-size: 13px; }
.kpi .valor { font-size: 30px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi .nota { color: var(--texto-3); font-size: 12.5px; }
.grafico-cab { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
.legenda { display: flex; gap: 16px; font-size: 13px; color: var(--texto-2); }
.legenda span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; background: var(--c); }
.ver-tabela { background: transparent; border: 0; color: var(--acento); cursor: pointer; padding: 0; text-decoration: underline; font-size: 13px; margin-top: 4px; }
.grafico { position: relative; margin-top: 12px; }
.grafico svg { display: block; width: 100%; height: 220px; overflow: visible; }
.grafico text { fill: var(--texto-3); font-size: 11px; }
.dica { position: absolute; pointer-events: none; background: var(--superficie); border: 1px solid var(--borda); border-radius: 8px; padding: 8px 10px; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,.15); white-space: nowrap; }
.dica b { display: block; margin-bottom: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--borda); }
th { color: var(--texto-2); font-weight: 600; }
.vazio { color: var(--texto-2); padding: 20px 0; text-align: center; }
.lista { list-style: none; margin: 0; padding: 0; }
.lista > li { padding: 12px 0; border-top: 1px solid var(--borda); }
.lista > li:first-child { border-top: 0; }
.lista .dia { color: var(--texto-3); font-size: 12.5px; }
.lista p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.lista .fontes { font-size: 13px; margin-top: 4px; color: var(--texto-2); }
.paginas li { display: flex; gap: 12px; align-items: baseline; }
.paginas .n { min-width: 2.5em; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.ajuda { color: var(--texto-3); font-size: 13px; margin: 4px 0 8px; }
.secao { margin-top: 12px; }
.etiqueta { display: inline-block; font-size: 12px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--borda); color: var(--texto-2); margin-left: 6px; }
.alerta { color: var(--erro); font-weight: 600; }
.duas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kpi .valor { font-size: 24px; } .duas { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>Painel do assistente</h1>
  <p class="sub">Como os candidatos avaliam as respostas do assistente COPERSE e quantas perguntas ficam sem resposta. Nenhuma pergunta nem dado pessoal é guardado: só contagens, votos e as respostas do próprio assistente.</p>

  <form id="entrar" class="cartao" novalidate>
    <label for="senha">Senha (a mesma da reindexação manual)</label>
    <div class="linha">
      <input id="senha" type="password" autocomplete="current-password" required>
      <button class="botao" type="submit">Entrar</button>
    </div>
    <p id="erro-entrar" class="msg-erro" role="alert" hidden></p>
  </form>

  <section id="painel" hidden>
    <div class="barra">
      <div class="periodo" role="group" aria-label="Período">
        <button type="button" data-dias="7" aria-pressed="false">7 dias</button>
        <button type="button" data-dias="30" aria-pressed="true">30 dias</button>
        <button type="button" data-dias="90" aria-pressed="false">90 dias</button>
      </div>
      <div><span id="atualizado" class="atualizado"></span> <button type="button" id="atualizar" class="leve">Atualizar</button> <button type="button" id="sair" class="leve">Sair</button></div>
    </div>
    <p id="erro-painel" class="msg-erro" role="alert" hidden></p>

    <h3>Perguntas</h3>
    <div class="kpis">
      <div class="cartao kpi"><div class="rotulo">Perguntas sobre os processos</div><div class="valor" id="k-perguntas">–</div><div class="nota" id="k-periodo"></div></div>
      <div class="cartao kpi"><div class="rotulo">Sem resposta</div><div class="valor" id="k-sem">–</div><div class="nota" id="k-sem-nota"></div></div>
      <div class="cartao kpi"><div class="rotulo">Não encontradas nas páginas</div><div class="valor" id="k-sem-base">–</div><div class="nota">faltou página ou edital</div></div>
      <div class="cartao kpi"><div class="rotulo">Recusadas</div><div class="valor" id="k-recusa">–</div><div class="nota">fora do tema ou caso individual</div></div>
    </div>
    <div class="cartao">
      <div class="grafico-cab">
        <h2>Perguntas por dia</h2>
        <div class="legenda"><span style="--c: var(--serie-1)">Respondidas</span><span style="--c: var(--serie-2)">Sem resposta</span></div>
      </div>
      <button type="button" class="ver-tabela" data-alvo="perguntas" aria-expanded="false">Ver como tabela</button>
      <div class="grafico" id="grafico-perguntas"></div>
      <div id="tabela-perguntas" hidden></div>
    </div>
    <div class="duas">
      <div class="cartao kpi"><div class="rotulo">Dia com mais perguntas</div><div class="valor" id="k-pico">–</div><div class="nota" id="k-pico-nota"></div></div>
      <div class="cartao kpi"><div class="rotulo">Barradas pela cota diária</div><div class="valor" id="k-limite">–</div><div class="nota" id="k-limite-nota"></div></div>
    </div>
    <div class="kpis">
      <div class="cartao kpi"><div class="rotulo">Tempo de resposta (mediana)</div><div class="valor" id="k-tempo">–</div><div class="nota" id="k-tempo-nota">metade das respostas chega até esse tempo</div></div>
      <div class="cartao kpi"><div class="rotulo">Respostas acima de 5 s</div><div class="valor" id="k-lentas">–</div><div class="nota" id="k-lentas-nota">até a resposta completa</div></div>
    </div>
    <div class="cartao secao" id="cartao-sem-resposta">
      <h2>Perguntas sem resposta</h2>
      <p class="ajuda" id="ajuda-sem-resposta">As mais recentes primeiro (até 100). Perguntas que se repetem mostram o que falta nas páginas ou no edital. Dados pessoais aparecem como [removido].</p>
      <ul class="lista" id="sem-resposta"></ul>
    </div>

    <h3>Avaliações das respostas</h3>
    <div class="kpis">
      <div class="cartao kpi"><div class="rotulo">Avaliações</div><div class="valor" id="k-total">–</div><div class="nota">votos 👍 e 👎</div></div>
      <div class="cartao kpi"><div class="rotulo">Taxa de aprovação</div><div class="valor" id="k-taxa">–</div><div class="nota">votos 👍 sobre o total</div></div>
      <div class="cartao kpi"><div class="rotulo">👍 Ajudou</div><div class="valor" id="k-sim">–</div><div class="nota">votos</div></div>
      <div class="cartao kpi"><div class="rotulo">👎 Não ajudou</div><div class="valor" id="k-nao">–</div><div class="nota">votos</div></div>
    </div>
    <div class="cartao">
      <div class="grafico-cab">
        <h2>Avaliações por dia</h2>
        <div class="legenda"><span style="--c: var(--serie-1)">Ajudou</span><span style="--c: var(--serie-2)">Não ajudou</span></div>
      </div>
      <button type="button" class="ver-tabela" data-alvo="avaliacoes" aria-expanded="false">Ver como tabela</button>
      <div class="grafico" id="grafico-avaliacoes"></div>
      <div id="tabela-avaliacoes" hidden></div>
    </div>

    <div class="duas">
      <div class="cartao">
        <h2>Páginas nas respostas que não ajudaram</h2>
        <p class="ajuda">Quantas respostas com 👎 citaram cada página. As do topo são as primeiras a revisar.</p>
        <ol class="lista paginas" id="paginas"></ol>
      </div>
      <div class="cartao">
        <h2>Respostas que não ajudaram</h2>
        <p class="ajuda">As mais recentes primeiro (até 50).</p>
        <ul class="lista" id="negativas"></ul>
      </div>
    </div>
  </section>
</main>
<script src="/painel.js" defer></script>
</body>
</html>
`;

const PAINEL_JS = `(() => {
  'use strict';
  const CHAVE = 'painel-coperse-senha';
  const $ = (id) => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  let senha = '';
  let dias = 30;
  let dados = null;

  function ler(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }
  function gravar(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} }
  function el(tag, attrs, texto) {
    const e = tag.startsWith('svg:') ? document.createElementNS(SVG, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  const br = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const brAno = (iso) => br(iso) + '/' + iso.slice(0, 4);
  const num = (n) => n.toLocaleString('pt-BR');
  const pct = (n) => (Math.round(n * 1000) / 10).toLocaleString('pt-BR') + '%';
  const link = (url, texto) => {
    const a = el('a', { href: /^https:\\/\\//.test(url) ? url : '#', target: '_blank', rel: 'noopener noreferrer' }, texto);
    return a;
  };

  function erro(id, msg) { const p = $(id); p.textContent = msg; p.hidden = !msg; }

  async function carregar() {
    erro('erro-painel', '');
    let r;
    try {
      r = await fetch('/painel/dados?dias=' + dias, { method: 'POST', headers: { Authorization: 'Bearer ' + senha } });
    } catch {
      erro(dados ? 'erro-painel' : 'erro-entrar', 'Sem conexão. Tente de novo.');
      return false;
    }
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 401) { sair(); erro('erro-entrar', 'Senha incorreta.'); return false; }
    if (!r.ok) { erro(dados ? 'erro-painel' : 'erro-entrar', corpo.erro || 'Não foi possível carregar.'); return false; }
    dados = corpo;
    if (!$('painel').hidden) desenhar();
    $('atualizado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return true;
  }

  /** Um registro por dia do período, com zero nos dias sem nada. */
  function porDia(linhas, montar) {
    const mapa = new Map();
    for (const l of linhas) mapa.set(l.dia, montar(mapa.get(l.dia), l));
    const out = [];
    const t1 = Date.parse(dados.fim + 'T12:00:00Z');
    for (let t = Date.parse(dados.inicio + 'T12:00:00Z'); t <= t1; t += 86400000) {
      const dia = new Date(t).toISOString().slice(0, 10);
      out.push(Object.assign({ dia, a: 0, b: 0 }, mapa.get(dia)));
    }
    return out;
  }

  function desenhar() {
    const limite = dados.perguntas.filter((l) => l.tipo === 'limite').reduce((s, l) => s + Number(l.n), 0);
    const perg = porDia(dados.perguntas.filter((l) => l.tipo !== 'conversa' && l.tipo !== 'limite'), (acc, l) => {
      const o = acc || { a: 0, b: 0, semBase: 0, recusa: 0 };
      const n = Number(l.n);
      if (l.tipo === 'respondida') o.a += n; else o.b += n;
      if (l.tipo === 'sem_base') o.semBase += n;
      if (l.tipo === 'recusa') o.recusa += n;
      return o;
    });
    const resp = perg.reduce((s, d) => s + d.a, 0);
    const sem = perg.reduce((s, d) => s + d.b, 0);
    const semBase = perg.reduce((s, d) => s + (d.semBase || 0), 0);
    const recusa = perg.reduce((s, d) => s + (d.recusa || 0), 0);
    $('k-perguntas').textContent = num(resp + sem);
    $('k-periodo').textContent = brAno(dados.inicio) + ' a ' + brAno(dados.fim);
    $('k-sem').textContent = num(sem);
    $('k-sem-nota').textContent = resp + sem ? pct(sem / (resp + sem)) + ' das perguntas' : 'das perguntas';
    $('k-sem-base').textContent = num(semBase);
    $('k-recusa').textContent = num(recusa);
    grafico('perguntas', perg, ['Respondidas', 'Sem resposta'], 'Nenhuma pergunta no período.');
    const pico = perg.reduce((m, d) => (d.a + d.b > m.n ? { n: d.a + d.b, dia: d.dia } : m), { n: 0, dia: '' });
    $('k-pico').textContent = num(pico.n);
    const usoPico = pico.n / dados.cota;
    $('k-pico-nota').replaceChildren(pico.dia ? (brAno(pico.dia) + ': ' + pct(usoPico) + ' da cota de ' + num(dados.cota) + ' por dia') : 'cota de ' + num(dados.cota) + ' perguntas por dia');
    if (usoPico >= 0.8) $('k-pico-nota').append(el('span', { class: 'alerta' }, ' Perto do limite.'));
    $('k-limite').textContent = num(limite);
    $('k-limite-nota').textContent = limite ? 'candidatos que receberam "limite de hoje atingido"' : 'nenhum candidato barrado';
    semResposta();
    tempos();

    const aval = porDia(dados.porDia, (_acc, l) => ({ a: Number(l.ajudou), b: Number(l.nao) }));
    const sim = aval.reduce((s, d) => s + d.a, 0);
    const nao = aval.reduce((s, d) => s + d.b, 0);
    $('k-total').textContent = num(sim + nao);
    $('k-taxa').textContent = sim + nao ? pct(sim / (sim + nao)) : '–';
    $('k-sim').textContent = num(sim);
    $('k-nao').textContent = num(nao);
    grafico('avaliacoes', aval, ['Ajudou', 'Não ajudou'], 'Nenhuma avaliação no período.');

    paginas();
    negativas();
  }

  function grafico(nome, serie, rotulos, msgVazio) {
    const caixa = $('grafico-' + nome);
    const total = serie.reduce((s, d) => s + d.a + d.b, 0);
    caixa.replaceChildren();
    tabela(nome, serie, rotulos, msgVazio);
    if (!total) { caixa.append(el('p', { class: 'vazio' }, msgVazio)); return; }
    const L = Math.max(300, caixa.clientWidth || 640), A = 220, mE = 34, mD = 8, mT = 10, mB = 26;
    const larg = L - mE - mD, alt = A - mT - mB;
    const maxV = Math.max(1, ...serie.map((d) => d.a + d.b));
    const passo = Math.max(1, Math.ceil(maxV / 4));
    const topo = passo * Math.ceil(maxV / passo);
    const y = (v) => mT + alt - (v / topo) * alt;
    const banda = larg / serie.length;
    const bw = Math.max(2, Math.min(28, banda * 0.62));
    const svg = el('svg:svg', { viewBox: '0 0 ' + L + ' ' + A, role: 'img', 'aria-label': 'Gráfico de barras por dia, total ' + total + ' no período. Use "Ver como tabela" para os números.' });
    for (let v = 0; v <= topo; v += passo) {
      svg.append(el('svg:line', { x1: mE, x2: L - mD, y1: y(v), y2: y(v), stroke: 'var(--grade)', 'stroke-width': v ? 1 : 1.5 }));
      svg.append(el('svg:text', { x: mE - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    const cada = Math.ceil(serie.length / Math.max(2, Math.floor(larg / 56)));
    const dica = el('div', { class: 'dica', hidden: '' });
    serie.forEach((d, i) => {
      const cx = mE + banda * i + banda / 2, x = cx - bw / 2;
      if (i % cada === 0 || i === serie.length - 1) svg.append(el('svg:text', { x: cx, y: A - 6, 'text-anchor': 'middle' }, br(d.dia)));
      const segs = [['a', 'var(--serie-1)'], ['b', 'var(--serie-2)']].filter(([k]) => d[k] > 0);
      let base = 0;
      segs.forEach(([k, cor], j) => {
        const y0 = y(base), y1 = y(base + d[k]);
        const topoSeg = j === segs.length - 1;
        const h = Math.max(1, y0 - y1 - (topoSeg ? 0 : 2));
        const yy = y0 - h;
        const r = topoSeg ? Math.min(4, bw / 2, h) : 0;
        const p = 'M' + x + ',' + y0 + 'V' + (yy + r) + (r ? 'Q' + x + ',' + yy + ' ' + (x + r) + ',' + yy : '') + 'H' + (x + bw - r) + (r ? 'Q' + (x + bw) + ',' + yy + ' ' + (x + bw) + ',' + (yy + r) : '') + 'V' + y0 + 'Z';
        svg.append(el('svg:path', { d: p, fill: cor }));
        base += d[k];
      });
      const alvo = el('svg:rect', { x: mE + banda * i, y: mT, width: banda, height: alt, fill: 'transparent' });
      alvo.addEventListener('mouseenter', () => {
        dica.replaceChildren(el('b', {}, brAno(d.dia)), document.createTextNode(rotulos[0] + ': ' + d.a), el('br'), document.createTextNode(rotulos[1] + ': ' + d.b));
        dica.hidden = false;
        const px = (cx / L) * caixa.clientWidth;
        dica.style.left = Math.min(Math.max(0, px - 60), caixa.clientWidth - 150) + 'px';
        dica.style.top = '0px';
      });
      alvo.addEventListener('mouseleave', () => { dica.hidden = true; });
      svg.append(alvo);
    });
    caixa.append(svg, dica);
  }

  function tabela(nome, serie, rotulos, msgVazio) {
    const t = el('table');
    const cab = el('tr');
    ['Dia', rotulos[0], rotulos[1], 'Total'].forEach((h) => cab.append(el('th', { scope: 'col' }, h)));
    const thead = el('thead');
    thead.append(cab);
    t.append(thead);
    const corpo = el('tbody');
    serie.filter((d) => d.a + d.b > 0).reverse().forEach((d) => {
      const tr = el('tr');
      [brAno(d.dia), d.a, d.b, d.a + d.b].forEach((v) => tr.append(el('td', {}, String(v))));
      corpo.append(tr);
    });
    t.append(corpo);
    $('tabela-' + nome).replaceChildren(corpo.children.length ? t : el('p', { class: 'vazio' }, msgVazio));
  }

  // Faixas na ordem; a mediana é a primeira faixa que alcança metade das respostas.
  const FAIXAS = [['ate1', 'até 1 s'], ['ate2', 'até 2 s'], ['ate3', 'até 3 s'], ['ate5', 'até 5 s'], ['ate10', 'até 10 s'], ['mais10', 'mais de 10 s']];
  function tempos() {
    const n = new Map((dados.tempos || []).map((l) => [l.faixa, Number(l.n)]));
    const total = FAIXAS.reduce((s, [f]) => s + (n.get(f) || 0), 0);
    if (!total) {
      $('k-tempo').textContent = '–';
      $('k-lentas').textContent = '–';
      $('k-lentas-nota').textContent = 'sem medições no período';
      return;
    }
    let soma = 0;
    const mediana = FAIXAS.find(([f]) => (soma += n.get(f) || 0) >= total / 2);
    $('k-tempo').textContent = mediana[1];
    const lentas = (n.get('ate10') || 0) + (n.get('mais10') || 0);
    $('k-lentas').textContent = pct(lentas / total);
    $('k-lentas-nota').textContent = num(lentas) + ' de ' + num(total) + ' respostas';
  }

  const TIPOS = { sem_base: 'não encontrada', recusa: 'recusada', limite: 'cota esgotada' };
  function semResposta() {
    const ul = $('sem-resposta');
    ul.replaceChildren();
    if (!dados.registro) {
      $('ajuda-sem-resposta').textContent = 'O registro de perguntas está desligado (REGISTRAR_PERGUNTAS).';
      return;
    }
    if (!dados.semResposta.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma pergunta sem resposta no período.')); return; }
    for (const p of dados.semResposta) {
      const li = el('li');
      const dia = el('div', { class: 'dia' }, brAno(p.dia));
      dia.append(el('span', { class: 'etiqueta' }, TIPOS[p.tipo] || p.tipo));
      li.append(dia, el('p', {}, p.pergunta));
      ul.append(li);
    }
  }

  function paginas() {
    const ol = $('paginas');
    ol.replaceChildren();
    if (!dados.paginasRuins.length) { ol.append(el('li', { class: 'vazio' }, 'Nenhuma página citada em respostas com 👎 no período.')); return; }
    for (const p of dados.paginasRuins) {
      const li = el('li');
      li.append(el('span', { class: 'n', 'aria-label': p.n + (p.n === 1 ? ' resposta' : ' respostas') }, String(p.n)), link(p.url, p.titulo));
      ol.append(li);
    }
  }

  function negativas() {
    const ul = $('negativas');
    ul.replaceChildren();
    if (!dados.negativas.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma resposta marcada como "não ajudou" no período.')); return; }
    for (const n of dados.negativas) {
      const li = el('li');
      li.append(el('div', { class: 'dia' }, brAno(n.dia)), el('p', {}, n.resposta));
      if (n.fontes && n.fontes.length) {
        const f = el('div', { class: 'fontes' }, 'Fontes: ');
        n.fontes.forEach((x, i) => { if (i) f.append('; '); f.append(link(x.url, x.titulo)); });
        li.append(f);
      }
      ul.append(li);
    }
  }

  function entrar() { $('entrar').hidden = true; $('painel').hidden = false; desenhar(); }
  function sair() { senha = ''; dados = null; gravar(CHAVE, ''); $('painel').hidden = true; $('entrar').hidden = false; $('senha').value = ''; $('senha').focus(); }

  $('entrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    erro('erro-entrar', '');
    senha = $('senha').value.trim();
    if (!senha) { erro('erro-entrar', 'Digite a senha.'); return; }
    if (await carregar()) { gravar(CHAVE, senha); entrar(); }
  });
  document.querySelectorAll('.periodo button').forEach((b) => b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    document.querySelectorAll('.periodo button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    carregar();
  }));
  $('atualizar').addEventListener('click', carregar);
  $('sair').addEventListener('click', sair);
  document.querySelectorAll('.ver-tabela').forEach((b) => b.addEventListener('click', () => {
    const nome = b.dataset.alvo;
    const abrir = $('tabela-' + nome).hidden;
    $('tabela-' + nome).hidden = !abrir;
    $('grafico-' + nome).hidden = abrir;
    b.setAttribute('aria-expanded', String(abrir));
    b.textContent = abrir ? 'Ver como gráfico' : 'Ver como tabela';
  }));
  let espera;
  window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => dados && !$('painel').hidden && desenhar(), 150); });

  senha = ler(CHAVE);
  if (senha) carregar().then((ok) => { if (ok) entrar(); });
  else $('senha').focus();
})();
`;
