# Etapas 1 a 3 — Fundação, teste de colagem e indexador do feed — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repositório público com CI e publicação automática, Worker mínimo no ar servindo um `widget.js` de teste colável no Joomla, e um indexador que lê o feed do coperse e grava 5 notícias reais no D1 e no Vectorize.

**Architecture:** Monorepo TypeScript (npm workspaces). `worker-resposta` é um Worker Cloudflare (por ora só `/saude` e `/widget.js` de teste) que também é dono do esquema D1 (migrations). `worker-indexacao` é um programa Node executado pelo GitHub Actions que grava no D1 e no Vectorize pela API REST do Cloudflare. Código compartilhado em `comum/`.

**Tech Stack:** Node 22 (CI) / 24 (local), TypeScript 5, Vitest, Wrangler 4, `fast-xml-parser`, `cheerio`, `tsx`. Gemini `gemini-embedding-001` (768 dims) via REST.

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md`

As etapas 4 a 8 do spec terão planos próprios, escritos depois do aceite desta.

## Global Constraints

- Português do Brasil em textos, mensagens de commit, nomes de arquivos de docs e, quando natural, nomes de código do domínio (`paginas`, `trechos`, `fila`).
- Endereços de sites só em `config/sites.json`; nunca fixos no código.
- Segredos nunca no código nem no chat: Cloudflare (`wrangler secret`) e GitHub Actions (`gh secret set`, digitado pelo Jeferson). Logs do Actions não imprimem segredos.
- Cloudflare plano gratuito; repositório público `icqjef/chatbot-coperse`; ramo `main` protegido, alterações por pull request com testes passando.
- Embeddings: `MODELO_EMBEDDING` (padrão `gemini-embedding-001`), `DIMENSAO_EMBEDDING=768`; vetores normalizados (norma 1) antes de gravar.
- Vectorize: índice `chatbot-coperse`, métrica cosseno, 768 dims; índices de metadado `site`, `processo` (string) e `ano` (number) criados antes da primeira inserção. Texto do trecho não vai no Vectorize (só no D1).
- ID de trecho: `sha1(url)` em hex + `-` + ordem (≤ 64 bytes).
- Cada etapa termina com aceite do Jeferson; não iniciar a etapa seguinte sem ele.
- Registrar em `docs/decisoes.md` (data, decisão, motivo) toda decisão de projeto.

## Review Focus

1. **Feed com HTML/CDATA, entidades (`&amp;`) e acentos** → URL decodificada corretamente e título sem entidades. Teste em Task 7 com o feed real salvo como fixture.
2. **Notícia reindexada sem mudança** → nenhuma escrita no D1/Vectorize (hash igual). Teste em Task 10.
3. **Notícia alterada** → trechos antigos apagados do D1 **e** do Vectorize antes de gravar os novos; nenhum trecho órfão quando o novo texto tem menos trechos. Teste em Task 10.
4. **Página que falha (timeout, 500, HTML sem corpo)** → registrada com `status='erro'` e o indexador segue para a próxima, sem abortar a execução. Teste em Task 10.
5. **Origem não autorizada chamando o Worker** → sem `Access-Control-Allow-Origin`; nunca `*`. Teste em Task 3.

---

## ETAPA 1 — Fundação

### Task 1: Monorepo, configuração de sites e documentos iniciais

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.gitattributes` (`* text=auto eol=lf`), `.nvmrc` (`22`)
- Create: `CLAUDE.md` (cópia de `C:\Users\icqje\Meu Drive\01_Trabalho_e_FURG\Coperse\chatbot-sites\CLAUDE.md`, acrescida de uma seção "Mudanças aprovadas" apontando para `docs/decisoes.md`)
- Create: `README.md` (o que é, estrutura de pastas, como rodar testes; link para spec e decisões)
- Create: `docs/decisoes.md` — entradas datadas 2026-11-12: base rootsongjc/rag-chatbot (Apache-2.0) e o que se aproveita; AI Search descartado (motivo); indexação no GitHub Actions (limite de 10 ms do plano gratuito); repositório público (motivo); Cloudflare gratuito com limites conferidos; Gemini pelos créditos da assinatura AI Pro; escopo de conteúdo; registro de perguntas desligado.
- Create: `config/sites.json`, `config/origens.json`
- Create: `comum/package.json` (`@chatbot/comum`), `comum/tsconfig.json`, `comum/src/tipos.ts`, `comum/src/config.ts`
- Test: `comum/test/config.test.ts`

