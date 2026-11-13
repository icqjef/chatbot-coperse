# Etapa 5 — Worker de resposta e regras do bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /perguntar` responde a candidatos só com base nos trechos indexados, sempre com fontes montadas pelo código, recusando o que está fora do tema ou sem base; `/saude` informa o estado da indexação; `/reindexar` dispara o workflow com senha longa; há limite de perguntas por visitante.

**Architecture:** o Worker `chatbot-coperse` (Cloudflare gratuito, 10 ms de CPU) faz quase só espera de rede: embedding da pergunta no Gemini → Vectorize (top 20) + FTS5 no D1 (top 20) → fusão por posição com bônus de recência e de ano → limiar → prompt com trechos numerados → Gemini Flash → fontes extraídas dos números citados. Provedores de embedding e de geração ficam em `comum/` e são escolhidos por variável de ambiente.

**Tech Stack:** Cloudflare Workers (TypeScript), D1 (FTS5), Vectorize, binding de Rate Limiting, Gemini API (`gemini-3.5-flash-lite` padrão; `gemini-embedding-001`), vitest, GitHub REST API (workflow_dispatch).

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md` (seções 5.5, 5.7, 5.8, regras do bot no `CLAUDE.md`).

## Global Constraints

- Responder somente com base nos trechos recuperados e sempre citar a página de origem. Fontes montadas pelo código a partir de `[n]` citados, nunca de endereços escritos pelo modelo; número inexistente é removido.
- Sem base (nenhum trecho com similaridade ≥ `LIMIAR_SIMILARIDADE`): mensagem fixa **sem chamar o modelo de geração**: `Não encontrei essa informação nas páginas da COPERSE. Consulte o edital oficial do processo seletivo ou escreva para coperse@furg.br.`
- Não opinar sobre situação individual (homologação, recurso, nota): encaminhar ao sistema de inscrição ou à COPERSE. Recusar com educação perguntas fora do tema dos processos seletivos da FURG. Não pedir dados pessoais.
- Conflito entre páginas: prevalece a mais recente e o bot informa a data. Edições: responder com a edição mais recente do processo perguntado e dizer qual é; edição passada nunca apresentada como atual.
- Não coletar CPF nem nome: CPF, e-mail e telefone na pergunta e no histórico são trocados por `[removido]` antes de qualquer chamada externa. IP nunca é guardado; a chave do limite é `sha256(ip + data UTC do dia)`.
- Só aceita `Origin` de `config/origens.json`; CORS devolve a origem exata, nunca `*`, e todas as respostas (inclusive 4xx/5xx) levam `Vary: Origin`.
- Pergunta: 1 a 500 caracteres. Histórico: até 4 trocas (8 mensagens), cada mensagem até 2000 caracteres.
- Limite: 6 perguntas por minuto por visitante (binding `LIMITADOR`, `period = 60`).
- `/reindexar`: só `POST` com `Authorization: Bearer <REINDEX_TOKEN>`; comparação em tempo constante; `REINDEX_TOKEN` ausente ou com menos de 32 caracteres desliga a rota (503).
- Segredos só no Cloudflare (`GEMINI_API_KEY`, `REINDEX_TOKEN`, `GITHUB_TOKEN`), nunca no código nem em log. Mensagens de erro de provedores truncadas e com a chave trocada por `[chave]`.
- Modelos (conferidos em ai.google.dev em 2026-11-12): `MODELO_RESPOSTA` padrão `gemini-3.5-flash-lite` (US$ 0,30/1M tokens de entrada, US$ 2,50/1M de saída). A partir do 3.6 Flash, `temperature`/`top_p`/`top_k` estão obsoletos: não enviar. Último turno não pode ser do modelo.
- Na busca, só trechos de páginas com `paginas.status = 'ok'`; vetor sem linha no D1 é ignorado.
- Identificadores e mensagens em português. Testes com vitest, sem rede (fetch e bindings falsos).

## Review Focus

1. Pergunta com CPF/e-mail ("meu CPF é 123.456.789-09, fui aprovado?"): nada disso sai do Worker, e a resposta não opina sobre o caso. Testes nas Tasks 3 e 4.
2. Modelo cita `[7]` com só 5 trechos, ou escreve um link: o número some e nenhum link do modelo vira fonte. Teste na Task 3.
3. Gemini fora do ar ou cota estourada: resposta 503 com mensagem amigável e CORS, sem vazar a chave. Teste na Task 4.
4. Pergunta com aspas, `*`, `-`, `OR`, parênteses (sintaxe FTS5): a busca não quebra. Teste na Task 2.
5. Duas edições do mesmo processo nos trechos (Vestibular 2026 e 2027): trechos da mais recente vêm antes e a data de cada um vai no prompt. Teste na Task 2.

---

### Task 1: Provedor de geração (Gemini) em `comum`

**Files:**
- Create: `comum/src/provedores/geracao.ts`, `comum/test/geracao.test.ts`

**Interfaces:**
- Produces:
  - `interface Mensagem { papel: 'usuario' | 'modelo'; texto: string }`
  - `interface Gerador { gerar(sistema: string, mensagens: Mensagem[]): Promise<string> }`
  - `interface EnvGeracao { PROVEDOR_LLM: string; GEMINI_API_KEY: string; MODELO_RESPOSTA?: string }`
  - `criarGerador(env: EnvGeracao, fetchFn?: typeof fetch): Gerador`

- [ ] **Step 1: Testes que falham** (`fetch` falso):
  - POST em `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` com cabeçalho `x-goog-api-key`, `systemInstruction.parts[0].text = sistema`, `contents` com `role` `user`/`model` na ordem; o corpo **não** tem `temperature`, `topP` nem `topK`.
  - `MODELO_RESPOSTA` troca o modelo na URL.
  - Devolve a concatenação dos `parts[].text` do primeiro candidato, ignorando partes marcadas `thought: true`.
  - Última mensagem com papel `modelo` lança erro antes de chamar a API.
  - HTTP 429 lança `Falha na geração do Gemini: HTTP 429 — <mensagem>` com a chave trocada por `[chave]` e no máximo 300 caracteres.
  - Resposta sem candidato ou com `finishReason` `SAFETY` lança erro `Gemini não devolveu texto`.
  - `PROVEDOR_LLM` diferente de `gemini` lança erro.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Conferir na doc oficial (ai.google.dev, generateContent e "thinking") o campo para pedir raciocínio mínimo no modelo padrão e usá-lo; registrar a URL conferida no relatório. Seguir o padrão de erro de `embeddings.ts` (mesmo arquivo de provedores).
- [ ] **Step 4: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(comum): provedor de geração do Gemini`

