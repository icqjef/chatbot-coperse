# Chatbot COPERSE — documento de projeto

Data: 2026-11-12 · Responsável: Jeferson (COPERSE/FURG) · Status: aguardando aprovação

Fonte das regras de negócio: `CLAUDE.md` (briefing). Este documento registra como o sistema será construído. Onde ele muda o briefing, a mudança está marcada **[muda o briefing]** e foi decidida pelo Jeferson nesta data.

## 1. Intenção

Candidatos de processos seletivos da FURG fazem as mesmas perguntas repetidamente (datas, vagas, documentos, prazos). A informação já está publicada em coperse.furg.br, vestibular.furg.br e sisu3.furg.br, mas espalhada em notícias e PDFs de editais. O chatbot responde a partir desse conteúdo, sempre citando a página de origem, e se mantém atualizado sozinho.

Sucesso: o candidato acha a resposta certa com a fonte em segundos; a COPERSE não precisa alimentar o bot manualmente; nenhuma resposta sobre data, vaga ou prazo sai errada; custo de hospedagem zero.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Responder em português do Brasil, só com base em trechos recuperados, com citação (título, endereço, data, edição).
- Indexar automaticamente publicações novas dos três sites, incluindo PDFs de editais.
- Funcionar como um único `<script>` colado em módulo HTML personalizado do Joomla (e no site do vestibular).
- Cloudflare e GitHub no plano gratuito; Gemini pago com os créditos da assinatura do Jeferson.

**Escopo de conteúdo** (Jeferson, 2026-11-12): a COPERSE só publica editais de processos seletivos de ingresso de estudantes e do vestibular. Tudo o que os três sites publicam está no escopo; perguntas sobre outros assuntos são recusadas com educação.

**Não-objetivos (por ora)**
- Responder sobre situação individual (homologação, nota, recurso).
- Login, histórico por usuário, integração com sistema de inscrição.
- OCR de PDF escaneado. Outros idiomas.

**Anti-objetivos (falha mesmo que "funcione")**
- Inventar data, vaga, prazo, link ou citação.
- Responder com dados de uma edição passada como se fossem da atual.
- Coletar ou guardar dado pessoal (CPF, nome, IP em claro).
- Exigir mudança no Joomla além de colar o script, ou ação do CGTI além de ser avisado.
- Depender da máquina do Jeferson.

## 3. Restrições

- Joomla: Jeferson é Administrator, sem acesso a código nem a plugins. Só cola script.
- vestibular.furg.br: outro administrador. Verificado em 2026-11-12: é um site **Next.js/React**, não Joomla; PDFs servidos por `/api/documentos/publico?arquivo=...`; feed não funciona.
- Cloudflare **gratuito** (Jeferson não paga). Limites oficiais conferidos em 2026-11-12 (developers.cloudflare.com/workers/platform/limits): 10 ms de CPU por execução, inclusive cron; 50 subrequisições externas por execução; 100 mil requisições/dia. D1 gratuito: 5 milhões de linhas lidas/dia, 100 mil escritas/dia, 5 GB. Vectorize gratuito: 5 milhões de dimensões armazenadas, 30 milhões consultadas/mês.
- Gemini: Jeferson assina Google AI Pro, que inclui US$ 10/mês em créditos do Google Cloud utilizáveis na API do Gemini, após ativação única vinculando a uma conta de cobrança (ai.google.dev/gemini-api/docs/google-ai-plans). A assinatura não dá chave de API; a chave é criada no AI Studio. Relato não oficial: em conta pré-paga os créditos só valem após compra de saldo — conferir na configuração.
- Domínio do Worker: `*.workers.dev` (domínio em furg.br exigiria DNS do CGTI).
- `https://coperse.furg.br` (o `www.` não responde por HTTPS).
- Feeds confirmados em 2026-11-12: `coperse.furg.br/index.php?format=feed&type=rss` e `sisu3.furg.br/index.php?format=feed&type=rss`.

