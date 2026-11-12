# Etapa 4 — Rastreamento completo, PDFs, processo/ano e listas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o indexador percorre todas as páginas e PDFs dos três sites (edições atuais e anteriores), marca cada documento com processo e ano, e nunca indexa o conteúdo de listas nominais de candidatos.

**Architecture:** o indexador (Node, GitHub Actions a cada 2 h) passa a trabalhar com a tabela `fila` do D1. Cada execução semeia a fila com os itens do feed e as páginas-chave, processa itens até um orçamento de tempo e de quantidade, e enfileira os links encontrados (mesmo domínio, profundidade limitada). HTML é extraído com cheerio e PDF com unpdf. Processo, ano e "lista de candidatos" vêm de regras configuráveis em `config/`. Um teto de vetores protege o limite gratuito do Vectorize.

**Tech Stack:** Node 22, TypeScript, vitest, cheerio, fast-xml-parser, unpdf 2.x (novo), API REST do Cloudflare (D1 + Vectorize), Gemini embeddings, GitHub Actions, `liskin/gh-workflow-keepalive@v1.2.1` (novo).

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md` (seções 5–6, risco R5 e R6).

## Global Constraints

- Nenhum segredo no código. Credenciais só por variável de ambiente vinda dos secrets/vars do GitHub.
- User-Agent `ChatbotCOPERSE-Indexador/0.1`. Pausa de 1 s entre requisições (`esperar(1000)`).
- Só buscar URLs cujo host esteja em `site.dominios_permitidos`.
- **Listas de candidatos (decisão do Jeferson, 2026-11-12):** documentos classificados como lista nominal (resultado, homologação, chamada, classificação, aprovados, listas, deferidos/indeferidos, notas, locais de prova, selecionados etc.) nunca têm o conteúdo indexado nem baixado (PDF). Entra só um trecho-resumo com título, data e link. Isso vale para PDFs e para páginas HTML.
- **Todas as edições, inclusive anteriores (decisão b do Jeferson):** nada fica de fora por ano; cada documento leva `processo` e `ano`.
- D1: no máximo 100 parâmetros por consulta; lotes de inserção fecham em 20 linhas ou 60 000 caracteres de texto.
- Teto de vetores padrão: 6000 (limite gratuito: 5 000 000 dimensões ÷ 768 ≈ 6510). Ao atingir o teto, o indexador para de criar vetores, avisa no resumo e sai com código 0.
- PDF maior que 15 MB não é baixado: registrado como erro.
- Revisita: HTML já visto há menos de 20 h não é reprocessado (exceto feed e páginas-chave); PDF já `ok` há menos de 30 dias não é reprocessado.
- Identificadores e mensagens em português, como no código existente. Testes com vitest, sem rede (fetch injetado).

## Review Focus

1. Link com texto genérico ("clique aqui") para um PDF de resultado: deve virar lista pelo nome do arquivo. Teste na Task 2 e na Task 3.
2. Mesmo link presente no menu de 600 páginas: enfileirado uma vez, sem uma chamada ao D1 por ocorrência. Teste na Task 6.
3. Execução que estoura o orçamento de tempo no meio: a próxima retoma da fila e não reindexa o que já está `ok`. Teste na Task 6.
4. PDF escaneado (sem texto), PDF de 20 MB e página 404: registrados, sem derrubar a execução e sem nova tentativa infinita. Testes nas Tasks 3, 5 e 6.
5. URL com fragmento `#...` ou acentos codificados (`%C3%A7`): mesma chave na fila e em `paginas`. Teste na Task 5.

---

### Task 1: Migração 0002 e cliente Cloudflare com lotes e contagem de vetores

**Files:**
- Create: `worker-resposta/migrations/0002_fila_metadados.sql`
- Modify: `worker-indexacao/src/cloudflare.ts`
- Test: `worker-indexacao/test/cloudflare.test.ts`, `worker-indexacao/test/fakes.ts`

**Interfaces:**
- Produces:
  - `ClienteCloudflare.inserirLinhas(tabela: string, colunas: string[], linhas: unknown[][], opcoes?: { ignorarRepetidas?: boolean }): Promise<void>`
  - `ClienteCloudflare.contarVetores(): Promise<number>`
  - colunas novas em `fila`: `titulo TEXT`, `processo TEXT`, `ano INTEGER`, `data TEXT`