---

### Task 2: Busca híbrida

**Files:**
- Create: `worker-resposta/src/busca.ts`, `worker-resposta/test/busca.test.ts`, `worker-resposta/test/fakes.ts`

**Interfaces:**
- Consumes: `Embedder` (`@chatbot/comum/tipos`), `criarEmbedder` (já existe).
- Produces:
  - `interface Trecho { id: string; url: string; titulo: string; site: string; data: string; processo: string; ano: number; texto: string; similaridade: number }`
  - `interface DepsBusca { embedder: Embedder; vectorize: VectorizeIndex; db: D1Database; agora: () => Date }`
  - `consultaFts(pergunta: string): string | null` — termos de 3+ caracteres, cada um entre aspas duplas, unidos por ` OR `; até 12 termos, sem repetidos; `null` se nenhum.
  - `fundir(vetoriais: {id, similaridade}[], textuais: {id}[], meta: Map<string, {data, ano, processo}>, agora: Date): {id, pontuacao}[]` — RRF com `k = 60`; bônus de recência `0.01 * max(0, 1 - diasDesdeData/365)`; bônus `0.01` quando `ano >= anoAtual`; ordena por pontuação.
  - `buscarTrechos(pergunta: string, deps: DepsBusca, opcoes: { limiar: number; maximo?: number }): Promise<{ trechos: Trecho[]; melhorSimilaridade: number }>` — `maximo` padrão 6.