## 4. Abordagens consideradas

### 4.1 Base de código

| | Abordagem | Prós | Contras | Decisão |
|---|---|---|---|---|
| A | Adaptar **rootsongjc/rag-chatbot** (Apache-2.0, TypeScript, Workers + Vectorize + Gemini); indexador próprio; busca híbrida Vectorize + D1 FTS5 | Segue as decisões do briefing; controle total sobre data, recência e citação | Reaproveita ~1/3 (provedores, trechos, prompt, testes); indexação, CORS e busca por palavras são novas | **Escolhida** |
| B | Indexador grava páginas no R2; Cloudflare AI Search faz trechos, embeddings e busca | Menos código | Embeddings do Cloudflare, não Gemini; menos controle de recência | Descartada |
| C | raksbisht/sitechat, awais1221/ai-rag-chatbot | Prontos | Python; não rodam em Workers | Descartada |

O rastreador do AI Search também foi descartado: só rastreia domínios cadastrados na mesma conta Cloudflare.

### 4.2 Onde roda a indexação **[muda o briefing]**

| | Abordagem | Contras | Decisão |
|---|---|---|---|
| 1 | **GitHub Actions agendado** (Node, sem limite apertado de CPU) grava no Vectorize e D1 pela API do Cloudflare | Agendamento do Actions pode atrasar alguns minutos; desliga após 60 dias sem atividade no repositório (mitigado, ver 5.4) | **Escolhida** |
| 2 | Worker cron gratuito, uma página por execução | 10 ms de CPU não comportam extração de PDF | Descartada |
| 3 | Worker cron no plano pago | Exige pagamento | Descartada |

### 4.3 Repositório **[muda o briefing]**

Repositório **público** (`icqjef/chatbot-coperse`) em vez de privado: minutos do Actions ilimitados e proteção do ramo principal gratuita (no plano Free, só repositórios públicos têm proteção de ramo). Nenhum segredo fica no código. Se a COPERSE ou o CGTI tiverem regra contra código público, revisar esta decisão.

## 5. Arquitetura

```
 coperse / sisu3 / vestibular  (páginas, feeds, PDFs)
            │
            │  GitHub Actions, a cada 2 h (+ disparo manual)
            ▼
 ┌──────────────────────────┐     ┌───────────────┐
 │ worker-indexacao (Node)  │────▶│ Gemini embed  │
 │ fila, extração, trechos  │     └───────────────┘
 └──────────────────────────┘
            │ API REST do Cloudflare
            ▼
 ┌───────────────────────────┐
 │ Vectorize (significado)    │
 │ D1: páginas, trechos, FTS5 │
 └───────────────────────────┘
            ▲
            │ bindings
 ┌──────────────────────────┐     ┌──────────────┐
 │ worker-resposta (CF free)│────▶│ Gemini Flash │
 │ origem, limite, busca,   │     └──────────────┘
 │ prompt, /widget.js       │
 └──────────────────────────┘
            ▲  POST /perguntar
 widget.js colado no Joomla / vestibular
```

### 5.1 Repositório

`github.com/icqjef/chatbot-coperse`, público, local em `C:\dev\chatbot-coperse`. TypeScript, npm workspaces. Ramo `main` protegido: só por pull request, com testes passando. Jeferson dá o aceite **no fim de cada etapa** (seção 6), não em cada pull request.

```
worker-indexacao/   indexador (Node, roda no GitHub Actions); nome mantido do briefing
worker-resposta/    Worker Cloudflare: /perguntar, /widget.js, /saude, /reindexar
widget/             fonte do widget (gera um único .js)
comum/              provedores (LLM, embeddings), tipos, divisão em trechos   ← chamada do construtor
config/             sites.json, origens.json
avaliacao/          perguntas de referência + executor
docs/               README, instalação, operação, decisoes.md, aviso ao CGTI, specs
.github/workflows/  testes, publicação do Worker, indexação agendada
```

