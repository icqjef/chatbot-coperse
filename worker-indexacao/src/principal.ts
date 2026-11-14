import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { carregarSites } from '@chatbot/comum';
import {
  carregarRegras, ehListaDeCandidatos, inferirAno, inferirProcesso, nomeDoArquivo, pareceListaDeNomes, type RegrasClassificacao,
} from '@chatbot/comum/classificar';
import { criarEmbedder, ErroAutenticacaoProvedor } from '@chatbot/comum/provedores/embeddings';
import type { Site, TipoDocumento } from '@chatbot/comum/tipos';
import { criarClienteCloudflare } from './cloudflare.js';
import { lerFeed } from './feed.js';
import { criarBuscar, criarCabecalho, ErroForaDoDominio, ErroHttp, type Resposta } from './http.js';
import { ehGenerico, extrairPagina } from './extrair.js';
import { extrairPdf } from './pdf.js';
import {
  indexarDocumento, registrarErro, removerPagina, type DepsIndexacao, type ResultadoIndexacao,
} from './indexar.js';
import {
  adiar, carregarEstado, concluir, deveIgnorar, ehPdf, enfileirar, normalizarUrl, proximos, urlExcluida,
  type EstadoRastreio, type ItemFila, type NovoItem,
} from './fila.js';

export interface Contagem {
  nova: number; alterada: number; igual: number; vazia: number; erro: number; teto: number; ignorada: number; removida: number;
}

export interface OpcoesExecucao {
  /** itens da fila processados nesta execução */
  maxItens: number;
  /** tempo máximo do laço; o que sobrar fica na fila para a próxima execução */
  prazoMs: number;
  sites: Site[];
  regras: RegrasClassificacao;
  /** vetores máximos no índice; ao atingir, a execução para e o item fica na fila */
  tetoVetores: number;
  /** pausa entre requisições; injetável para os testes não dormirem */
  esperar?: (ms: number) => Promise<void>;
  relogio?: () => number;
}

export interface DepsExecucao extends DepsIndexacao {
  buscar: (url: string, dominiosPermitidos?: string[]) => Promise<Resposta>;
  extrairPdf: (b: Uint8Array) => Promise<{ texto: string; paginas: number }>;
  /** HEAD: Last-Modified sem baixar o corpo (listas em PDF) */
  cabecalho: (url: string) => Promise<{ ultimaModificacao?: string }>;
}

