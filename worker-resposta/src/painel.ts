/**
 * Painel das avaliações (👍/👎): GET /painel (página), GET /painel.js (script) e POST /painel/dados
 * (números). Os dados exigem a mesma senha da reindexação manual (REINDEX_TOKEN) e passam pelo
 * limite por minuto do visitante antes da senha, para frear tentativas de adivinhá-la.
 */
import type { Env } from './index';
import { iguaisEmTempoConstante } from './operacao';
import { aplicarLimite, json } from './perguntar';
import { diaSaoPaulo } from './limites';

const MIN_SENHA = 32;
const PERIODOS = new Set([7, 30, 90]);
const MAX_NEGATIVAS = 50;
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
    const [porDia, negativas] = await Promise.all([
      env.DB.prepare(
        'SELECT dia, SUM(util) AS ajudou, COUNT(*) - SUM(util) AS nao FROM avaliacoes WHERE dia >= ? GROUP BY dia ORDER BY dia',
      )
        .bind(inicio)
        .all<{ dia: string; ajudou: number; nao: number }>(),
      env.DB.prepare(`SELECT dia, resposta FROM avaliacoes WHERE util = 0 AND dia >= ? ORDER BY id DESC LIMIT ${MAX_NEGATIVAS}`)
        .bind(inicio)
        .all<{ dia: string; resposta: string }>(),
    ]);
    return json({ inicio, fim, dias, porDia: porDia.results, negativas: negativas.results }, 200, cab);
  } catch {
    console.error('Falha ao ler as avaliações');
    return json({ erro: 'Não foi possível ler as avaliações.' }, 503, cab);
  }
}

