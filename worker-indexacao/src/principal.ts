import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { carregarSites } from '@chatbot/comum';
import { criarEmbedder } from '@chatbot/comum/provedores/embeddings';
import type { Site } from '@chatbot/comum/tipos';
import { criarClienteCloudflare } from './cloudflare.js';
import { lerFeed } from './feed.js';
import { criarBuscarHtml } from './http.js';
import { indexarPagina, type DepsIndexacao } from './indexar.js';

export interface Contagem { nova: number; alterada: number; igual: number; vazia: number; erro: number }

export interface OpcoesExecucao {
  limite: number;
  sites: Site[];
  /** pausa entre requisições ao mesmo site; injetável para os testes não dormirem */
  esperar?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function executar(opcoes: OpcoesExecucao, deps: DepsIndexacao): Promise<Contagem> {
  const esperar = opcoes.esperar ?? dormir;
  const total: Contagem = { nova: 0, alterada: 0, igual: 0, vazia: 0, erro: 0 };
  const inicio = await deps.cf.d1('INSERT INTO execucoes (inicio) VALUES (?) RETURNING id', [deps.agora()]);
  const id = inicio[0]?.id;

  for (const site of opcoes.sites) {
    if (!site.feed) continue;
    let itens;
    try {
      itens = lerFeed(await deps.buscarHtml(site.feed)).slice(0, opcoes.limite);
    } catch {
      total.erro++;
      continue;
    }
    for (const item of itens) {
      await esperar(1000);
      total[await indexarPagina({ site, url: item.url, titulo: item.titulo, data: item.data }, deps)]++;
    }
  }

  const paginas = total.nova + total.alterada + total.igual + total.vazia + total.erro;
  await deps.cf.d1('UPDATE execucoes SET fim = ?, paginas = ?, erros = ? WHERE id = ?', [deps.agora(), paginas, total.erro, id]);
  return total;
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
  const limite = Number(env.LIMITE || '20');
  if (!Number.isInteger(limite) || limite < 1) {
    console.error('LIMITE deve ser um inteiro maior que zero.');
    process.exit(1);
  }
  const sites = carregarSites(JSON.parse(readFileSync(new URL('../../config/sites.json', import.meta.url), 'utf8')));
  const cf = criarClienteCloudflare({
    accountId: env.CLOUDFLARE_ACCOUNT_ID!, token: env.CLOUDFLARE_API_TOKEN!,
    databaseId: env.D1_DATABASE_ID!, indice: env.VECTORIZE_INDICE!,
  });
  const embedder = criarEmbedder({
    PROVEDOR_LLM: env.PROVEDOR_LLM || 'gemini', GEMINI_API_KEY: env.GEMINI_API_KEY!,
    MODELO_EMBEDDING: env.MODELO_EMBEDDING || undefined, DIMENSAO_EMBEDDING: env.DIMENSAO_EMBEDDING || undefined,
  } as Parameters<typeof criarEmbedder>[0]);
  const deps: DepsIndexacao = { cf, embedder, buscarHtml: criarBuscarHtml(), agora: () => new Date().toISOString() };

  const resumo = await executar({ limite, sites }, deps);
  const falhas = (await cf.d1("SELECT url, erro FROM paginas WHERE status = 'erro'")).map((r) => ({ url: r.url, erro: r.erro }));
  console.log(JSON.stringify({ ...resumo, limite, urls_com_erro: falhas }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`Falha na indexação: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