**Interfaces:**
- Produces (`comum/src/tipos.ts`):
  ```ts
  export interface Site { id: string; nome: string; base: string; feed?: string;
    paginas_chave: string[]; profundidade: number; dominios_permitidos: string[] }
  export interface ItemFeed { titulo: string; url: string; data: string /* ISO 8601 */; guid: string }
  export interface PaginaExtraida { titulo: string; texto: string }
  export type TipoEmbedding = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  export interface Embedder { embed(textos: string[], tipo: TipoEmbedding): Promise<number[][]> }
  export interface MetadadosTrecho { site: string; url: string; titulo: string; data: string;
    processo: string; ano: number; trecho_id: string }
  export interface VetorTrecho { id: string; values: number[]; metadata: MetadadosTrecho }
  ```
- Produces (`comum/src/config.ts`): `carregarSites(json: unknown): Site[]` (lança `Error` com mensagem em português se inválido); `carregarOrigens(json: unknown): string[]`.

Conteúdo de `config/sites.json`:
```json
[
  { "id": "coperse", "nome": "COPERSE", "base": "https://coperse.furg.br",
    "feed": "https://coperse.furg.br/index.php?format=feed&type=rss",
    "paginas_chave": [], "profundidade": 2, "dominios_permitidos": ["coperse.furg.br"] },
  { "id": "sisu", "nome": "SiSU FURG", "base": "https://sisu3.furg.br",
    "feed": "https://sisu3.furg.br/index.php?format=feed&type=rss",
    "paginas_chave": [], "profundidade": 2, "dominios_permitidos": ["sisu3.furg.br", "sisu.furg.br"] },
  { "id": "vestibular", "nome": "Vestibular FURG", "base": "https://vestibular.furg.br",
    "paginas_chave": ["https://vestibular.furg.br/"], "profundidade": 2,
    "dominios_permitidos": ["vestibular.furg.br"] }
]
```
`config/origens.json`: `["https://coperse.furg.br","https://www.coperse.furg.br","https://sisu3.furg.br","https://sisu.furg.br","https://vestibular.furg.br","https://www.vestibular.furg.br"]`

Root `package.json`: `"private": true`, `"workspaces": ["comum","worker-indexacao","worker-resposta"]`, scripts `test` (`vitest run` em todos os workspaces via `npm run test --workspaces --if-present`) e `typecheck` (`tsc -b`).

- [ ] **Step 1: Write the failing tests** em `comum/test/config.test.ts`:
  - `carregarSites` aceita o conteúdo real de `config/sites.json` e devolve 3 sites, o primeiro com `id === 'coperse'`.
  - lança erro contendo `"base"` quando um site não tem `base` ou ela não começa com `https://`.
  - lança erro contendo `"id"` quando há `id` repetido.
  - aplica `profundidade = 2` quando ausente.
  - `carregarOrigens` rejeita `"*"` e qualquer valor que não seja origem `https://` sem caminho.
- [ ] **Step 2:** `npm install` na raiz, depois `npm test -w comum` → FAIL (`carregarSites` não existe).
- [ ] **Step 3:** Implementar `comum/src/tipos.ts` e `comum/src/config.ts` (validação manual, sem biblioteca).
- [ ] **Step 4:** `npm test -w comum` → PASS; `npm run typecheck` → sem erros.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: estrutura do monorepo, config de sites e documentos iniciais"`