- [ ] **Step 1: Fakes.** `test/fakes.ts`: `VectorizeIndex` falso (`query` devolve `matches` configurados com `score` e `metadata`) e `D1Database` falso mínimo (`prepare().bind().all()` respondendo às duas consultas desta task: FTS e leitura de trechos+páginas).
- [ ] **Step 2: Testes que falham**
  - `consultaFts('Qual o "prazo" (de) inscrição* do -SiSU OR?')` → `'"qual" OR "prazo" OR "inscrição" OR "sisu"'` exatamente: palavras com 3+ caracteres, minúsculas, só letras (com acento) e dígitos; acentos mantidos (o FTS com `remove_diacritics 2` iguala); `o`, `de`, `do` descartados pelo tamanho e `or`/`and`/`not`/`near` descartados por serem operadores. Review Focus 4.
  - `consultaFts('a e o')` → `null`.
  - `fundir`: um id em 1º no vetorial e 1º no textual vence um id só em 1º no vetorial; trecho de 2027 vence trecho de 2026 empatado (Review Focus 5, com `agora` fixo em 2026-11-12).
  - `buscarTrechos`: chama `vectorize.query` com `topK: 20` e `returnMetadata: 'all'` e o embedding feito com `'RETRIEVAL_QUERY'`; lê o texto no D1 só de páginas `status = 'ok'`; descarta ids sem linha no D1; devolve no máximo 6; `melhorSimilaridade` é o maior `score` vetorial; com todos os scores abaixo do `limiar` devolve `trechos: []`.
  - FTS que lança erro (sintaxe) não derruba: segue só com o vetorial.
- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar.** FTS: `SELECT trecho_id FROM trechos_fts WHERE trechos_fts MATCH ? ORDER BY bm25(trechos_fts) LIMIT 20`. Textos e páginas: uma consulta `SELECT t.id, t.texto, p.url, p.titulo, p.site, p.data_publicacao, p.processo, p.ano FROM trechos t JOIN paginas p ON p.url = t.url WHERE p.status = 'ok' AND t.id IN (...)` (até 40 ids, abaixo de 100 parâmetros). Trecho só do FTS entra na fusão, mas o limiar usa só a similaridade vetorial.
- [ ] **Step 5: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(resposta): busca híbrida com fusão por posição e recência`

---

### Task 3: Regras, prompt, dados pessoais e fontes

**Files:**
- Create: `worker-resposta/src/regras.ts`, `worker-resposta/test/regras.test.ts`

**Interfaces:**
- Consumes: `Trecho` (Task 2), `Mensagem` (Task 1).
- Produces:
  - `const SEM_BASE: string` (texto exato das Global Constraints)
  - `mascararDadosPessoais(t: string): string` — CPF (com ou sem pontuação, 11 dígitos), e-mail e telefone brasileiro (com DDD, 10–11 dígitos, com ou sem parênteses/traço) → `[removido]`.
  - `montarSistema(trechos: Trecho[], hoje: Date): string` — regras + trechos numerados `[1]..[n]`, cada um com `título — site — processo ano — publicado em dd/mm/aaaa` e o texto.
  - `extrairFontes(resposta: string, trechos: Trecho[]): { resposta: string; fontes: { titulo: string; url: string; site: string; data: string }[] }`

- [ ] **Step 1: Texto das regras** (constante em `regras.ts`, copiar como está):
```
Você é o assistente virtual da COPERSE (Comissão Permanente do Processo Seletivo) da FURG. Responde a candidatos sobre os processos seletivos de ingresso da FURG (Vestibular, SiSU e processos específicos).
Regras:
1. Responda somente com base nos trechos numerados abaixo. Não use conhecimento próprio.
2. Cite a fonte de cada informação com o número do trecho entre colchetes, por exemplo [2]. Não escreva endereços de páginas.
3. Se os trechos não trazem a resposta, diga que não encontrou a informação e oriente consultar o edital oficial ou escrever para coperse@furg.br.
4. Não opine sobre a situação individual do candidato (homologação, recurso, nota, classificação). Oriente a consultar o sistema de inscrição ou a COPERSE.
5. Recuse com educação perguntas que não sejam sobre os processos seletivos da FURG.
6. Não peça nem repita dados pessoais (CPF, nome, e-mail, telefone).
7. Se trechos se contradizem, prevalece o mais recente; informe a data dele.
8. Responda sobre a edição mais recente do processo perguntado e diga qual é (por exemplo, "No Vestibular 2027"). Se só houver informação de edição passada, diga isso e não a apresente como atual.
9. Responda em português do Brasil, de forma curta e direta.
Hoje é {dd/mm/aaaa}.
```
- [ ] **Step 2: Testes que falham**
  - `mascararDadosPessoais('meu CPF é 123.456.789-09 e o e-mail fulano@x.com, fone (53) 99999-1234')` não contém nenhum dos três dados e contém três `[removido]`; `'12345678909'` também; `'Vestibular 2027 tem 1063 vagas'` fica igual (Review Focus 1).
  - `montarSistema` contém as regras, `Hoje é 12/11/2026` e `[1] Edital Vestibular 2027 — vestibular — vestibular 2027 — publicado em 01/10/2026`.
  - `extrairFontes` com 5 trechos e resposta `'Prazo até 10/12 [2]. Veja [7] e https://malicioso.example [2][3].'`: a resposta perde `[7]`, mantém `[2]` e `[3]`; fontes = trechos 2 e 3 na ordem de primeira citação; nenhuma fonte com `malicioso` (Review Focus 2). Dois trechos da mesma URL citados geram uma fonte só.
  - Resposta sem nenhuma citação válida → `fontes: []` (a rota trata, Task 4).
- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar.**
- [ ] **Step 5: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(resposta): regras do bot, máscara de dados pessoais e fontes`

