# Etapa 7 — Qualidade e portão: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** medir as respostas do bot publicado com 30 perguntas de referência e só liberar a colagem nos sites quando a categoria datas/vagas/prazos passar 100%.

**Architecture:** um executor em Node (`avaliacao/`) chama o `POST /perguntar` publicado e confere cada resposta com regras simples (fatos obrigatórios, fonte, ausência de fontes, textos proibidos). Antes disso, três correções no indexador que a conferência do índice de 2026-11-13 mostrou: chave inválida do Gemini derruba a execução sem penalizar a fila, edições antigas saem do índice, e o ano passa a vir do texto do documento quando o título não tem ano. Uma correção na busca trata perguntas de seguimento.

**Tech Stack:** TypeScript, Vitest, Node 20 (`fetch` nativo), Cloudflare D1/Vectorize, Gemini.

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md` (seções 5.9, 6 e 7, risco R5)

## Global Constraints

- Portão: a categoria `datas-vagas-prazos` precisa de 100% antes de colar o script nos sites.
- Não inventar números, datas nem citações: as respostas esperadas vêm dos trechos indexados e são conferidas pelo Jeferson (`conferido_por_jeferson`).
- O executor respeita o limite de 6 perguntas por minuto por visitante: no mínimo 11 s entre perguntas.
- O executor envia `Origin: https://chatbot-coperse.coperse-furg.workers.dev` (origem autorizada em `config/origens.json`).
- Segredos só no Cloudflare e no GitHub; nenhum valor de chave em código, log ou teste.
- Textos para o usuário em português do Brasil.

## Review Focus

- Chave do Gemini inválida ou revogada (HTTP 400 "API key not valid", 401, 403): a execução para, nenhum item da fila perde tentativa, nenhuma página vira `erro`, e o workflow termina com falha (o GitHub avisa por e-mail).
- PDF de 2027 guardado em pasta `.../Vestibular-2026/` e com título sem ano ("Consulte aqui a retificação do cronograma"): o ano vem do texto ("Vestibular FURG 2027"), não da pasta.
- Página de edição antiga já indexada (`/anos-anteriores/`, `/images/Editais/2010..2024/`): sai do índice (trechos, FTS e vetores) na próxima execução, e links novos para ela não entram na fila.
- Pergunta de seguimento curta ("e de Medicina?") depois de uma pergunta sobre vagas: a busca usa também a pergunta anterior do usuário.
- Resposta com a data no formato "22 de novembro" quando a esperada é "22/11/2026": o verificador aceita as formas listadas em `fatos`, sem diferenciar maiúsculas nem acentos.

---

### Task 1: Chave inválida do Gemini para a indexação sem penalizar a fila

**Files:**
- Modify: `comum/src/provedores/embeddings.ts` (erro tipado)
- Modify: `worker-indexacao/src/principal.ts` (tratamento em `processar` e no laço principal)
- Test: `worker-indexacao/test/principal.test.ts`, `comum/test/embeddings.test.ts` (ou os arquivos de teste existentes desses módulos)

**Interfaces:**
- Produces: `export class ErroAutenticacaoProvedor extends Error` em `comum/src/provedores/embeddings.ts`, lançado quando a resposta do Gemini é 401, 403, ou 400 cujo corpo contém `API key not valid` / `API_KEY_INVALID`. A mensagem não pode conter a chave.

- [ ] **Step 1: testes que falham**
  - `embed` com resposta 400 `{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}` lança `ErroAutenticacaoProvedor`; com 401 e 403 também; com 429 e 500 continua lançando `Error` comum.
  - Execução do indexador com 3 itens na fila em que o embedder lança `ErroAutenticacaoProvedor` no primeiro: nenhuma chamada a `registrarErro`, `tentativas` dos 3 itens inalteradas, `paginas` sem alteração, e a função principal rejeita (o processo sai com código ≠ 0).
- [ ] **Step 2:** rodar `npm test -w worker-indexacao` e `npm test -w comum`; esperado: FAIL.
- [ ] **Step 3:** implementar. Em `processar`, `ErroAutenticacaoProvedor` é relançado antes de qualquer `registrarErro`/`adiarItem`; o laço principal grava `execucoes.fim` e sai com erro registrando no log só `Chave do Gemini recusada pelo provedor`.
- [ ] **Step 4:** testes passam; `npm run typecheck` limpo.
- [ ] **Step 5:** commit `fix(indexacao): chave recusada interrompe a execução sem penalizar a fila`.