### Task 2: Recursos no Cloudflare (com o Jeferson)

Sem código de produto; prepara o que as tasks seguintes usam.

- [ ] **Step 1:** Pedir ao Jeferson que rode `! npx wrangler login` e confirme com `npx wrangler whoami` (anotar o Account ID em `docs/decisoes.md`; não é segredo).
- [ ] **Step 2:** Criar o banco: `npx wrangler d1 create chatbot-coperse` → anotar `database_id`.
- [ ] **Step 3:** Criar o índice e os índices de metadado:
  ```
  npx wrangler vectorize create chatbot-coperse --dimensions=768 --metric=cosine
  npx wrangler vectorize create-metadata-index chatbot-coperse --property-name=site --type=string
  npx wrangler vectorize create-metadata-index chatbot-coperse --property-name=processo --type=string
  npx wrangler vectorize create-metadata-index chatbot-coperse --property-name=ano --type=number
  ```
  Verificar: `npx wrangler vectorize list-metadata-index chatbot-coperse` lista os 3.
- [ ] **Step 4:** Pedir ao Jeferson que crie, no painel do Cloudflare, um **API Token** com permissões: Workers Scripts:Edit, D1:Edit, Vectorize:Edit (só a conta dele), e grave no GitHub depois da Task 4 (ver lá). Não colar no chat.
- [ ] **Step 5:** Registrar em `docs/decisoes.md` os nomes dos recursos; commit `docs: recursos Cloudflare criados`.

### Task 3: worker-resposta mínimo (/saude, /widget.js de teste, CORS)

**Files:**
- Create: `worker-resposta/package.json`, `worker-resposta/tsconfig.json`, `worker-resposta/wrangler.toml`
- Create: `worker-resposta/src/index.ts`, `worker-resposta/src/cors.ts`, `worker-resposta/src/widget-teste.ts`
- Create: `worker-resposta/migrations/.gitkeep` (o esquema vem na Task 6)
- Test: `worker-resposta/test/cors.test.ts`, `worker-resposta/test/rotas.test.ts`

**Interfaces:**
- Consumes: `carregarOrigens` (Task 1).
- Produces: `cabecalhosCors(origem: string | null, permitidas: string[]): Record<string,string>` — devolve `{}` se a origem não estiver na lista; senão `Access-Control-Allow-Origin: <origem exata>`, `Vary: Origin`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
- Produces: `export default { fetch(req: Request, env: Env): Promise<Response> }` com `Env = { DB: D1Database; VECTORIZE: VectorizeIndex; AMBIENTE: string }`.

`wrangler.toml`: `name = "chatbot-coperse"`, `main = "src/index.ts"`, `compatibility_date` = data atual, `[[d1_databases]] binding="DB" database_name="chatbot-coperse" database_id=<Task 2> migrations_dir="migrations"`, `[[vectorize]] binding="VECTORIZE" index_name="chatbot-coperse"`, `[observability] enabled = true`. `config/origens.json` importado como JSON no build.

`/widget.js` de teste: JavaScript que, ao carregar, faz `console.info('[chatbot-coperse] script carregado')` e insere no canto inferior direito um pequeno selo "Chatbot COPERSE — teste" (com `role="status"`), dentro de Shadow DOM. `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: public, max-age=300`.

- [ ] **Step 1: Write the failing tests:**
  - `cors.test.ts`: origem `https://coperse.furg.br` → header igual à origem e `Vary: Origin`; origem `https://evil.example` → `{}`; origem `null` → `{}`; nunca devolve `*`.
  - `rotas.test.ts` (chamando `worker.fetch(new Request(url), envFalso)`): `GET /saude` → 200 JSON `{ ok: true }`; `GET /widget.js` → 200, content-type contém `javascript`, corpo contém `chatbot-coperse`; `OPTIONS /perguntar` com origem não permitida → 403 sem `Access-Control-Allow-Origin`; rota desconhecida → 404.