---

### Task 4: Rota `POST /perguntar` e limite por visitante

**Files:**
- Create: `worker-resposta/src/perguntar.ts`, `worker-resposta/test/perguntar.test.ts`
- Modify: `worker-resposta/src/index.ts` (Env e roteamento), `worker-resposta/src/cors.ts` (`Vary: Origin` em toda resposta), `worker-resposta/wrangler.toml`, `worker-resposta/test/rotas.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `criarEmbedder`.
- Produces:
  - `Env` passa a ter: `DB`, `VECTORIZE`, `LIMITADOR: RateLimit`, `AMBIENTE`, `PROVEDOR_LLM`, `MODELO_RESPOSTA`, `MODELO_EMBEDDING`, `DIMENSAO_EMBEDDING`, `LIMIAR_SIMILARIDADE`, `GEMINI_API_KEY`, `REINDEX_TOKEN?`, `GITHUB_TOKEN?`, `GITHUB_REPO`, `GITHUB_WORKFLOW`.
  - `responderPergunta(entrada: { pergunta: string; historico: Mensagem[] }, deps: { buscar; gerador; agora }): Promise<{ resposta: string; fontes: Fonte[] }>`
  - `wrangler.toml`:
```toml
[vars]
AMBIENTE = "producao"
PROVEDOR_LLM = "gemini"
MODELO_RESPOSTA = "gemini-3.5-flash-lite"
MODELO_EMBEDDING = "gemini-embedding-001"
DIMENSAO_EMBEDDING = "768"
LIMIAR_SIMILARIDADE = "0.5"
GITHUB_REPO = "icqjef/chatbot-coperse"
GITHUB_WORKFLOW = "indexar.yml"

[[ratelimits]]
name = "LIMITADOR"
namespace_id = "1001"
  [ratelimits.simple]
  limit = 6
  period = 60