### 5.2 Configuração (`config/sites.json`)

Lista de sites, nunca endereços fixos no código. Cada site: `id`, `nome`, `base`, `feed` (opcional), `paginas_chave`, `profundidade` (padrão 2), `dominios_permitidos`. Trocar sisu3 por sisu = editar este arquivo. `config/origens.json` lista as origens aceitas pelo worker-resposta (três domínios, com e sem `www`; `localhost` só em desenvolvimento).

### 5.3 Armazenamento

- **Vectorize**: um índice, cosseno, 768 dimensões (Gemini permite reduzir a dimensão). Metadados por vetor: `site`, `url`, `titulo`, `data` (ISO), `processo`, `ano`, `trecho_id`. Índices de metadado criados **antes** da primeira inserção: `site`, `processo`, `ano`.
- **D1**:
  - `paginas(url PK, site, titulo, tipo html|pdf, processo, ano, data_publicacao, data_vista, hash, status, falhas, erro)`
  - `trechos(id PK, url, ordem, texto)` + tabela virtual FTS5 `trechos_fts` (com remoção de acentos)
  - `fila(url PK, site, profundidade, origem, prioridade, tentativas, proxima_tentativa)`
  - `execucoes(id, inicio, fim, paginas, erros)` — usado por `/saude`
- Estimativa de volume (a confirmar na carga inicial): alguns milhares de trechos × 768 = poucos milhões de dimensões, dentro dos 5 milhões gratuitos. Se passar, reduzir dimensão ou excluir edições antigas.

### 5.4 Indexação (worker-indexacao, no GitHub Actions)

Workflow agendado a cada 2 horas (chamada do construtor) + disparo manual (botão "Run workflow" no GitHub ou `POST /reindexar` no worker-resposta, ver 5.5). Escreve no Vectorize e no D1 pela API REST do Cloudflare com um token de escopo mínimo (Vectorize e D1 de escrita) guardado como segredo do GitHub. Uma tarefa mensal faz um commit automático de manutenção para o GitHub não desligar o agendamento após 60 dias.

Estado (fila, hashes) fica no D1, então cada execução continua de onde a anterior parou.

Cada execução:
1. **Descoberta**: lê o RSS dos sites com feed; item novo ou alterado (`guid`/`pubDate`) entra na fila com prioridade alta. As `paginas_chave` entram na fila uma vez por dia. Links do mesmo domínio são enfileirados até `profundidade`.
2. **Processamento** da fila com teto de tempo por execução (ex.: 20 min) e pausa entre requisições a cada site (educado com os servidores da FURG).
3. **Extração**: HTML → texto principal (sem menu, rodapé, scripts; tabelas como texto). Joomla: corpo do artigo. Next.js do vestibular: HTML renderizado no servidor ou dados embutidos na página; o construtor verifica na etapa 4 (risco R2). PDFs linkados nas páginas indexadas (inclusive `/api/documentos/publico?...`) entram na fila como `pdf`; texto extraído com biblioteca Node (ex.: `unpdf`/pdf.js). PDF sem texto é registrado como erro.
4. **Data**: `pubDate` do feed > data no HTML > `Last-Modified` > primeira visita.
5. **Processo e ano**: inferidos de título, URL e texto (ex.: "Vestibular 2027", "SiSU 2026", "PS Específico ... Transgêneros"), por regras configuráveis em `config/`. Sem inferência segura → `processo = "geral"`, `ano` = ano da data. PDF herda processo/ano da página que o linkou quando não tiver os próprios.
6. **Mudança**: hash do texto igual → nada a fazer. Diferente → apaga trechos antigos (Vectorize + D1) e regrava.
7. **Trechos**: ~800 tokens, sobreposição ~100, respeitando títulos; cada trecho prefixado com título, processo/ano e data.
8. **Embeddings** Gemini em lote (`RETRIEVAL_DOCUMENT`); upsert no Vectorize e D1.
9. Página com 404 em 3 execuções seguidas é removida do índice.