- [ ] **Step 2:** `npm test -w worker-resposta` → FAIL.
- [ ] **Step 3:** Implementar `cors.ts`, `widget-teste.ts` (string exportada), `index.ts`.
- [ ] **Step 4:** `npm test -w worker-resposta` → PASS; `npx wrangler deploy --dry-run` em `worker-resposta/` → sem erros.
- [ ] **Step 5: Commit** — `feat: worker-resposta mínimo com saúde, widget de teste e CORS restrito`

### Task 4: GitHub público, CI, publicação automática e proteção do ramo

**Files:**
- Create: `.github/workflows/testes.yml` — em `pull_request` e `push` para `main`: checkout, setup-node (`.nvmrc`), `npm ci`, `npm run typecheck`, `npm test`. Job chamado `testes`.
- Create: `.github/workflows/publicar.yml` — em `push` para `main` (após `testes` passar, via `needs` no mesmo workflow ou `workflow_run`): `npx wrangler d1 migrations apply chatbot-coperse --remote` e `npx wrangler deploy` em `worker-resposta/`, com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` de segredos/variáveis do GitHub.

- [ ] **Step 1:** `gh repo create icqjef/chatbot-coperse --public --source . --push --description "Chatbot de perguntas e respostas dos processos seletivos da FURG (COPERSE)"`.
- [ ] **Step 2:** Pedir ao Jeferson que rode `! gh secret set CLOUDFLARE_API_TOKEN -R icqjef/chatbot-coperse` (o comando pede o valor sem mostrá-lo). Gravar o Account ID como variável: `gh variable set CLOUDFLARE_ACCOUNT_ID -R icqjef/chatbot-coperse --body <id>`.
- [ ] **Step 3:** Criar os dois workflows num ramo `ci`, abrir pull request, verificar `gh pr checks` → `testes` verde. Fazer merge.
- [ ] **Step 4:** Verificar publicação: `gh run list -w publicar.yml -L 1` → success; `curl -s https://chatbot-coperse.<subdominio>.workers.dev/saude` → `{"ok":true}`. Anotar a URL do Worker em `docs/decisoes.md` (via PR).
- [ ] **Step 5:** Proteger `main`: `gh api -X PUT repos/icqjef/chatbot-coperse/branches/main/protection` com `required_status_checks.strict=true`, `contexts=["testes"]`, `enforce_admins=true`, `required_pull_request_reviews.required_approving_review_count=0`, `restrictions=null`. Verificar: `git push origin HEAD:main` de um commit qualquer é recusado.

**→ Aceite da Etapa 1 pelo Jeferson** (repositório, CI verde, `/saude` no ar).

---

## ETAPA 2 — Teste de colagem no Joomla

### Task 5: Guia e execução do teste de colagem no sisu3

**Files:**
- Create: `docs/teste-colagem.md` — passo a passo para o Jeferson: criar módulo "HTML Personalizado" no sisu3, trocar o editor do módulo para "Nenhum"/CodeMirror (Usuário → Editar perfil → Editor, ou Configuração global), colar `<script src="https://<worker>/widget.js" defer></script>`, publicar só numa página de teste (atribuição de menu), conferir o selo e o console; o que fazer se o `<script>` sumir ao salvar (verificar Sistema → Configuração global → Filtros de texto para o grupo Administrator; se bloqueado, precisa de Super User); como remover o módulo depois.

- [ ] **Step 1:** Escrever `docs/teste-colagem.md` (PR, merge).
- [ ] **Step 2:** Jeferson executa no sisu3 e relata: o código salvo ainda contém `<script>`? O selo aparece? Funciona no celular?
- [ ] **Step 3:** Registrar o resultado em `docs/decisoes.md` (risco R1 resolvido ou caminho alternativo). Se bloqueado, parar e decidir com o Jeferson antes da Etapa 3.