- [ ] **Step 1: Escrever a migração**

```sql
ALTER TABLE fila ADD COLUMN titulo TEXT;
ALTER TABLE fila ADD COLUMN processo TEXT;
ALTER TABLE fila ADD COLUMN ano INTEGER;
ALTER TABLE fila ADD COLUMN data TEXT;
CREATE INDEX fila_ordem ON fila(prioridade DESC, profundidade ASC);
```

- [ ] **Step 2: Testes que falham** em `cloudflare.test.ts`:
  - `inserirLinhas divide em lotes de até 20 linhas`: 45 linhas de 4 colunas geram 3 POSTs em `/d1/database/{id}/query` com SQL `INSERT INTO trechos (id, url, ordem, texto) VALUES (?, ?, ?, ?), (?, ?, ?, ?)...` e `params` achatados (80, 80 e 20 parâmetros).
  - `inserirLinhas fecha o lote ao passar de 60000 caracteres`: 3 linhas com textos de 25 000 caracteres geram 2 POSTs (2 + 1).
  - `inserirLinhas com ignorarRepetidas usa INSERT OR IGNORE`.
  - `inserirLinhas recusa lote acima de 100 parâmetros`: 1 linha com 101 colunas lança erro.
  - `inserirLinhas sem linhas não chama a API`.
  - `contarVetores lê vectorCount`: GET em `/vectorize/v2/indexes/{indice}/info` com resposta `{success:true,result:{vectorCount:42,dimensions:768}}` devolve 42.
  - Nomes de tabela/coluna fora de `^[a-z_]+$` lançam erro (o SQL é montado por concatenação).

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run worker-indexacao/test/cloudflare.test.ts` → FAIL (`inserirLinhas is not a function`).

- [ ] **Step 4: Implementar.** `chamar` passa a aceitar método GET sem corpo. Lote: acumula linhas enquanto `linhas*colunas ≤ 100`, `linhas ≤ 20` e soma dos `String(valor).length` ≤ 60 000. Atualizar o fake de `ClienteCloudflare` em `fakes.ts` com os dois métodos novos (o fake de `inserirLinhas` grava as linhas na tabela em memória, como o fake de `d1` já faz para INSERT).

- [ ] **Step 5: Rodar** `npm test -w worker-indexacao` e `npm run typecheck` → PASS.

- [ ] **Step 6: Commit** — `feat(indexacao): inserções em lote no D1, contagem de vetores e migração da fila`

---

### Task 2: Regras de processo, ano e listas de candidatos

**Files:**
- Create: `comum/src/classificar.ts`, `config/processos.json`, `config/listas.json`
- Modify: `comum/src/tipos.ts`, `comum/src/config.ts` (campo opcional `processo_padrao` em `Site`), `config/sites.json`
- Test: `comum/test/classificar.test.ts`, `comum/test/config.test.ts`

**Interfaces:**
- Produces (em `@chatbot/comum/classificar`):
  - `interface RegrasClassificacao { processos: { processo: string; padroes: RegExp[] }[]; lista: { padroes: RegExp[]; excecoes: RegExp[] } }`
  - `carregarRegras(processosJson: unknown, listasJson: unknown): RegrasClassificacao`
  - `normalizar(s: string): string`: decodifica `%xx` (sem lançar em sequência inválida), minúsculas, sem acentos (NFD), `_`, `-`, `/`, `.` viram espaço, espaços colapsados.
  - `inferirProcesso(textos: string[], regras): string | null`: testa as regras na ordem do arquivo, contra cada texto normalizado na ordem dada; a primeira regra que casa vence.
  - `inferirAno(titulo: string, url: string): number | null`: primeiro `(?<!\d)20[0-3]\d(?!\d)` do título; senão o **último** do caminho da URL; senão `null`.
  - `ehListaDeCandidatos(titulo: string, url: string, regras): boolean`: casa algum padrão de lista no título ou no nome do arquivo da URL normalizados, e o título normalizado não casa nenhuma exceção.
- `Site` ganha `processo_padrao?: string`. Em `sites.json`: sisu → `"sisu"`, vestibular → `"vestibular"`. Coperse fica sem.

- [ ] **Step 1: Conteúdo dos arquivos de regras** (padrões são fontes de RegExp aplicadas a texto já normalizado):

`config/processos.json` (ordem importa):
```json
[
  { "processo": "transgeneros", "padroes": ["transgener"] },
  { "processo": "quilombolas", "padroes": ["quilomb"] },
  { "processo": "indigenas", "padroes": ["indigena"] },
  { "processo": "ead", "padroes": ["\\bead\\b", "a distancia"] },
  { "processo": "educacao-do-campo", "padroes": ["educacao do campo"] },
  { "processo": "vagas-complementares", "padroes": ["vagas complementares"] },
  { "processo": "proprio", "padroes": ["\\bproprio\\b"] },
  { "processo": "sisu", "padroes": ["\\bsisu\\b"] },
  { "processo": "vestibular", "padroes": ["vestibular"] }
]
```

`config/listas.json`:
```json
{
  "padroes": ["resultado", "homologa", "aprovad", "classifica", "convoca", "chamad", "chamamento",
              "\\blista\\b", "listagem", "deferid", "\\bnotas?\\b", "locais de provas?", "local de provas?",
              "\\bsalas\\b", "selecionad", "suplente", "complementacao documental", "heteroidentifica"],
  "excecoes": ["^edital\\b", "^retificacao\\b", "^extrato\\b", "^anexo\\b", "gabarito"]
}
```

- [ ] **Step 2: Testes que falham** (títulos e arquivos reais do coperse):
  - `ehListaDeCandidatos` **verdadeiro** para:
    - `('Lista dos Convocados (Aprovados)', '.../aprovados_quilombolas_2026-1.pdf')`
    - `('Clique aqui para visualizar', '.../PS_QUILOMBOLAS_2026_-_RESULTADO_RECURSOS_NOTAS.pdf')` (Review Focus 1)
    - `('clique aqui', '.../2Homologa%C3%A7%C3%A3o_Preliminar_PS_Quilombolas_2026docx_-_Google_Docs.pdf')`
    - `('Locais de provas do PS 2016 - Quilombolas', '.../000724.pdf')`
    - `('Divulgação dos/as fiscais selecionados/as para atuar no Vestibular 2027', 'https://coperse.furg.br/x')`
    - `('Homologação das inscrições dos Avaliadores das Questões Analítico-Discursivas de Língua Portuguesa do Vestibular FURG 2027', ...)`
    - `('Lista de complementação documental deferidas e indeferidas', ...)`
  - **falso** para:
    - `('Edital PS EaD 2026', '.../Edital_EaD_20261_FINAL_OK.pdf')`
    - `('RETIFICAÇÃO Nº 1 DO EDITAL DO PROCESSO SELETIVO 2026 ...', '.../Retificao_n_1_PS_Quilombolas.pdf')`
    - `('Gabarito Final', '.../000675.pdf')`
    - `('Anexo I - Documento de Autodeclaração Quilombola', ...)`
    - `('Prorrogação das inscrições do PS Específico para Estudantes Transgêneros', ...)`
  - `inferirProcesso`: `'Edital PS Índigenas 2026'` → `indigenas`; `'PS Específico para Estudantes Transgêneros'` → `transgeneros`; `['Edital', 'https://coperse.furg.br/anos-anteriores/ead-furg/ps-2017-ead-furg']` → `ead`; `'Vestibular FURG 2027'` → `vestibular`; `'Calendário'` → `null`.
  - `inferirAno`: `('Vestibular 2027', 'https://x/2026/a')` → 2027; `('Edital', 'https://coperse.furg.br/anos-anteriores/2024-3/ps-2013-quilombolas')` → 2013; `('Edital', '.../Edital_EaD_20261_FINAL_OK.pdf')` → `null`; `('Edital', 'https://x/a')` → `null`.
  - `normalizar('Homologa%C3%A7%C3%A3o_Final-2017.pdf')` → `'homologacao final 2017 pdf'`; `normalizar('%E0%A4%A')` não lança.
  - `carregarRegras` lança com padrão de RegExp inválido, citando o padrão; `carregarSites` aceita `processo_padrao` texto e recusa não texto.

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run comum/test/classificar.test.ts` → FAIL.
- [ ] **Step 4: Implementar** `classificar.ts`, o campo em `config.ts`/`tipos.ts` e o `sites.json`.
- [ ] **Step 5: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(comum): regras de processo, ano e listas de candidatos`

---

### Task 3: Extração — links com título, data publicada, PDF e busca por tipo

**Files:**
- Modify: `worker-indexacao/src/extrair.ts`, `worker-indexacao/src/http.ts`, `comum/src/tipos.ts`, `worker-indexacao/package.json` (dependência `unpdf` `^2.1.0`)
- Create: `worker-indexacao/src/pdf.ts`, `worker-indexacao/test/pdf.test.ts`, `worker-indexacao/test/http.test.ts`, fixtures `test/fixtures/coperse-processo.html`, `test/fixtures/vestibular-inicio.html`, `test/fixtures/edital-pequeno.pdf`
- Test: `worker-indexacao/test/extrair.test.ts`

**Interfaces:**
- Produces:
  - `interface LinkEncontrado { url: string; titulo: string }` em `comum/src/tipos.ts`
  - `PaginaExtraida` ganha `data?: string` (ISO) e `links: LinkEncontrado[]`
  - `extrairPagina(html: string, urlPagina: string): PaginaExtraida` (assinatura muda; atualizar chamadores e testes)
  - `extrairPdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }>` em `pdf.ts`
  - `class ErroHttp extends Error { status: number }` e `interface Resposta { tipo: 'html' | 'pdf' | 'outro'; texto?: string; bytes?: Uint8Array; ultimaModificacao?: string }`
  - `criarBuscar(fetchFn?: typeof fetch): (url: string) => Promise<Resposta>` em `http.ts` (substitui `criarBuscarHtml`)

- [ ] **Step 1: Fixtures reais.** Salvar `https://coperse.furg.br/processos-seletivos/quilombolas` como `coperse-processo.html` e `https://vestibular.furg.br/` como `vestibular-inicio.html`. Baixar um PDF de edital pequeno (< 300 KB, que não seja lista) do coperse como `edital-pequeno.pdf` e anotar no teste uma frase que aparece nele.