**Carga inicial**: `paginas_chave` (Vestibular, SiSU, editais em andamento — lista preenchida com o Jeferson na etapa 3) + itens atuais dos feeds.

### 5.5 Resposta (worker-resposta, Cloudflare gratuito)

Orçamento: 10 ms de CPU por chamada. Quase todo o trabalho é espera de rede (Gemini, Vectorize, D1), que não conta. Nada de processamento pesado neste Worker; medir CPU nos testes de carga.

`POST /perguntar` com `{ pergunta, historico? }` (até 4 trocas, guardadas só no navegador).

1. **Origem**: só aceita `Origin` de `origens.json`; CORS devolve a origem exata, nunca `*`.
2. **Limite de uso**: binding de Rate Limiting do Workers, por visitante (chave = hash do IP com sal diário; IP nunca guardado), ex.: 6 perguntas/minuto. Pergunta até 500 caracteres. (Construtor confirma que o binding está no plano gratuito; senão, contador no D1 com a mesma chave.)
3. **Busca híbrida**: embedding da pergunta (`RETRIEVAL_QUERY`) → Vectorize top 20; FTS5 top 20; fusão por posição (reciprocal rank fusion); bônus de recência; bônus para o ano corrente do processo; top ~6 trechos.
4. **Sem base**: nenhum trecho acima do limiar → mensagem fixa (edital oficial ou coperse@furg.br), **sem chamar o modelo**.
5. **Prompt**: regras do briefing (só trechos; sem situação individual; recusa fora do tema; não pedir dados pessoais; conflito → prevalece o mais recente e informa a data). Trechos numerados com título, site, processo/ano e data. **Edições**: responder com a edição mais recente do processo perguntado e dizer qual é ("No Vestibular 2027..."); se só houver informação de edição passada, dizer isso e não apresentá-la como atual.
6. **Fontes**: montadas pelo código a partir dos trechos citados (`[1]`), nunca de endereços escritos pelo modelo. Número inexistente é removido.
7. Resposta: `{ resposta, fontes: [{ titulo, url, site, data }] }`.

Outras rotas: `GET /widget.js`, `GET /saude` (última indexação, tamanho da fila), `POST /reindexar` (senha longa em `REINDEX_TOKEN`, comparação em tempo constante; dispara o workflow do GitHub via API com token de escopo mínimo guardado como segredo do Cloudflare).

### 5.6 Widget

- Um `<script src="https://<worker>.workers.dev/widget.js" defer></script>` no módulo HTML personalizado. Servido pelo Worker, o widget é atualizado sem mexer no Joomla.
- JavaScript puro, Shadow DOM (isolado do CSS do Joomla), alvo < 15 KB.
- Botão flutuante no canto inferior direito → painel. Acessível: ARIA, teclado, foco gerenciado, `aria-live`, contraste AA, tela cheia no celular.
- Aviso fixo: "Não digite CPF, nome ou outros dados pessoais." Fontes como links com data.
- Aparência definida com o Jeferson na etapa 6, com maquete.

### 5.7 Registro de perguntas

**Desligado** até decisão da COPERSE. O construtor deixa pronto atrás de uma variável (`REGISTRAR_PERGUNTAS=false`): pergunta mascarada (CPF, e-mail, telefone → `[removido]`), data/hora, se houve resposta com base, URLs usadas; sem IP nem identificador; apagado após 90 dias.

### 5.8 Segurança e operação