**→ Aceite da Etapa 2.** Em paralelo, Jeferson cria a chave do Gemini no AI Studio, ativa os créditos da assinatura AI Pro na conta de cobrança e roda `! gh secret set GEMINI_API_KEY -R icqjef/chatbot-coperse`.

---

## ETAPA 3 — Indexador com o feed do coperse

### Task 6: Esquema do banco

**Files:**
- Create: `worker-resposta/migrations/0001_inicial.sql`

Tabelas (colunas como no spec 5.3):
```sql
CREATE TABLE paginas (url TEXT PRIMARY KEY, site TEXT NOT NULL, titulo TEXT, tipo TEXT NOT NULL DEFAULT 'html',
  processo TEXT NOT NULL DEFAULT 'geral', ano INTEGER, data_publicacao TEXT, data_vista TEXT NOT NULL,
  hash TEXT, status TEXT NOT NULL, falhas INTEGER NOT NULL DEFAULT 0, erro TEXT);
CREATE TABLE trechos (id TEXT PRIMARY KEY, url TEXT NOT NULL REFERENCES paginas(url), ordem INTEGER NOT NULL, texto TEXT NOT NULL);
CREATE INDEX trechos_url ON trechos(url);
CREATE VIRTUAL TABLE trechos_fts USING fts5(texto, trecho_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE fila (url TEXT PRIMARY KEY, site TEXT NOT NULL, profundidade INTEGER NOT NULL DEFAULT 0, origem TEXT,
  prioridade INTEGER NOT NULL DEFAULT 0, tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa TEXT);
CREATE TABLE execucoes (id INTEGER PRIMARY KEY AUTOINCREMENT, inicio TEXT NOT NULL, fim TEXT, paginas INTEGER DEFAULT 0, erros INTEGER DEFAULT 0);
```

- [ ] **Step 1:** Aplicar localmente: `npx wrangler d1 migrations apply chatbot-coperse --local` (em `worker-resposta/`) → sucesso.
- [ ] **Step 2:** Verificar FTS sem acento: inserir `('Inscrições até 15 de dezembro', 't1')` em `trechos_fts` e `SELECT trecho_id FROM trechos_fts WHERE trechos_fts MATCH 'inscricoes'` com `wrangler d1 execute --local` → retorna `t1`.
- [ ] **Step 3: Commit** (PR) — `feat: esquema D1 com busca de texto sem acentos`. A publicação aplica a migration remota.

### Task 7: Leitor de feed

**Files:**
- Create: `worker-indexacao/package.json` (deps `fast-xml-parser`, `cheerio`; dev `tsx`), `worker-indexacao/tsconfig.json`, `worker-indexacao/src/feed.ts`
- Create: `worker-indexacao/test/fixtures/coperse-feed.xml` (baixar o feed real: `curl -sL "https://coperse.furg.br/index.php?format=feed&type=rss"`)
- Test: `worker-indexacao/test/feed.test.ts`

**Interfaces:**
- Produces: `lerFeed(xml: string): ItemFeed[]` — itens na ordem do feed; `url` com entidades decodificadas; `data` em ISO 8601 (de `pubDate`); `guid` = `<guid>` ou `url`.

- [ ] **Step 1: Write the failing test:** com a fixture, `lerFeed` devolve ≥ 5 itens; o primeiro tem `url` começando com `https://coperse.furg.br/` e **sem** `&amp;`; `titulo` sem entidades HTML; `new Date(data).toString() !== 'Invalid Date'`; feed vazio/sem `<item>` → `[]`; XML inválido → lança erro com "feed".
- [ ] **Step 2:** `npm test -w worker-indexacao` → FAIL.
- [ ] **Step 3:** Implementar com `fast-xml-parser` (`processEntities: true`, item único normalizado para array).
- [ ] **Step 4:** → PASS. **Step 5:** Commit `feat: leitor de feed RSS`.

### Task 8: Extração do texto de artigo Joomla