- [ ] **Step 2: Testes que falham**
  - `extrairPagina` coleta links **antes** de remover nav/header/footer (os menus levam às páginas de processo): na fixture coperse, `links` contém um item com url terminando em `oficial_2026_-_Edital_PS_Quilombolasdocx.pdf` e título com `EDITAL PROCESSO SELETIVO 2026`; URLs ficam absolutas e sem `#fragmento`; `mailto:`, `tel:` e `javascript:` não entram; um link repetido aparece uma vez.
  - Título de link genérico: para `<li>Resultado do recurso da inscrição: <a href="/a.pdf">clique aqui</a></li>`, o título é `Resultado do recurso da inscrição: clique aqui` (texto do bloco pai `li|p|td|div` mais próximo, até 200 caracteres). Para `<a href="/x/Resultado_Final_2017.pdf">aqui</a>` sem texto no pai, o título é `Resultado Final 2017` (nome do arquivo sem extensão, `_`/`-` viram espaço, `%xx` decodificado). Genérico = texto normalizado que começa com `clique|clicando|acesse|veja|aqui|visualizar|baixe|download` ou tem menos de 4 letras.
  - `data`: `<time datetime="2026-10-01T10:00:00-03:00">` ou `[itemprop="datePublished"]` (atributo `datetime` ou `content`) vira ISO; sem isso, `undefined`.
  - Fixture do vestibular: `texto` contém `vagas` e `links` contém ao menos um `/api/documentos/publico?arquivo=`.
  - `extrairPdf(edital-pequeno.pdf)` contém a frase anotada e `paginas ≥ 1`; `extrairPdf(new Uint8Array([1,2,3]))` lança erro com `PDF inválido`.
  - `criarBuscar` com fetch falso: `content-type: application/pdf` → `tipo 'pdf'` e `bytes`; `text/html; charset=utf-8` → `tipo 'html'` e `texto`; `image/png` → `tipo 'outro'`; cabeçalho `last-modified` vira `ultimaModificacao` ISO; HTTP 404 lança `ErroHttp` com `status 404`; `content-length` de 20 MB lança erro `maior que 15 MB` sem ler o corpo; corpo sem `content-length` que passa de 15 MB também lança (Review Focus 4). Timeout de 60 s via `AbortSignal.timeout`.

- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar.** `extrairPdf` usa `getDocumentProxy` + `extractText(doc, { mergePages: true })` do unpdf, normaliza espaços como `extrairPagina`. Atualizar `principal.ts` e `indexar.ts` só o necessário para compilar (a refatoração vem nas Tasks 4 e 6).
- [ ] **Step 5: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(indexacao): links com título, data publicada, leitura de PDF e busca por tipo`

---

### Task 4: `indexarDocumento` — indexar texto já extraído, com processo, ano, tipo, listas e teto

**Files:**
- Modify: `worker-indexacao/src/indexar.ts`, `comum/src/tipos.ts`
- Test: `worker-indexacao/test/indexar.test.ts`

**Interfaces:**
- Consumes: `inserirLinhas` (Task 1).
- Produces:
  - `type TipoDocumento = 'html' | 'pdf' | 'lista'` e `interface Documento { site: Site; url: string; tipo: TipoDocumento; titulo: string; data: string; processo: string; ano: number; texto: string }` em `tipos.ts`
  - `type ResultadoIndexacao = 'nova' | 'alterada' | 'igual' | 'vazia' | 'erro' | 'teto'`
  - `interface DepsIndexacao { cf; embedder; agora(): string; teto?: { restante(): number; consumir(n: number): void } }` (sem `buscarHtml`)
  - `indexarDocumento(doc: Documento, deps: DepsIndexacao): Promise<ResultadoIndexacao>`
  - `resumoDeLista(titulo: string, data: string, url: string): string` → `"<titulo>. Documento publicado em <dd/mm/aaaa>. Disponível em: <url>. Este documento traz uma lista nominal; o assistente não reproduz o conteúdo, consulte o link."`
  - `registrarErro(e: { site: Site; url: string; titulo: string; data: string; tipo: TipoDocumento; processo: string; ano: number }, msg: string, deps): Promise<number>` (devolve `falhas` após o incremento)
  - `removerPagina(url: string, deps): Promise<void>` (apaga trechos, FTS e vetores; `status = 'removida'`)

- [ ] **Step 1: Testes que falham** (adaptar os existentes de `indexarPagina`, que deixa de existir):
  - documento novo grava `paginas.tipo`, `processo`, `ano` do documento; metadados do vetor e prefixo do trecho usam `processo`/`ano` do documento.
  - `tipo 'lista'`: o chamador passa `texto = resumoDeLista(...)`; gera exatamente 1 trecho; teste de `resumoDeLista('Lista dos Convocados', '2026-11-10T12:00:00Z', 'https://c/a.pdf')` com a frase exata acima e data `10/11/2026`.
  - trechos e FTS gravados por `inserirLinhas` (nenhuma chamada `INSERT INTO trechos` via `d1`).
  - teto: com `restante() = 2` e documento novo de 3 trechos → devolve `'teto'`, não chama o embedder nem grava nada; com documento alterado de 5 para 6 trechos e `restante() = 1` → indexa e chama `consumir(1)`; trechos a menos chamam `consumir` com número negativo.
  - os comportamentos existentes continuam: `igual` só com hash igual e status `ok`; `indexando` antes dos DELETE; apagar só vetores obsoletos; falha no meio deixa `status 'erro'` e `falhas+1`.
  - `registrarErro` devolve 1, depois 2, para a mesma URL. `removerPagina` apaga os vetores dos trechos da URL e marca `removida`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** O hash cobre o texto final (para listas, o resumo), então mudança de título reindexa a lista. `principal.ts` passa a buscar e extrair a página do feed e chamar `indexarDocumento` (tipo `html`, processo `geral`), só o necessário para compilar e manter os testes atuais; a orquestração nova vem na Task 6.
- [ ] **Step 4: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `refactor(indexacao): indexarDocumento com processo, ano, listas e teto de vetores`

---

### Task 5: Fila de rastreamento

**Files:**
- Create: `worker-indexacao/src/fila.ts`, `worker-indexacao/test/fila.test.ts`

**Interfaces:**
- Consumes: `ClienteCloudflare` (Task 1).
- Produces:
  - `normalizarUrl(url: string): string | null`: absoluta, sem fragmento, host em minúsculas, `%xx` canônico (decodifica e recodifica o caminho com `encodeURI`); `null` se inválida.
  - `deveIgnorar(url: string): boolean`: mesma regra do censo: `\.(css|js|png|jpe?g|gif|svg|ico|webp|zip|docx?|xlsx?|mp4)(\?|$)|/_next/|format=feed|/login|/area|[?&](start|limitstart|print|tmpl)=`.
  - `ehPdf(url: string): boolean`: `\.pdf(\?|$)` (sem distinção de maiúsculas) ou `/api/documentos/publico`.
  - `interface ItemFila { url; site; profundidade; origem: string|null; prioridade; tentativas; titulo: string|null; processo: string|null; ano: number|null; data: string|null }`
  - `type NovoItem = Omit<ItemFila, 'tentativas'>`
  - `interface EstadoRastreio { paginas: Map<string, { dataVista: string; status: string; tipo: string }>; naFila: Set<string> }`
  - `carregarEstado(cf): Promise<EstadoRastreio>`: 2 consultas (todas as `paginas`, todas as URLs da `fila`).
  - `enfileirar(cf, estado, itens: NovoItem[], opts: { agora: string; forcar?: boolean }): Promise<number>`: filtra em memória (já na fila; já visto dentro da janela de revisita, salvo `forcar` ou `status = 'erro'`), grava com `inserirLinhas(..., { ignorarRepetidas: true })`, atualiza `estado.naFila`, devolve quantos entraram. Com `forcar`, um item que já está na fila tem a `prioridade` elevada (um UPDATE por item forçado; são poucos).
  - `proximos(cf, n: number, agora: string): Promise<ItemFila[]>`: `proxima_tentativa IS NULL OR <= agora`, ordem `prioridade DESC, profundidade ASC, rowid`.
  - `concluir(cf, estado, url): Promise<void>` e `adiar(cf, estado, item, agora): Promise<void>` (tentativas+1, `proxima_tentativa = agora + 2^tentativas horas`; ao chegar a 5 tentativas, remove da fila).

- [ ] **Step 1: Testes que falham**
  - `normalizarUrl('https://Coperse.furg.br/a/Homologa%c3%a7%c3%a3o.pdf#x')` = `normalizarUrl('https://coperse.furg.br/a/Homologação.pdf')` (Review Focus 5).
  - `deveIgnorar` verdadeiro para `.../index.php?format=feed&type=rss`, `...?start=20`, `.../_next/static/x.js`; falso para `.../processos-seletivos/quilombolas`.
  - `ehPdf` verdadeiro para `.../A.PDF` e `https://vestibular.furg.br/api/documentos/publico?arquivo=x`.
  - `enfileirar` com 300 itens, sendo 100 repetidos e 50 já vistos há 2 h (HTML): entram 150, com no máximo 8 chamadas ao cliente (lotes de 20 → `ceil(150/20)`), nenhuma consulta por item (Review Focus 2).
  - HTML visto há 21 h entra; PDF `ok` visto há 10 dias não entra, há 31 dias entra; página com `status 'erro'` entra; `forcar` faz entrar mesmo visto há 1 h.
  - `proximos` respeita ordem e `proxima_tentativa`; `adiar` na 5ª tentativa remove o item.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(indexacao): fila de rastreamento com revisita e lotes`

---

### Task 6: Orquestração, workflow, keepalive e documentação

**Files:**
- Modify: `worker-indexacao/src/principal.ts`, `worker-indexacao/src/feed.ts`, `config/sites.json`, `.github/workflows/indexar.yml`, `README.md`, `docs/decisoes.md`
- Test: `worker-indexacao/test/principal.test.ts`, `worker-indexacao/test/feed.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces:
  - `interface Contagem { nova; alterada; igual; vazia; erro; teto; ignorada; removida: number }`
  - `interface OpcoesExecucao { maxItens: number; prazoMs: number; sites: Site[]; regras: RegrasClassificacao; tetoVetores: number; esperar?: (ms) => Promise<void>; relogio?: () => number }`
  - `interface DepsExecucao extends DepsIndexacao { buscar: (url: string) => Promise<Resposta>; extrairPdf: (b: Uint8Array) => Promise<{ texto: string; paginas: number }> }`
  - `executar(opcoes, deps): Promise<Contagem & { teto_atingido: boolean; fila_restante: number }>`
  - variáveis de ambiente novas: `PRAZO_MINUTOS` (padrão 25), `TETO_VETORES` (padrão 6000); `LIMITE` passa a ser itens por execução (padrão 400).