### Task 2: Edições antigas fora do índice

**Files:**
- Modify: `config/sites.json` (campo novo `excluir` por site: lista de expressões regulares aplicadas à URL completa)
- Modify: `worker-indexacao/src/fila.ts` ou onde os links são enfileirados; `worker-indexacao/src/principal.ts` (limpeza)
- Test: testes existentes de fila/principal

**Interfaces:**
- Consumes: `removerPagina` de `worker-indexacao/src/indexar.ts` (já remove trechos, FTS e vetores).
- Produces: `Site.excluir?: string[]`; `export function urlExcluida(url: string, site: Site): boolean`.

Valores para `coperse`: `["/anos-anteriores/", "/images/Editais/20(0\\d|1\\d|2[0-4])/"]`. Para `sisu`: `["/anos-anteriores/"]`. Para `vestibular`: `[]`.

- [ ] **Step 1: testes que falham**
  - `urlExcluida('https://coperse.furg.br/anos-anteriores/indigenas/ps-2019-indigenas', coperse)` → `true`; `.../images/Editais/2024/indigenas/x.pdf` → `true`; `.../images/2026/Vestibular-2026/Cronograma_retificado.pdf` → `false`; `.../images/Editais/2025/x.pdf` → `false`.
  - Link para URL excluída não entra na fila.
  - Item já na fila cuja URL é excluída sai da fila sem ser buscado; página `ok` já indexada cuja URL é excluída passa por `removerPagina` na execução seguinte.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar; a validação de `config/sites.json` (onde já houver) aceita o campo e rejeita regex inválida ao carregar.
- [ ] **Step 4:** testes passam.
- [ ] **Step 5:** commit `feat(indexacao): exclui páginas de edições antigas`.

### Task 3: Ano a partir do texto quando o título não tem ano

**Files:**
- Modify: `comum/src/classificar.ts` (`inferirAno`)
- Modify: chamadas de `inferirAno` no indexador, para passar o início do texto extraído
- Test: `comum/test/classificar.test.ts`

**Interfaces:**
- Produces: `inferirAno(titulo: string, url: string, texto?: string): number | null`. Ordem: ano no título; senão, primeira ocorrência de `(vestibular|sisu|processo seletivo|ps)` seguida, em até 60 caracteres, de um ano `20[0-3]\d` nos primeiros 3000 caracteres do texto; senão, último ano do caminho da URL.

- [ ] **Step 1: testes que falham**
  - `inferirAno('Consulte aqui a retificação do cronograma', 'https://coperse.furg.br/images/2026/Vestibular-2026/Cronograma_retificado.pdf', '10.1. O cronograma do Vestibular FURG 2027 está apresentado na Tabela 5')` → `2027`.
  - `inferirAno('EDITAL Nº 21/2026', url, '... Processo Seletivo Específico para Ingresso de Estudantes Transgêneros no primeiro semestre de 2027')`: o título tem 2026 e vence → `2026` (o título continua prioritário; documentado no teste).
  - Sem texto, comportamento atual mantido (todos os testes existentes passam).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `fix(classificar): ano do texto quando o título não tem ano`.

Nota: páginas já indexadas só são reclassificadas quando o conteúdo muda. Depois do merge, o controlador força a reclassificação dos PDFs `tipo='pdf'` com `ano=2026` do coperse, recolocando-os na fila (consulta no D1 registrada em `decisoes.md`).

### Task 4: Perguntas de seguimento

**Files:**
- Modify: `worker-resposta/src/perguntar.ts` (`responderPergunta`)
- Test: `worker-resposta/test/perguntar.test.ts`

**Interfaces:**
- Produces: `export function consultaDeBusca(pergunta: string, historico: Mensagem[]): string`. Se a pergunta tiver menos de 60 caracteres e houver mensagem anterior do usuário no histórico, devolve `"<última pergunta do usuário>\n<pergunta>"`; senão devolve a pergunta. `responderPergunta` passa o resultado a `deps.buscar`.