**Files:**
- Create: `worker-indexacao/src/extrair.ts`
- Create: `worker-indexacao/test/fixtures/coperse-artigo.html` (baixar o 1º item da fixture do feed)
- Test: `worker-indexacao/test/extrair.test.ts`

**Interfaces:**
- Produces: `extrairPagina(html: string): PaginaExtraida` — corpo de `[itemprop="articleBody"]`, senão `.item-page`, senão `main`, senão `body`; remove `script, style, nav, header, footer, form, noscript`; título de `h1`/`h2` dentro de `.item-page`, senão `<title>`; texto com quebras de parágrafo preservadas (`\n\n` entre blocos), linhas de tabela como células separadas por ` | `, espaços colapsados.

- [ ] **Step 1: Write the failing test:** com a fixture real: `texto.length > 200`; `texto` não contém trechos do menu do site (escolher uma palavra do menu visível na fixture, ex.: o texto de um item de navegação) nem `<`; `titulo` igual (sem espaços extras) ao título do item no feed. HTML mínimo `<table><tr><td>Curso</td><td>Vagas</td></tr></table>` dentro de `articleBody` → texto contém `Curso | Vagas`. HTML sem corpo útil → `texto === ''`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar com `cheerio`. **Step 4:** PASS. **Step 5:** Commit `feat: extração de texto de artigos Joomla`.

### Task 9: Divisão em trechos e embedder Gemini

**Files:**
- Create: `comum/src/trechos.ts`, `comum/src/provedores/embeddings.ts`
- Test: `comum/test/trechos.test.ts`, `comum/test/embeddings.test.ts`