- Segredos do Cloudflare (`wrangler secret`): `GEMINI_API_KEY`, `REINDEX_TOKEN`, token do GitHub para disparar o workflow.
- Segredos do GitHub Actions: token do Cloudflare (publicação + escrita no Vectorize/D1), `GEMINI_API_KEY` para o indexador. Nunca no código. Repositório público: logs do Actions não podem imprimir segredos nem conteúdo sensível.
- Provedor trocável: `PROVEDOR_LLM`, `MODELO_RESPOSTA`, `MODELO_EMBEDDING`, `DIMENSAO_EMBEDDING`. Nomes dos modelos conferidos na doc oficial na construção.
- Gemini: ativar créditos da assinatura, cobrança com teto mensal e alerta de orçamento no Google Cloud.
- Monitoramento: observabilidade do Workers; `/saude`; falha do workflow de indexação gera e-mail do GitHub para o Jeferson.
- Aviso ao CGTI: texto pronto em `docs/` com o domínio do Worker e o que o script faz.

### 5.9 Qualidade

- Vitest; Worker testado com `@cloudflare/vitest-pool-workers`; GitHub Actions a cada pull request.
- `avaliacao/perguntas.json`: 30 perguntas de referência (resposta esperada, fatos obrigatórios, URL de origem, categoria) dos editais em andamento, conferidas pelo Jeferson. Inclui perguntas-armadilha sobre edição passada, fora do tema e situação individual. Executor chama o Worker publicado.
- **Portão**: categoria datas/vagas/prazos com 100% antes de colar o script nos sites.
- Teste de carga leve, medindo CPU por chamada.

## 6. Etapas (cada uma termina com aceite do Jeferson)

1. Repositório público, estrutura, `decisoes.md`, CI, proteção do ramo.
2. Teste de colagem: script mínimo num módulo HTML do sisu3 (risco R1). Em paralelo, Jeferson cria a chave do Gemini e ativa os créditos.
3. Indexador com feed do coperse, testado com 5 notícias reais; workflow agendado.
4. Páginas-chave, seguimento de links, PDFs, vestibular, processo/ano.
5. Worker de resposta + regras.
6. Widget (com maquete).
7. 30 perguntas de referência; portão de qualidade.
8. Segurança, documentação, aviso ao CGTI, publicação nos sites.

## 7. Riscos

- **R1** Editor (TinyMCE) ou filtro do grupo Administrator remove `<script>`. Mitigação: editor "Nenhum"/CodeMirror no módulo; se o filtro bloquear, precisa de um Super User — descobrir na etapa 2.
- **R2** vestibular.furg.br pode entregar conteúdo só via JavaScript. Mitigação: dados embutidos ou rotas que o próprio site já serve; pedir lista de páginas ao administrador.
- **R3** CPU do worker-resposta passar de 10 ms (ex.: JSON grande). Mitigação: respostas enxutas, medir; topK menor.
- **R4** Limites do Gemini na carga inicial. Mitigação: fila retomável, lotes, pausa.
- **R5** Inferência errada de processo/ano → resposta de edição errada. Mitigação: regras testadas e perguntas-armadilha no portão.
- **R6** Agendamento do GitHub desligado por inatividade. Mitigação: commit mensal automático + alerta via `/saude`.

## 8. Custos

- Cloudflare: US$ 0 (plano gratuito; ver limites na seção 3).
- GitHub: US$ 0 (repositório público).
- Gemini: coberto pelos US$ 10/mês de créditos da assinatura do Jeferson, se o volume couber. Estimativa com preços oficiais em `decisoes.md` antes da publicação.

## 9. Chamadas do construtor (para o Jeferson conferir)

- Pasta `comum/` além das previstas no briefing.
- Indexação a cada 2 h; 768 dimensões; trechos de ~800 tokens.
- Processo/ano inferidos por regras configuráveis.
- Disparo manual pelo `/reindexar` repassado ao GitHub.
- Commit mensal automático de manutenção.

## 10. Deixado para o construtor

Limiares de relevância e pesos de recência (calibrar com as perguntas de referência), biblioteca de extração de HTML, teto de tempo por execução, nomes de tabelas e rotas internas.