- [ ] **Step 1: testes que falham**
  - `consultaDeBusca('e de Medicina?', [{papel:'usuario',texto:'Quantas vagas de Direito tem no Vestibular 2027?'},{papel:'modelo',texto:'22 vagas [1]'}])` → `'Quantas vagas de Direito tem no Vestibular 2027?\ne de Medicina?'`.
  - Pergunta com 60 ou mais caracteres → ela mesma; histórico vazio → ela mesma.
  - `responderPergunta` chama `buscar` com a consulta combinada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(resposta): busca considera a pergunta anterior em seguimentos curtos`.

### Task 5: Executor das perguntas de referência

**Files:**
- Existing: `avaliacao/perguntas.json` (rascunho, já no ramo; formato descrito no campo `nota`)
- Create: `avaliacao/verificar.mjs`, `avaliacao/avaliar.mjs`, `avaliacao/package.json` (workspace `avaliacao`, script `test` com vitest e `avaliar`), `avaliacao/test/verificar.test.mjs`
- Modify: `package.json` raiz (workspace `avaliacao`), `.gitignore` (`avaliacao/resultados/`)

**Interfaces:**
- Produces: `export function verificar(p: Pergunta, r: { resposta: string; fontes: {url:string}[] } | { erro: string; status: number }): { ok: boolean; motivos: string[] }`.
  Regras: cada item de `fatos` precisa de ao menos uma forma presente (minúsculas, sem acentos, espaços normalizados); se `fonte` não for vazia, alguma `fontes[].url` contém o texto (sem diferenciar maiúsculas); `sem_fontes: true` exige `fontes` vazio; nenhum item de `proibidos` presente; `deve_dizer_edicao_passada: "2022"` passa se a resposta contém esse ano ou se não tem fontes e contém `coperse@furg.br`. Resposta de erro (`status ≠ 200`) sempre falha com o status no motivo.
- `node avaliacao/avaliar.mjs [--url URL] [--so id1,id2]`: URL padrão `https://chatbot-coperse.coperse-furg.workers.dev`; 11 s entre perguntas; histórico vazio; imprime uma linha por pergunta (`OK`/`FALHOU`, id, motivos), o placar por categoria, e grava `avaliacao/resultados/<ISO>.json`. Sai com código 1 se alguma de `datas-vagas-prazos` falhar ou se `conferido_por_jeferson` for `false` (com aviso, depois de rodar tudo).

- [ ] **Step 1: testes que falham** (`verificar`): data aceita por forma alternativa ("22 de novembro"); acento e maiúscula ignorados ("Papeis avulsos" casa "Papéis Avulsos"); fonte ausente falha com motivo `fonte`; `sem_fontes` com uma fonte falha; proibido presente falha; resposta 429 falha com motivo `HTTP 429`; edição passada com "2022" passa.
- [ ] **Step 2:** FAIL. **Step 3:** implementar sem dependências além de vitest. **Step 4:** PASS e `npm test` da raiz inclui o workspace.
- [ ] **Step 5:** commit `feat(avaliacao): executor das perguntas de referência`.

### Task 6 (controlador, depois do merge e de uma indexação completa): rodar, calibrar, conferir

Não é tarefa de subagente; o controlador faz e registra em `docs/decisoes.md`.

- [ ] Conferir no D1: vetores < 6000; nenhuma página `ok` com URL excluída; PDFs do Vestibular 2027 com `ano=2027`; edital do Vestibular 2027 e edital dos indígenas 2027 indexados.
- [ ] Rodar `node avaliacao/avaliar.mjs`. Para cada falha, classificar: índice (documento ausente), busca (trecho certo fora do top-k ou abaixo do limiar), resposta (regra do prompt) ou pergunta mal escrita.
- [ ] Calibrar `LIMIAR_SIMILARIDADE` com as falhas de busca: testar 0,4, 0,5 e 0,6 mudando a variável em `worker-resposta/wrangler.toml` por PR; fica o maior valor que mantém 100% em datas/vagas/prazos e as armadilhas sem fontes.
- [ ] Teste de carga leve: 10 perguntas seguidas com `--so`, conferindo o tempo de CPU por chamada nos logs do Worker (Observability); registrar o máximo e o p50 frente ao limite de 10 ms do plano gratuito.
- [ ] Repetir até o portão passar com `conferido_por_jeferson: true`.