```

**Fluxo de `POST /perguntar`:** Origin fora da lista → 403 sem CORS. JSON inválido ou fora dos limites → 400 `{ erro }`. `LIMITADOR.limit({ key: sha256(ip + dataUTC) })` falso → 429 `{ erro: 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.' }`. Máscara de dados pessoais na pergunta e no histórico. Busca; sem trechos → `{ resposta: SEM_BASE, fontes: [] }` sem chamar o gerador. Gera com sistema da Task 3 e mensagens = histórico + pergunta. Resposta sem fonte válida → `SEM_BASE`. Erro de provedor → 503 `{ erro: 'O assistente está indisponível no momento. Tente de novo em instantes ou escreva para coperse@furg.br.' }`, com o erro (sem chave) só em `console.error`. Todas as respostas com CORS da origem.

- [ ] **Step 1: Testes que falham** (bindings e fetch falsos):
  - origem não permitida → 403; pergunta vazia, com 501 caracteres, histórico com 9 mensagens ou mensagem de 2001 caracteres → 400; `LIMITADOR` negando → 429 com CORS e `Vary: Origin`.
  - pergunta com CPF: o corpo enviado ao Gemini (embedding e geração) não contém o CPF (Review Focus 1).
  - sem base: o gerador não é chamado; resposta `SEM_BASE`.
  - com base: `{ resposta, fontes }` com as fontes da Task 3.
  - gerador lançando `Falha na geração do Gemini: HTTP 429` → 503 com a mensagem amigável e CORS; o corpo não contém `GEMINI_API_KEY` (Review Focus 3).
  - modelo responde sem citar → `SEM_BASE`.
  - chave do limite: o mesmo IP no mesmo dia gera a mesma chave; a chave não contém o IP.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** IP de `CF-Connecting-IP`.
- [ ] **Step 4: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(resposta): rota /perguntar com limite por visitante`

---

### Task 5: `/saude` com estado da indexação e `/reindexar`

**Files:**
- Create: `worker-resposta/src/operacao.ts`, `worker-resposta/test/operacao.test.ts`
- Modify: `worker-resposta/src/index.ts`, `worker-resposta/test/rotas.test.ts`, `README.md`, `docs/decisoes.md`

**Interfaces:**
- Produces:
  - `GET /saude` → `{ ok: true, ultima_indexacao: { inicio, fim, paginas, erros } | null, fila: number, paginas_ok: number }` (3 consultas simples ao D1; falha no D1 → `{ ok: false }` com 503).
  - `iguaisEmTempoConstante(a: string, b: string): Promise<boolean>` (SHA-256 dos dois e `crypto.subtle.timingSafeEqual`).
  - `POST /reindexar` → 202 `{ ok: true }` após `POST https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{GITHUB_WORKFLOW}/dispatches` com `{ "ref": "main" }`, cabeçalhos `Authorization: Bearer {GITHUB_TOKEN}`, `Accept: application/vnd.github+json`, `User-Agent: chatbot-coperse`. Token errado → 401; `REINDEX_TOKEN` ausente/curto ou `GITHUB_TOKEN` ausente → 503; GitHub ≠ 204 → 502 sem ecoar o corpo. Passa também pelo `LIMITADOR` (429).
- [ ] **Step 1: Testes que falham** para cada caso acima, incluindo: senha certa com tamanho diferente não lança; nenhuma resposta ecoa os tokens.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Documentação.** README: seção "Worker de resposta" (rotas, variáveis, segredos e onde cadastrá-los no painel do Cloudflare: Workers & Pages → chatbot-coperse → Settings → Variables and Secrets; como criar o token do GitHub de escopo mínimo: fine-grained, só este repositório, permissão Actions: Read and write). `decisoes.md` (2026-11-12): modelo de resposta `gemini-3.5-flash-lite` com preço e estimativa por pergunta (≈ 5 mil tokens de entrada e 600 de saída ≈ US$ 0,003), trocável por `MODELO_RESPOSTA`; limite por binding de Rate Limiting (aproximado, por local do Cloudflare); limiar inicial 0,5 a calibrar na etapa 7; o que foi aproveitado do rootsongjc/rag-chatbot nesta etapa.
- [ ] **Step 5: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(resposta): /saude com estado da indexação e /reindexar protegido`

---

### Task 6: Publicação e prova real (controlador, com o Jeferson)

- [ ] **Step 1:** PR, CI verde, merge; conferir que o `publicar` subiu o Worker. Se o deploy recusar o binding `ratelimits` no plano gratuito, trocar por contador no D1 com a mesma chave (tabela `limites(chave, minuto, n)`, migração nova) em PR próprio e registrar em `decisoes.md`.
- [ ] **Step 2:** Jeferson cadastra no painel do Cloudflare os segredos `GEMINI_API_KEY`, `REINDEX_TOKEN` (senha com 40+ caracteres, gerada por ele) e `GITHUB_TOKEN` (fine-grained, só este repositório, Actions: Read and write). Nenhum valor passa pelo chat.
- [ ] **Step 3: Prova** com `curl` e `Origin: https://sisu3.furg.br`: 3 perguntas com resposta nos sites (data, vagas, documento), 1 fora do tema, 1 sobre situação individual com CPF, 1 sem base, 7 perguntas seguidas (a 7ª dá 429), `/saude`, `/reindexar` com senha errada (401). Conferir cada resposta com a página citada.
- [ ] **Step 4:** registrar o resultado em `decisoes.md` e pedir o aceite da etapa 5.