**Fluxo de `executar`** (o que os testes fixam):
1. Registra a execução; `carregarEstado`; `restante = tetoVetores - contarVetores()`.
2. Semeia, por site: itens do feed (`forcar`, prioridade 10, profundidade 0, com `titulo` e `data` do feed; item fora do domínio conta erro, como hoje) e `paginas_chave` (`forcar`, prioridade 5, profundidade 0). Falha no feed: registra e segue (como hoje).
3. Laço: busca `proximos(50)`; para quando `processados >= maxItens`, quando `relogio() - inicio >= prazoMs`, quando a fila esvazia ou quando um documento devolve `'teto'` (o item fica na fila). `esperar(1000)` antes de cada requisição de rede.
4. Por item, com `titulo = item.titulo ?? ''`:
   - **PDF classificado como lista** (`ehPdf` e `ehListaDeCandidatos(titulo, url)`): não baixa; `indexarDocumento` com `tipo 'lista'`, texto `resumoDeLista`, data `item.data ?? agora`.
   - Senão, `buscar(url)`:
     - `html`: `extrairPagina`; título = `item.titulo` vindo do feed (prioridade 10) › título extraído › `item.titulo`; data = `item.data` do feed › `pagina.data` › `ultimaModificacao` › agora. Se for lista, indexa só o resumo. Depois, se `profundidade < site.profundidade`, enfileira os links do mesmo site (host permitido, não ignorados) com profundidade+1, prioridade 2 (PDF) ou 1 (HTML), `origem` = url, `titulo` = título do link, `processo`/`ano`/`data` herdados deste documento. Os links são enfileirados mesmo se a página for `igual`.
     - `pdf`: `extrairPdf`; título = `item.titulo` › nome do arquivo; data = `ultimaModificacao` › `item.data` › agora; texto vazio → `vazia`.
     - `outro`: conclui e conta `ignorada`.
   - Processo = `inferirProcesso([titulo, url], regras)` › `item.processo` › `site.processo_padrao` › `'geral'`. Ano = `inferirAno(titulo, url)` › `item.ano` › ano da data.
   - Sucesso (qualquer resultado exceto `teto`): `concluir`. Erro: `registrarErro` + `adiar`; se `ErroHttp` 404/410 e `falhas >= 3`, `removerPagina` e conta `removida`.