**Interfaces:**
- Produces: `dividirEmTrechos(texto: string, opcoes?: { maxCaracteres?: number; sobreposicao?: number }): string[]` — padrão `maxCaracteres = 3200` (~800 tokens), `sobreposicao = 400`; corta preferencialmente em `\n\n`, depois em fim de frase, nunca no meio de palavra; texto vazio → `[]`.
- Produces: `prefixarTrecho(t: string, m: { titulo: string; data: string; processo: string; ano: number | null }): string` → `"<titulo> (<data dd/mm/aaaa>)\n\n<t>"` (processo/ano entram quando ≠ `geral`).
- Produces: `criarEmbedder(env: { PROVEDOR_LLM: string; GEMINI_API_KEY: string; MODELO_EMBEDDING?: string; DIMENSAO_EMBEDDING?: string }, fetchFn = fetch): Embedder` — Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/<modelo>:batchEmbedContents`, chave no header `x-goog-api-key` (nunca na URL, para não vazar em logs), lotes de até 100 textos, `taskType` e `outputDimensionality` por requisição; normaliza cada vetor para norma 1; erro HTTP → `Error` com status, sem a chave na mensagem. `PROVEDOR_LLM` desconhecido → erro. Antes de implementar, conferir na doc oficial (ai.google.dev/api/embeddings) nome do modelo e formato do corpo; registrar em `docs/decisoes.md`.

- [ ] **Step 1: Write the failing tests:**
  - trechos: texto de 10.000 caracteres → todos os trechos ≤ 3200; trechos consecutivos compartilham ≥ 1 palavra (sobreposição); concatenação cobre todas as palavras do original; texto de 100 caracteres → 1 trecho; nenhum trecho começa/termina no meio de palavra.
  - embeddings (com `fetchFn` falso): 150 textos → 2 chamadas (100 + 50); corpo contém `taskType: 'RETRIEVAL_DOCUMENT'` e `outputDimensionality: 768`; header `x-goog-api-key` presente e URL sem `key=`; vetor `[3,4]` devolvido pela API → `[0.6, 0.8]`; resposta 429 → erro contendo `429` e não contendo a chave.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS. **Step 5:** Commit `feat: divisão em trechos e embeddings Gemini`.

### Task 10: Cliente Cloudflare e indexação de uma página

**Files:**
- Create: `worker-indexacao/src/cloudflare.ts`, `worker-indexacao/src/indexar.ts`
- Test: `worker-indexacao/test/cloudflare.test.ts`, `worker-indexacao/test/indexar.test.ts`

**Interfaces:**
- Produces (`cloudflare.ts`):
  ```ts
  export interface ClienteCloudflare {
    d1(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
    upsertVetores(v: VetorTrecho[]): Promise<void>
    apagarVetores(ids: string[]): Promise<void>
  }
  export function criarClienteCloudflare(cfg: { accountId: string; token: string; databaseId: string; indice: string }, fetchFn = fetch): ClienteCloudflare
  ```
  D1: `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query` `{sql, params}` → `result[0].results`. Vectorize: `POST .../vectorize/v2/indexes/{indice}/upsert` corpo NDJSON (`Content-Type: application/x-ndjson`), lotes de até 500; `POST .../vectorize/v2/indexes/{indice}/delete_by_ids` `{ids}`. `success: false` → erro com a mensagem da API. Conferir rotas na doc oficial antes de implementar.
- Produces (`indexar.ts`):
  ```ts
  export type ResultadoIndexacao = 'nova' | 'alterada' | 'igual' | 'vazia' | 'erro'
  export interface DepsIndexacao { cf: ClienteCloudflare; embedder: Embedder; buscarHtml(url: string): Promise<string>; agora(): string }
  export function idTrecho(url: string, ordem: number): string   // sha1(url) hex + '-' + ordem
  export function indexarPagina(e: { site: Site; url: string; titulo: string; data: string }, deps: DepsIndexacao): Promise<ResultadoIndexacao>
  ```
  Fluxo: busca HTML → `extrairPagina` → texto vazio ⇒ grava `paginas.status='vazia'`, `'vazia'` → hash sha256 do texto; igual ao gravado ⇒ só atualiza `data_vista`, `'igual'` → senão: ids antigos (`SELECT id FROM trechos WHERE url=?`) → `apagarVetores` + `DELETE` em `trechos` e `trechos_fts` → `dividirEmTrechos` + `prefixarTrecho` → `embed(..., 'RETRIEVAL_DOCUMENT')` → `upsertVetores` (metadata: `processo='geral'`, `ano` = ano de `data`) → `INSERT` trechos e trechos_fts → upsert em `paginas` (`status='ok'`, `falhas=0`). Exceção em qualquer passo ⇒ upsert `paginas` com `status='erro'`, `falhas = falhas + 1`, `erro` = mensagem (sem segredos), retorna `'erro'` (não relança). Título: o do feed prevalece; se vazio, o extraído.

- [ ] **Step 1: Write the failing tests:**
  - `cloudflare.test.ts` (fetch falso): `d1` envia `Authorization: Bearer <token>` e devolve `results`; `upsertVetores` com 2 vetores envia 2 linhas NDJSON; `success:false` → erro com a mensagem da API.
  - `indexar.test.ts` com `cf` falso em memória (registra SQL/upserts/deletes) e embedder falso (vetor fixo de 768):
    - página nova com fixture `coperse-artigo.html` → `'nova'`; nº de vetores = nº de linhas em `trechos`; cada vetor tem `metadata.url`, `site='coperse'`, `data`, `ano` numérico; ids no formato `/^[0-9a-f]{40}-\d+$/`.
    - mesma página de novo → `'igual'`; nenhum `upsertVetores`/`apagarVetores`/`DELETE` chamado.
    - página alterada para texto menor (menos trechos) → `'alterada'`; `apagarVetores` recebeu **todos** os ids antigos; ao final, `trechos` só tem os ids novos.
    - `buscarHtml` lança `Error('timeout')` → `'erro'`; `paginas` com `status='erro'`, `falhas=1`; nenhuma exceção sai da função.
    - HTML sem corpo → `'vazia'`; embedder não chamado.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS. **Step 5:** Commit `feat: cliente Cloudflare e indexação de página com troca de trechos`.

### Task 11: Programa principal, workflow agendado e prova com 5 notícias reais

**Files:**
- Create: `worker-indexacao/src/principal.ts` (executável via `tsx`)
- Create: `.github/workflows/indexar.yml`
- Modify: `README.md` (como rodar a indexação manualmente)
- Test: `worker-indexacao/test/principal.test.ts`

**Interfaces:**
- Consumes: `carregarSites`, `lerFeed`, `indexarPagina`, `criarEmbedder`, `criarClienteCloudflare`.
- Produces: `executar(opcoes: { limite: number; sites: Site[] }, deps: DepsIndexacao): Promise<{ nova: number; alterada: number; igual: number; vazia: number; erro: number }>` — para cada site com `feed`, lê o feed e indexa os `limite` primeiros itens; registra início/fim em `execucoes`; espera 1 s entre requisições ao mesmo site. `buscarHtml` real usa `User-Agent: ChatbotCOPERSE-Indexador/0.1` e timeout de 20 s.
- `principal.ts` lê de variáveis de ambiente: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`, `VECTORIZE_INDICE`, `GEMINI_API_KEY`, `PROVEDOR_LLM` (padrão `gemini`), `MODELO_EMBEDDING`, `DIMENSAO_EMBEDDING`, `LIMITE` (padrão 20); falta de variável obrigatória → sai com código 1 e mensagem com o **nome** da variável. Imprime só o resumo (contagens e URLs com erro), nunca segredos nem texto das páginas.

`indexar.yml`: `schedule: cron '0 */2 * * *'` + `workflow_dispatch` com input `limite` (padrão `20`); `concurrency: indexacao` (sem execuções simultâneas); `timeout-minutes: 30`; roda `npx tsx worker-indexacao/src/principal.ts` com segredos/variáveis do repositório.

- [ ] **Step 1: Write the failing test:** `executar` com feed falso de 8 itens e `limite: 5` → `indexarPagina` chamada 5 vezes; resultado soma 5; um item com erro não interrompe os demais; site sem `feed` é ignorado nesta etapa; `execucoes` recebe um INSERT de início e um UPDATE de fim.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar `executar`, `principal.ts`, workflow. **Step 4:** PASS; commit e PR `feat: indexação agendada do feed`; merge.
- [ ] **Step 5:** Gravar variáveis do repositório: `gh variable set D1_DATABASE_ID ...`, `gh variable set VECTORIZE_INDICE --body chatbot-coperse`. Confirmar com o Jeferson que `GEMINI_API_KEY` já foi gravada (`gh secret list` mostra o nome).
- [ ] **Step 6: Prova real:** `gh workflow run indexar.yml -f limite=5`; `gh run watch` → success, resumo `nova: 5` (ou `vazia`/`erro` explicados).
- [ ] **Step 7: Verificar dados:**
  - `npx wrangler d1 execute chatbot-coperse --remote --command "SELECT url, titulo, data_publicacao, status FROM paginas"` → 5 linhas `ok`, títulos e datas iguais aos do feed.
  - `... --command "SELECT COUNT(*) FROM trechos"` = `npx wrangler vectorize info chatbot-coperse` (contagem de vetores; pode levar alguns segundos para refletir).
  - `... --command "SELECT trecho_id FROM trechos_fts WHERE trechos_fts MATCH 'inscricao'"` → retorna algo se alguma notícia fala de inscrição.
  - Rodar de novo `gh workflow run indexar.yml -f limite=5` → resumo `igual: 5`.
- [ ] **Step 8:** Registrar em `docs/decisoes.md` o resultado (data, 5 URLs indexadas, nº de trechos) via PR.

**→ Aceite da Etapa 3 pelo Jeferson.** Próximo plano: Etapa 4 (páginas-chave, links, PDFs, vestibular, processo/ano, keepalive do agendamento).