/** itens de feed: prioridade mais alta */
const PRIORIDADE_FEED = 10;
const PRIORIDADE_CHAVE = 5;
const LOTE = 50;
const PAUSA_MS = 1000;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hostPermitido(url: string, site: Site): boolean {
  try {
    return site.dominios_permitidos.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function codigoSaida(r: Contagem): 0 | 1 {
  const algo = r.nova + r.alterada + r.igual + r.vazia + r.teto + r.ignorada + r.removida;
  return r.erro > 0 && algo === 0 ? 1 : 0;
}

const valida = (d: string | null | undefined): d is string => !!d && !Number.isNaN(Date.parse(d));

function tituloDoArquivo(url: string): string {
  return nomeDoArquivo(url).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || url;
}

/** título de PDF: o do link/feed, salvo se for genérico ("Clique aqui"); senão o nome do arquivo */
const tituloPdf = (item: ItemFila) => (item.titulo && !ehGenerico(item.titulo) ? item.titulo : tituloDoArquivo(item.url));

/** Processo e ano: o próprio documento › herdado da fila › padrão. `herdavel` não inclui os padrões. */
function classificar(titulo: string, url: string, data: string, item: ItemFila, site: Site, regras: RegrasClassificacao, texto?: string) {
  // Só o caminho da URL: o host sisu3.furg.br casaria com \bsisu\b.
  const processoProprio = inferirProcesso([titulo, new URL(url).pathname], regras) ?? item.processo;
  const anoProprio = inferirAno(titulo, new URL(url).pathname, texto) ?? item.ano;
  return {
    processo: processoProprio ?? site.processo_padrao ?? 'geral',
    ano: anoProprio ?? new Date(data).getUTCFullYear(),
    herdavel: { processo: processoProprio, ano: anoProprio },
  };
}

interface Contexto {
  opcoes: OpcoesExecucao;
  deps: DepsExecucao;
  estado: EstadoRastreio;
  esperar: (ms: number) => Promise<void>;
  /** URLs presentes nos feeds lidos nesta execução: título e data do feed valem mais que os da página */
  doFeed: Set<string>;
}

type Desfecho = ResultadoIndexacao | 'ignorada' | 'removida';

async function processarItem(item: ItemFila, site: Site, ctx: Contexto): Promise<{ r: Desfecho; tipo: TipoDocumento }> {
  const saida = { tipo: (ehPdf(item.url) ? 'pdf' : 'html') as TipoDocumento };
  const r = await processar(item, site, ctx, saida);
  return { r, tipo: saida.tipo };
}

async function processar(item: ItemFila, site: Site, ctx: Contexto, saida: { tipo: TipoDocumento }): Promise<Desfecho> {
  const { opcoes, deps, estado } = ctx;
  const { regras } = opcoes;
  const agora = deps.agora();
  const pdfPelaUrl = ehPdf(item.url);
  // A marca em memória cobre o item que já estava no lote de proximos quando a lista o marcou no D1.
  const filhoDeLista = item.lista || estado.listas.has(item.url);
  let titulo = pdfPelaUrl ? tituloPdf(item) : (item.titulo ?? '');
  let tipo: TipoDocumento = saida.tipo;
  let data = valida(item.data) ? item.data : agora;

  try {
    // Lista nominal em PDF: nunca baixa; indexa só título, data e link. A data vem do feed ou de um HEAD
    // (Last-Modified); sem nenhum dos dois é desconhecida: a herdada da página que linkou só serve para ordenar.
    // PDF linkado por uma página lista também é lista, mesmo com título e nome neutros.
    if (pdfPelaUrl && (filhoDeLista || ehListaDeCandidatos(titulo, item.url, regras))) {
      const conhecida = (ctx.doFeed.has(item.url) && valida(item.data) ? item.data : undefined) ?? (await ultimaModificacao(item.url, ctx));
      if (conhecida) data = conhecida;
      const c = classificar(titulo, item.url, data, item, site, regras);
      saida.tipo = 'lista';
      return await indexarDocumento(
        { site, url: item.url, titulo, data, dataDesconhecida: !conhecida, tipo: 'lista', processo: c.processo, ano: c.ano, texto: '' }, deps,
      );
    }

    await ctx.esperar(PAUSA_MS);
    const resp = await deps.buscar(item.url, site.dominios_permitidos);

    if (resp.tipo === 'outro') return 'ignorada';

    if (resp.tipo === 'pdf') {
      tipo = 'pdf';
      titulo = tituloPdf(item);
      const conhecida = (ctx.doFeed.has(item.url) && valida(item.data) ? item.data : undefined) ?? resp.ultimaModificacao;
      data = conhecida ?? (valida(item.data) ? item.data : agora);
      // URL sem cara de PDF que devolveu PDF: a regra de lista ainda vale (não lê o conteúdo).
      let lista = filhoDeLista || ehListaDeCandidatos(titulo, item.url, regras);
      let texto = lista ? '' : (await deps.extrairPdf(resp.bytes ?? new Uint8Array(0))).texto;
      // Privacidade: lista de nomes com título neutro é pega pelo cabeçalho/linhas do conteúdo; o texto é descartado.
      if (!lista && pareceListaDeNomes(texto)) {
        lista = true;
        texto = '';
        console.error(`PDF tratado como lista pelo conteúdo: ${item.url}`);
      }
      saida.tipo = lista ? 'lista' : 'pdf';
      const c = classificar(titulo, item.url, data, item, site, regras, texto);
      return await indexarDocumento(
        { site, url: item.url, titulo, data, dataDesconhecida: !conhecida, tipo: lista ? 'lista' : 'pdf', processo: c.processo, ano: c.ano, texto }, deps,
      );
    }

    const pagina = extrairPagina(resp.texto ?? '', item.url);
    const doFeed = ctx.doFeed.has(item.url);
    titulo = (doFeed && item.titulo) || pagina.titulo || item.titulo || '';
    const conhecida = (doFeed && valida(item.data) ? item.data : undefined) ?? pagina.data ?? resp.ultimaModificacao;
    data = conhecida ?? agora;
    const c = classificar(titulo, item.url, data, item, site, regras, pagina.texto);
    const lista = ehListaDeCandidatos(titulo, item.url, regras);
    tipo = lista ? 'lista' : 'html';
    saida.tipo = tipo;
    const r = await indexarDocumento(
      { site, url: item.url, titulo, data, dataDesconhecida: !conhecida, tipo, processo: c.processo, ano: c.ano, texto: pagina.texto }, deps,
    );
    if (r === 'teto') return r;

    // Links seguidos mesmo se a página não mudou ('igual') ou é lista.
    if (item.profundidade < site.profundidade) {
      const novos: NovoItem[] = [];
      for (const l of pagina.links) {
        const url = normalizarUrl(l.url);
        if (!url || deveIgnorar(url) || urlExcluida(url, site) || !hostPermitido(url, site) || url === item.url) continue;
        novos.push({
          url, site: site.id, profundidade: item.profundidade + 1, origem: item.url, prioridade: ehPdf(url) ? 2 : 1,
          // Privacidade: o texto de um link numa lista costuma ser o nome de uma pessoa; o filho usa o próprio título.
          titulo: lista ? null : l.titulo || null, processo: c.herdavel.processo, ano: c.herdavel.ano, data,
          // Só vale para PDF (inclusive o servido sem cara de PDF); HTML filho de lista costuma ser navegação.
          lista,
        });
      }
      await enfileirar(deps.cf, estado, novos, { agora });
    }
    return r;
  } catch (e) {
    if (e instanceof ErroAutenticacaoProvedor) throw e; // nada de registrarErro/adiar: a fila fica intacta
    if (e instanceof ErroForaDoDominio) {
      // Permanente: não repete na fila e nada é indexado.
      console.error(e.message);
      // Já indexada e agora desviada para fora do domínio: o conteúdo antigo sai do índice.
      if (estado.paginas.get(item.url)?.status === 'ok') {
        try {
          await removerPagina(item.url, deps);
          return 'removida';
        } catch {
          // fica como está; a próxima execução tenta de novo
        }
      }
      return 'ignorada';
    }
    const msg = e instanceof Error ? e.message : String(e);
    let falhas = 0;
    try {
      const c = classificar(titulo, item.url, data, item, site, regras);
      falhas = await registrarErro({ site, url: item.url, titulo, data, tipo, processo: c.processo, ano: c.ano }, msg, deps);
    } catch {
      // sem como registrar o erro; segue
    }
    // Só 404/410 de verdade, três vezes seguidas, apagam a página do índice.
    if (e instanceof ErroHttp && (e.status === 404 || e.status === 410) && falhas >= 3) {
      await removerPagina(item.url, deps);
      return 'removida';
    }
    return 'erro';
  }
}

/** HEAD com a mesma pausa de cortesia; falha ou ausência do cabeçalho = data desconhecida. */
async function ultimaModificacao(url: string, ctx: Contexto): Promise<string | undefined> {
  try {
    await ctx.esperar(PAUSA_MS);
    return (await ctx.deps.cabecalho(url)).ultimaModificacao;
  } catch {
    return undefined;
  }
}

/** Tira do índice e da fila o que as regras `excluir` hoje barram (edições antigas já indexadas ou enfileiradas). */
async function limparExcluidas(sites: Site[], ctx: Contexto, total: Contagem): Promise<void> {
  const { deps, estado } = ctx;
  const barrada = (url: string) => sites.some((s) => hostPermitido(url, s) && urlExcluida(url, s));
  let n = 0;
  let falhas = 0;
  for (const [url, vista] of estado.paginas) {
    if (vista.status === 'removida' || !barrada(url)) continue;
    try {
      await removerPagina(url, deps);
    } catch {
      falhas++;
      continue; // fica para a próxima execução
    }
    estado.paginas.set(url, { ...vista, status: 'removida' });
    n++;
  }
  for (const url of [...estado.naFila]) {
    if (!barrada(url)) continue;
    await concluir(deps.cf, estado, url);
    n++;
  }
  total.removida += n;
  if (n > 0) console.error(`Edições antigas excluídas do índice e da fila: ${n}`);
  if (falhas > 0) console.error(`Falha ao remover ${falhas} página(s) excluída(s); tentará de novo na próxima execução.`);
}

/**
 * Linhas antigas com http://: tira do índice e enfileira a versão https (a menos que já esteja ok ou na fila).
 * Falha por URL não derruba a execução; só contagens vão ao log.
 */
async function migrarHttp(sites: Site[], ctx: Contexto, total: Contagem): Promise<void> {
  const { deps, estado } = ctx;
  const agora = deps.agora();
  let removidas = 0;
  let falhas = 0;
  const novos: NovoItem[] = [];
  for (const [url, vista] of [...estado.paginas]) {
    if (!url.startsWith('http://') || vista.status === 'removida') continue;
    const https = url.replace(/^http:/, 'https:');
    const site = sites.find((s) => hostPermitido(url, s));
    try {
      await removerPagina(url, deps);
    } catch {
      falhas++;
      continue; // fica para a próxima execução
    }
    estado.paginas.set(url, { ...vista, status: 'removida' });
    removidas++;
    if (!site || estado.paginas.get(https)?.status === 'ok' || estado.naFila.has(https)) continue;
    novos.push({
      url: https, site: site.id, profundidade: 0, origem: null, prioridade: PRIORIDADE_CHAVE,
      titulo: null, processo: null, ano: null, data: null,
    });
  }
  try {
    await enfileirar(deps.cf, estado, novos, { agora, forcar: true });
  } catch {
    falhas++;
  }
  total.removida += removidas;
  if (removidas > 0) console.error(`Páginas http:// removidas e reenfileiradas como https://: ${removidas}`);
  if (falhas > 0) console.error(`Falha ao migrar ${falhas} página(s) http://; tentará de novo na próxima execução.`);
}

async function semear(site: Site, ctx: Contexto, total: Contagem): Promise<void> {
  const { deps, estado } = ctx;
  const agora = deps.agora();
  const itens: NovoItem[] = [];
  if (site.feed) {
    try {
      await ctx.esperar(PAUSA_MS);
      const resp = await deps.buscar(site.feed, site.dominios_permitidos);
      if (resp.texto === undefined) throw new Error(`resposta do tipo ${resp.tipo}, não um feed`);
      for (const it of lerFeed(resp.texto)) {
        const url = normalizarUrl(it.url);
        if (!url || !hostPermitido(url, site)) {
          console.error(`fora do domínio: ${it.url}`);
          total.erro++;
          continue;
        }
        if (deveIgnorar(url) || urlExcluida(url, site)) continue;
        itens.push({
          url, site: site.id, profundidade: 0, origem: null, prioridade: PRIORIDADE_FEED,
          titulo: it.titulo || null, processo: null, ano: null, data: it.data || null,
        });
      }
    } catch (e) {
      console.error(`feed ${site.id}: ${(e as Error).message}`);
      total.erro++;
    }
  }
  for (const bruto of site.paginas_chave) {
    const url = normalizarUrl(bruto);
    if (!url || deveIgnorar(url) || urlExcluida(url, site) || !hostPermitido(url, site)) continue;
    itens.push({ url, site: site.id, profundidade: 0, origem: null, prioridade: PRIORIDADE_CHAVE, titulo: null, processo: null, ano: null, data: null });
  }
  // Já na fila (achado por link): o feed passa a valer para título e data.
  const novos: NovoItem[] = [];
  for (const it of itens) {
    if (it.prioridade === PRIORIDADE_FEED) ctx.doFeed.add(it.url);
    if (it.prioridade === PRIORIDADE_FEED && estado.naFila.has(it.url)) {
      // Feed sem título ou data não apaga os que já estavam na fila.
      await deps.cf.d1(
        "UPDATE fila SET titulo = COALESCE(NULLIF(?, ''), titulo), data = COALESCE(NULLIF(?, ''), data), prioridade = MAX(prioridade, ?) WHERE url = ?",
        [it.titulo, it.data, it.prioridade, it.url],
      );
    } else {
      novos.push(it);
    }
  }
  await enfileirar(deps.cf, estado, novos, { agora, forcar: true });
}

export async function executar(
  opcoes: OpcoesExecucao,
  depsBase: DepsExecucao,
): Promise<Contagem & { teto_atingido: boolean; fila_restante: number }> {
  const esperar = opcoes.esperar ?? dormir;
  const relogio = opcoes.relogio ?? Date.now;
  const inicio = relogio();
  const total: Contagem = { nova: 0, alterada: 0, igual: 0, vazia: 0, erro: 0, teto: 0, ignorada: 0, removida: 0 };

  const exec = await depsBase.cf.d1('INSERT INTO execucoes (inicio) VALUES (?) RETURNING id', [depsBase.agora()]);
  const id = exec[0]?.id;
  const estado = await carregarEstado(depsBase.cf);
  // Orçamento de vetores recontado a cada execução; o contador em memória vale só para esta.
  let restante = opcoes.tetoVetores - (await depsBase.cf.contarVetores());
  const deps: DepsExecucao = { ...depsBase, teto: { restante: () => restante, consumir: (n) => { restante -= n; } } };
  const ctx: Contexto = { opcoes, deps, estado, esperar, doFeed: new Set() };
  const sites = new Map(opcoes.sites.map((s) => [s.id, s]));

  let processados = 0;
  let tetoAtingido = false;
  try {
    await limparExcluidas(opcoes.sites, ctx, total);
    await migrarHttp(opcoes.sites, ctx, total);
    for (const site of opcoes.sites) await semear(site, ctx, total);

    laco: for (;;) {
      const lote = await proximos(deps.cf, LOTE, deps.agora());
      if (lote.length === 0) break;
      for (const item of lote) {
        if (processados >= opcoes.maxItens || relogio() - inicio >= opcoes.prazoMs) break laco;
        processados++;
        const site = sites.get(item.site);
        if (!site) {
          // site saiu da configuração
          await concluir(deps.cf, estado, item.url);
          total.ignorada++;
          continue;
        }
        const { r, tipo } = await processarItem(item, site, ctx);
        total[r]++;
        if (r === 'teto') {
          tetoAtingido = true;
          break laco; // o item fica na fila
        }
        if (r === 'erro') {
          await adiar(deps.cf, estado, item, deps.agora());
          // Marca o erro com as falhas atuais: se o item acabou de sair da fila (5ª tentativa), links de volta
          // não o enfileiram de novo nesta execução (erro permanente usa a janela de 30 dias).
          let falhas = item.tentativas + 1;
          try {
            falhas = Math.max(falhas, Number((await deps.cf.d1('SELECT falhas FROM paginas WHERE url = ?', [item.url]))[0]?.falhas ?? 0));
          } catch {
            // fica a contagem da fila
          }
          // espelha o banco: página que já estava ok continua ok (só a contagem de falhas sobe)
          const eraOk = estado.paginas.get(item.url)?.status === 'ok';
          estado.paginas.set(item.url, { dataVista: deps.agora(), status: eraOk ? 'ok' : 'erro', tipo, falhas });
        } else {
          await concluir(deps.cf, estado, item.url);
          // Marca como visto agora: links de volta para esta URL não a enfileiram de novo nesta execução.
          const status = r === 'vazia' || r === 'removida' || r === 'ignorada' ? r : 'ok';
          estado.paginas.set(item.url, { dataVista: deps.agora(), status, tipo });
        }
      }
    }
  } catch (e) {
    if (e instanceof ErroAutenticacaoProvedor) {
      try {
        await depsBase.cf.d1('UPDATE execucoes SET fim = ?, paginas = ?, erros = ? WHERE id = ?', [deps.agora(), processados, total.erro, id]);
      } catch {
        // o erro de autenticação original é o que importa
      }
    }
    throw e;
  }

  const filaRestante = Number((await deps.cf.d1('SELECT COUNT(*) AS n FROM fila'))[0]?.n ?? 0);
  await deps.cf.d1('UPDATE execucoes SET fim = ?, paginas = ?, erros = ? WHERE id = ?', [deps.agora(), processados, total.erro, id]);
  return { ...total, teto_atingido: tetoAtingido, fila_restante: filaRestante };
}

function inteiro(nome: string, padrao: string): number {
  const v = Number(process.env[nome] || padrao);
  if (!Number.isInteger(v) || v < 1) {
    console.error(`${nome} deve ser um inteiro maior que zero.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const env = process.env;
  const obrigatorias = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'D1_DATABASE_ID', 'VECTORIZE_INDICE', 'GEMINI_API_KEY'];
  for (const nome of obrigatorias) {
    if (!env[nome]) {
      console.error(`Variável de ambiente obrigatória ausente: ${nome}`);
      process.exit(1);
    }
  }
  const limite = inteiro('LIMITE', '400');
  const prazoMinutos = inteiro('PRAZO_MINUTOS', '25');
  const tetoVetores = inteiro('TETO_VETORES', '6000');
  const config = (arquivo: string) => JSON.parse(readFileSync(new URL(`../../config/${arquivo}`, import.meta.url), 'utf8'));
  const sites = carregarSites(config('sites.json'));
  const regras = carregarRegras(config('processos.json'), config('listas.json'));
  const cf = criarClienteCloudflare({
    accountId: env.CLOUDFLARE_ACCOUNT_ID!, token: env.CLOUDFLARE_API_TOKEN!,
    databaseId: env.D1_DATABASE_ID!, indice: env.VECTORIZE_INDICE!,
  });
  const embedder = criarEmbedder({
    PROVEDOR_LLM: env.PROVEDOR_LLM || 'gemini', GEMINI_API_KEY: env.GEMINI_API_KEY!,
    MODELO_EMBEDDING: env.MODELO_EMBEDDING || undefined, DIMENSAO_EMBEDDING: env.DIMENSAO_EMBEDDING || undefined,
  } as Parameters<typeof criarEmbedder>[0]);
  const deps: DepsExecucao = {
    cf, embedder, buscar: criarBuscar(), cabecalho: criarCabecalho(), extrairPdf, agora: () => new Date().toISOString(),
  };

  const resumo = await executar({ maxItens: limite, prazoMs: prazoMinutos * 60_000, sites, regras, tetoVetores }, deps);
  const falhas = (await cf.d1("SELECT url, erro FROM paginas WHERE erro IS NOT NULL AND status IN ('erro', 'ok')")).map((r) => ({ url: r.url, erro: r.erro }));
  console.log(JSON.stringify({ ...resumo, limite, urls_com_erro: falhas }));
  if (resumo.teto_atingido) console.error(`Teto de ${tetoVetores} vetores atingido: a indexação parou. Ver docs/decisoes.md.`);
  process.exitCode = codigoSaida(resumo);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof ErroAutenticacaoProvedor ? 'Chave do Gemini recusada pelo provedor' : `Falha na indexação: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