5. Atualiza `execucoes`; devolve a contagem com `teto_atingido` e `fila_restante` (`SELECT COUNT(*) FROM fila`).

- [ ] **Step 1: Testes que falham** (`principal.test.ts`, com fakes da Task 1 e `buscar` falso servindo um mini-site de 4 páginas e 3 PDFs):
  - rastreia o mini-site a partir de uma página-chave: todas as páginas e o PDF de edital ficam `ok`; o PDF de "Resultado Final" vira `tipo 'lista'` com 1 trecho e **nunca é pedido a `buscar`**; uma página HTML intitulada "Homologação das inscrições" vira `lista` e seus links ainda são seguidos.
  - respeita `profundidade`: com `site.profundidade = 1`, links de profundidade 2 não são buscados.
  - link fora do domínio e `.../index.php?format=feed` nunca são buscados.
  - PDF herda processo e ano da página que o linkou quando o próprio título não traz.
  - `prazoMs` estourado depois do 2º item: para, `fila_restante > 0`; uma segunda chamada a `executar` com o mesmo fake processa o resto e as páginas já `ok` não são reembedadas (Review Focus 3).
  - `tetoVetores` baixo: `teto_atingido = true`, o item fica na fila e `codigoSaida` é 0.
  - 404 três vezes seguidas na mesma página (três execuções, com `proxima_tentativa` vencida) → `removida`.
  - PDF escaneado (`extrairPdf` devolve texto vazio) → `vazia`; `buscar` lançando "maior que 15 MB" → `erro` e item adiado (Review Focus 4).
  - `lerFeed` com um documento Atom lança `Formato de feed não suportado` (antes devolvia vazio).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `executar` e `main()` (lê `config/processos.json` e `config/listas.json`; imprime o JSON do resumo como hoje).