const PAINEL_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Avaliações do assistente</title>
<style>
:root {
  color-scheme: light;
  --fundo: #f4f5f7; --superficie: #fcfcfb; --borda: #e1e3e6;
  --texto: #0b0b0b; --texto-2: #52514e; --texto-3: #6b6a66;
  --grade: #e6e6e3; --serie-1: #2a78d6; --serie-2: #eb6834;
  --acento: #1f5fbf; --sobre-acento: #fff; --erro: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --fundo: #111110; --superficie: #1a1a19; --borda: #2e2e2c;
    --texto: #f0efec; --texto-2: #c3c2b7; --texto-3: #a3a29a;
    --grade: #2b2b29; --serie-1: #3987e5; --serie-2: #d95926;
    --acento: #6ea4ec; --sobre-acento: #0b0b0b; --erro: #f2a19c;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --fundo: #111110; --superficie: #1a1a19; --borda: #2e2e2c;
  --texto: #f0efec; --texto-2: #c3c2b7; --texto-3: #a3a29a;
  --grade: #2b2b29; --serie-1: #3987e5; --serie-2: #d95926;
  --acento: #6ea4ec; --sobre-acento: #0b0b0b; --erro: #f2a19c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 16px; margin: 0 0 12px; }
.sub { color: var(--texto-2); margin: 4px 0 20px; font-size: 14px; }
.cartao { background: var(--superficie); border: 1px solid var(--borda); border-radius: 12px; padding: 16px; }
[hidden] { display: none !important; }
button, input { font: inherit; }
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
#entrar { max-width: 420px; }
#entrar label { display: block; font-weight: 600; margin-bottom: 6px; }
#entrar .linha { display: flex; gap: 8px; }
#entrar input { flex: 1; min-width: 0; padding: 9px 11px; border: 1px solid var(--borda); border-radius: 8px; background: var(--fundo); color: var(--texto); }
.botao { padding: 9px 16px; border-radius: 8px; border: 0; background: var(--acento); color: var(--sobre-acento); font-weight: 600; cursor: pointer; }
.msg-erro { color: var(--erro); margin: 8px 0 0; font-size: 14px; }
.barra { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; margin-bottom: 16px; }
.periodo { display: inline-flex; border: 1px solid var(--borda); border-radius: 8px; overflow: hidden; background: var(--superficie); }
.periodo button { border: 0; background: transparent; color: var(--texto-2); padding: 7px 14px; cursor: pointer; }
.periodo button[aria-pressed="true"] { background: var(--acento); color: var(--sobre-acento); font-weight: 600; }
.sair { background: transparent; border: 1px solid var(--borda); color: var(--texto-2); border-radius: 8px; padding: 7px 12px; cursor: pointer; }
.atualizado { color: var(--texto-3); font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi .rotulo { color: var(--texto-2); font-size: 13px; }
.kpi .valor { font-size: 30px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi .nota { color: var(--texto-3); font-size: 12.5px; }
.grafico-cab { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
.legenda { display: flex; gap: 16px; font-size: 13px; color: var(--texto-2); }
.legenda span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; background: var(--c); }
.ver-tabela { background: transparent; border: 0; color: var(--acento); cursor: pointer; padding: 0; text-decoration: underline; font-size: 13px; }
#grafico { position: relative; margin-top: 12px; }
#grafico svg { display: block; width: 100%; height: 240px; overflow: visible; }
#grafico text { fill: var(--texto-3); font-size: 11px; }
.dica { position: absolute; pointer-events: none; background: var(--superficie); border: 1px solid var(--borda); border-radius: 8px; padding: 8px 10px; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,.15); white-space: nowrap; }
.dica b { display: block; margin-bottom: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--borda); }
th { color: var(--texto-2); font-weight: 600; }
.vazio { color: var(--texto-2); padding: 24px 0; text-align: center; }
.negativas { list-style: none; margin: 0; padding: 0; }
.negativas li { padding: 12px 0; border-top: 1px solid var(--borda); }
.negativas li:first-child { border-top: 0; }
.negativas .dia { color: var(--texto-3); font-size: 12.5px; }
.negativas p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.secao { margin-top: 16px; }
.ajuda { color: var(--texto-3); font-size: 13px; margin: -6px 0 8px; }
@media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kpi .valor { font-size: 24px; } }
</style>
</head>
<body>
<main>
  <h1>Avaliações do assistente</h1>
  <p class="sub">Respostas do assistente COPERSE marcadas pelos candidatos como "ajudou" (👍) ou "não ajudou" (👎). Nenhuma pergunta nem dado pessoal é guardado.</p>

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
      <div><span id="atualizado" class="atualizado"></span> <button type="button" id="atualizar" class="sair">Atualizar</button> <button type="button" id="sair" class="sair">Sair</button></div>
    </div>
    <p id="erro-painel" class="msg-erro" role="alert" hidden></p>

    <div class="kpis">
      <div class="cartao kpi"><div class="rotulo">Avaliações</div><div class="valor" id="k-total">–</div><div class="nota" id="k-total-nota"></div></div>
      <div class="cartao kpi"><div class="rotulo">Taxa de aprovação</div><div class="valor" id="k-taxa">–</div><div class="nota">votos 👍 sobre o total</div></div>
      <div class="cartao kpi"><div class="rotulo">👍 Ajudou</div><div class="valor" id="k-sim">–</div><div class="nota">votos</div></div>
      <div class="cartao kpi"><div class="rotulo">👎 Não ajudou</div><div class="valor" id="k-nao">–</div><div class="nota">votos</div></div>
    </div>

    <div class="cartao">
      <div class="grafico-cab">
        <h2>Avaliações por dia</h2>
        <div class="legenda"><span style="--c: var(--serie-1)">Ajudou</span><span style="--c: var(--serie-2)">Não ajudou</span></div>
      </div>
      <button type="button" class="ver-tabela" id="ver-tabela" aria-expanded="false">Ver como tabela</button>
      <div id="grafico"></div>
      <div id="tabela" hidden></div>
    </div>

    <div class="cartao secao">
      <h2>Respostas que não ajudaram</h2>
      <p class="ajuda">As mais recentes primeiro (até 50). Mostram onde falta página, o edital está desatualizado ou a resposta saiu confusa.</p>
      <ul class="negativas" id="negativas"></ul>
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
  const pct = (n) => (Math.round(n * 1000) / 10).toLocaleString('pt-BR') + '%';

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
    desenhar();
    $('atualizado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return true;
  }

  function serieCompleta() {
    const mapa = new Map(dados.porDia.map((d) => [d.dia, d]));
    const out = [];
    const t0 = Date.parse(dados.inicio + 'T12:00:00Z');
    const t1 = Date.parse(dados.fim + 'T12:00:00Z');
    for (let t = t0; t <= t1; t += 86400000) {
      const dia = new Date(t).toISOString().slice(0, 10);
      const d = mapa.get(dia);
      out.push({ dia, ajudou: d ? Number(d.ajudou) : 0, nao: d ? Number(d.nao) : 0 });
    }
    return out;
  }

  function desenhar() {
    const serie = serieCompleta();
    const sim = serie.reduce((s, d) => s + d.ajudou, 0);
    const nao = serie.reduce((s, d) => s + d.nao, 0);
    const total = sim + nao;
    $('k-total').textContent = total.toLocaleString('pt-BR');
    $('k-total-nota').textContent = brAno(dados.inicio) + ' a ' + brAno(dados.fim);
    $('k-taxa').textContent = total ? pct(sim / total) : '–';
    $('k-sim').textContent = sim.toLocaleString('pt-BR');
    $('k-nao').textContent = nao.toLocaleString('pt-BR');
    grafico(serie, total);
    tabela(serie);
    negativas();
  }

  function grafico(serie, total) {
    const caixa = $('grafico');
    caixa.replaceChildren();
    if (!total) { caixa.append(el('p', { class: 'vazio' }, 'Nenhuma avaliação no período.')); return; }
    const L = Math.max(320, caixa.clientWidth || 640), A = 240, mE = 34, mD = 8, mT = 10, mB = 26;
    const larg = L - mE - mD, alt = A - mT - mB;
    const maxV = Math.max(1, ...serie.map((d) => d.ajudou + d.nao));
    const passo = Math.max(1, Math.ceil(maxV / 4));
    const topo = passo * Math.ceil(maxV / passo);
    const y = (v) => mT + alt - (v / topo) * alt;
    const banda = larg / serie.length;
    const bw = Math.max(2, Math.min(28, banda * 0.62));
    const svg = el('svg:svg', { viewBox: '0 0 ' + L + ' ' + A, role: 'img', 'aria-label': 'Avaliações por dia: ' + total + ' no período. Use "Ver como tabela" para os números.' });
    for (let v = 0; v <= topo; v += passo) {
      svg.append(el('svg:line', { x1: mE, x2: L - mD, y1: y(v), y2: y(v), stroke: 'var(--grade)', 'stroke-width': v ? 1 : 1.5 }));
      svg.append(el('svg:text', { x: mE - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    const cada = Math.ceil(serie.length / Math.max(2, Math.floor(larg / 56)));
    const dica = el('div', { class: 'dica', hidden: '' });
    serie.forEach((d, i) => {
      const cx = mE + banda * i + banda / 2, x = cx - bw / 2;
      if (i % cada === 0 || i === serie.length - 1) svg.append(el('svg:text', { x: cx, y: A - 6, 'text-anchor': 'middle' }, br(d.dia)));
      const segs = [['ajudou', 'var(--serie-1)'], ['nao', 'var(--serie-2)']].filter(([k]) => d[k] > 0);
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
        dica.replaceChildren(el('b', {}, brAno(d.dia)), document.createTextNode('Ajudou: ' + d.ajudou), el('br'), document.createTextNode('Não ajudou: ' + d.nao));
        dica.hidden = false;
        const px = (cx / L) * caixa.clientWidth;
        dica.style.left = Math.min(Math.max(0, px - 60), caixa.clientWidth - 140) + 'px';
        dica.style.top = '0px';
      });
      alvo.addEventListener('mouseleave', () => { dica.hidden = true; });
      svg.append(alvo);
    });
    caixa.append(svg, dica);
  }

  function tabela(serie) {
    const t = el('table');
    const cab = el('tr');
    ['Dia', 'Ajudou', 'Não ajudou', 'Total'].forEach((h) => cab.append(el('th', { scope: 'col' }, h)));
    const thead = el('thead');
    thead.append(cab);
    t.append(thead);
    const corpo = el('tbody');
    serie.filter((d) => d.ajudou + d.nao > 0).reverse().forEach((d) => {
      const tr = el('tr');
      [brAno(d.dia), d.ajudou, d.nao, d.ajudou + d.nao].forEach((v) => tr.append(el('td', {}, String(v))));
      corpo.append(tr);
    });
    t.append(corpo);
    $('tabela').replaceChildren(corpo.children.length ? t : el('p', { class: 'vazio' }, 'Nenhuma avaliação no período.'));
  }

  function negativas() {
    const ul = $('negativas');
    ul.replaceChildren();
    if (!dados.negativas.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma resposta marcada como "não ajudou" no período.')); return; }
    for (const n of dados.negativas) {
      const li = el('li');
      li.append(el('div', { class: 'dia' }, brAno(n.dia)), el('p', {}, n.resposta));
      ul.append(li);
    }
  }

  function entrar() { $('entrar').hidden = true; $('painel').hidden = false; }
  function sair() { senha = ''; dados = null; gravar(CHAVE, ''); $('painel').hidden = true; $('entrar').hidden = false; $('senha').value = ''; $('senha').focus(); }

  $('entrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    erro('erro-entrar', '');
    senha = $('senha').value.trim();
    if (!senha) { erro('erro-entrar', 'Digite a senha.'); return; }
    if (await carregar()) { gravar(CHAVE, senha); entrar(); desenhar(); }
  });
  document.querySelectorAll('.periodo button').forEach((b) => b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    document.querySelectorAll('.periodo button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    carregar();
  }));
  $('atualizar').addEventListener('click', carregar);
  $('sair').addEventListener('click', sair);
  $('ver-tabela').addEventListener('click', () => {
    const aberta = $('tabela').hidden;
    $('tabela').hidden = !aberta;
    $('grafico').hidden = aberta;
    $('ver-tabela').setAttribute('aria-expanded', String(aberta));
    $('ver-tabela').textContent = aberta ? 'Ver como gráfico' : 'Ver como tabela';
  });
  let espera;
  window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => dados && desenhar(), 150); });

  senha = ler(CHAVE);
  if (senha) carregar().then((ok) => { if (ok) { entrar(); desenhar(); } });
  else $('senha').focus();
})();
`;