- [ ] **Step 4: Configuração.** `sites.json`: `profundidade: 10` nos três sites; `paginas_chave` com a página inicial de cada site (`https://coperse.furg.br/`, `https://sisu3.furg.br/`, `https://vestibular.furg.br/`).
- [ ] **Step 5: Workflow `indexar.yml`.** Inputs `limite` (padrão `'400'`, "Quantos itens processar nesta execução") e `minutos` (padrão `'25'`); env `LIMITE`, `PRAZO_MINUTOS`, `TETO_VETORES: '6000'`; `timeout-minutes: 40`. Novo job:
```yaml
  workflow-keepalive:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: liskin/gh-workflow-keepalive@v1.2.1
```
- [ ] **Step 6: Documentação.** README, seção "Indexação": rastreamento pela fila, orçamento por execução, teto de vetores, regras em `config/processos.json` e `config/listas.json` (como ajustar). `docs/decisoes.md`, entradas datadas de 2026-11-12:
  - unpdf (unjs, MIT, ~1,3 mil estrelas, mantido) para PDF, por rodar em Node sem dependências nativas;
  - keepalive com `liskin/gh-workflow-keepalive` (MIT), sem commits falsos; o `gautamkrishnar/keepalive-workflow` está bloqueado no GitHub;
  - rastreamento próprio pela tabela `fila` em vez de crawler pronto (crawlee e afins exigem navegador ou são pesados para o Actions; o censo mostrou que um BFS simples alcança tudo);
  - listas de candidatos só com título, data e link (aprovado pelo Jeferson);
  - todas as edições indexadas com processo e ano (decisão b do Jeferson);
  - teto de 6000 vetores e o que fazer se for atingido (reduzir a dimensão para 384 ou aumentar os trechos; decisão do Jeferson).
- [ ] **Step 7: Rodar** `npm test` e `npm run typecheck` → PASS.
- [ ] **Step 8: Commit** — `feat(indexacao): rastreamento completo pela fila, orçamento por execução e keepalive`

---

### Task 7: Carga real e medição (controlador, com o Jeferson)

Não é tarefa de subagente: depende de merge na `main`, de disparos do workflow e do aceite.

- [ ] **Step 1:** PR, CI verde, merge. Conferir que o `publicar` aplicou a migração 0002 (`wrangler d1 migrations list chatbot-coperse --remote`).
- [ ] **Step 2:** disparar `indexar` manualmente (limite 400, 25 min) e repetir até `fila_restante = 0` ou `teto_atingido`. Anotar os resumos.
- [ ] **Step 3: Medir** no D1: páginas por `site`, `tipo` e `status`; total de trechos; `contarVetores()`; páginas por `processo` e `ano`; lista das `erro`.
- [ ] **Step 4: Conferir as listas:** amostra de 10 documentos `tipo 'lista'` (só o resumo gravado em `trechos`); amostra de 10 PDFs `pdf` com título contendo nomes de processo, lidos por cima para ver se algum é lista que escapou. Ajustar `config/listas.json` se necessário (PR próprio).
- [ ] **Step 5:** se o teto for atingido, levar ao Jeferson a escolha (384 dimensões, trechos maiores ou plano pago) com os números medidos.
- [ ] **Step 6:** registrar o resultado em `docs/decisoes.md` e pedir o aceite da etapa 4.
