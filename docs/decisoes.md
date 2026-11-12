# Registro de decisões

Cada entrada tem data e motivo. Fonte dos fatos: documento de projeto de 2026-11-12 (seções 3, 4 e 8).

## 2026-11-12 — Base de código: rootsongjc/rag-chatbot

Adaptar o rootsongjc/rag-chatbot (Apache-2.0, TypeScript, Workers + Vectorize + Gemini). Aproveita-se cerca de um terço: provedores, divisão em trechos, prompt e testes. Indexador, CORS e busca por palavras-chave (D1 FTS5) são código novo. Motivo: segue as decisões do briefing e dá controle sobre data, recência e citação. Descartados: sitechat e awais1221/ai-rag-chatbot (Python, não rodam em Workers).

## 2026-11-12 — Cloudflare AI Search descartado

Descartado porque usa embeddings do Cloudflare (não Gemini), dá menos controle de recência e o rastreador só cobre domínios cadastrados na mesma conta Cloudflare.

## 2026-11-12 — Indexação no GitHub Actions (muda o briefing)

A indexação roda em GitHub Actions agendado, gravando no Vectorize e no D1 pela API do Cloudflare. Motivo: o plano gratuito do Workers dá 10 ms de CPU por execução, inclusive cron, o que não comporta extração de PDF; o plano pago foi descartado porque o Jeferson não paga. Contras aceitos: atraso de alguns minutos no agendamento e desligamento após 60 dias sem atividade no repositório (mitigado com commit mensal e alerta em `/saude`).

## 2026-11-12 — Repositório público (muda o briefing)

Repositório público `icqjef/chatbot-coperse`, em vez de privado. Motivo: minutos do Actions ilimitados e proteção do ramo principal gratuita (no plano Free, só repositórios públicos têm). Nenhum segredo fica no código. Revisar se a COPERSE ou o CGTI tiverem regra contra código público.

## 2026-11-12 — Cloudflare no plano gratuito, limites conferidos

Limites oficiais conferidos em 2026-11-12 (developers.cloudflare.com/workers/platform/limits): 10 ms de CPU por execução; 50 subrequisições externas por execução; 100 mil requisições por dia. D1 gratuito: 5 milhões de linhas lidas por dia, 100 mil escritas por dia, 5 GB. Vectorize gratuito: 5 milhões de dimensões armazenadas, 30 milhões consultadas por mês. Custo de Cloudflare e GitHub: US$ 0. Domínio do Worker: `*.workers.dev`, porque domínio em furg.br exigiria DNS do CGTI.

## 2026-11-12 — Gemini pelos créditos da assinatura Google AI Pro

O Jeferson assina o Google AI Pro, que inclui US$ 10 por mês em créditos do Google Cloud utilizáveis na API do Gemini, após ativação única vinculando uma conta de cobrança (ai.google.dev/gemini-api/docs/google-ai-plans). A assinatura não dá chave de API: a chave é criada no AI Studio. Há relato não oficial de que, em conta pré-paga, os créditos só valem após compra de saldo; conferir na configuração. A estimativa de custo com preços oficiais será registrada aqui antes da publicação. Provedor trocável por variável de ambiente.

## 2026-11-12 — Escopo de conteúdo

Por informação do Jeferson, a COPERSE só publica editais de processos seletivos de ingresso de estudantes e do vestibular. Tudo o que os três sites publicam está no escopo; perguntas sobre outros assuntos são recusadas com educação.

## 2026-11-12 — Registro de perguntas desligado

O registro de perguntas fica desligado até decisão da COPERSE. O código fica pronto atrás de `REGISTRAR_PERGUNTAS=false`: pergunta mascarada (CPF, e-mail, telefone), sem IP nem identificador, apagada após 90 dias.

## 2026-11-12 — Recursos criados no Cloudflare

Conta Cloudflare do Jeferson, Account ID `6d7caf21114ed3ab1289f93cf901a859` (identificador público, não é segredo).

- Banco D1 `chatbot-coperse`, `database_id` `3cbc9b2c-dc1d-430b-95fe-edce33927d3d`.
- Índice Vectorize `chatbot-coperse`, 768 dimensões, métrica cosseno.
- Índices de metadado solicitados antes de qualquer inserção: `site` (string), `processo` (string), `ano` (number).

## 2026-11-12 — Endereço do Worker

Subdomínio `workers.dev` da conta: `coperse-furg` (escolhido pelo Jeferson). Endereço do Worker: `https://chatbot-coperse.coperse-furg.workers.dev`. É este endereço que vai no `<script>` colado nos sites e no aviso ao CGTI; trocá-lo depois exige recolar o script em todos os sites.

Publicação automática: o GitHub Actions usa o secret `CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts, D1 e Vectorize, todas Edit, restritas à conta) e a variável `CLOUDFLARE_ACCOUNT_ID`. Ramo `main` protegido: só por pull request, com o teste `testes` passando, valendo também para administradores.

## 2026-11-12 — Teste de colagem no sisu3: aprovado (risco R1 resolvido)

O sisu3 roda **Joomla 3** (tema "pip"). Um `<script src=...>` colado num módulo HTML personalizado, com o editor alternado para código cru e na mesma posição do módulo do rodapé, chega às páginas e executa; o selo de teste apareceu no computador e no celular. O filtro de texto do grupo do Jeferson não remove `<script>`. Conclusão: o caminho "colar um script" funciona sem plugin, sem acesso ao código e sem ação do CGTI. Não há cabeçalho Content-Security-Policy no sisu3. O coperse ainda não foi testado; o vestibular (Next.js) depende do administrador do site.

## 2026-11-12 — Claude no lugar do Gemini: avaliado e adiado

O Jeferson perguntou se a assinatura Claude Pro poderia substituir o Gemini. Não pode: a assinatura não inclui a API, que é cobrada à parte no Claude Console (support.claude.com/en/articles/9876003), e a Anthropic não oferece modelo de embeddings (docs.anthropic.com/en/docs/build-with-claude/embeddings). Usar o Claude só para as respostas exigiria uma segunda conta paga. Decisão: seguir só com o Gemini. Se na etapa 7 as respostas não atingirem o portão de qualidade, comparar com o Claude Haiku nas mesmas perguntas de referência; a troca é por variável de ambiente.

## 2026-11-12 — Embeddings: Gemini `gemini-embedding-001`, 768 dimensões

Conferido na documentação oficial (https://aistudio.google.com/api-reference/embeddings; ai.google.dev redireciona para lá): endpoint `POST https://generativelanguage.googleapis.com/v1beta/models/{modelo}:batchEmbedContents`; corpo `{ requests: [{ model: "models/{modelo}", content: { parts: [{ text }] }, taskType, outputDimensionality }] }`; resposta `{ embeddings: [{ values: [...] }] }`. Modelo padrão `gemini-embedding-001` (trocável por `MODELO_EMBEDDING`), `outputDimensionality` 768 para casar com o índice Vectorize (`DIMENSAO_EMBEDDING`). Para dimensões diferentes de 3072 o vetor não vem normalizado; por isso `criarEmbedder` normaliza cada vetor para norma 1 (cosseno consistente). Documentos usam `taskType` `RETRIEVAL_DOCUMENT` e perguntas `RETRIEVAL_QUERY`. A chave vai no header `x-goog-api-key`, nunca na URL; lotes de até 100 textos. Obs.: a doc indica que `outputDimensionality` pode migrar para um bloco de configuração nos SDKs; usamos o campo REST por requisição.

Atualização (mesmo dia): existe o `gemini-embedding-2` (mais novo, multimodal, sem `taskType`, já normaliza), mas o `gemini-embedding-001` segue Estável para texto; mantemos o 001 porque aceita `taskType`. A documentação é ambígua sobre `outputDimensionality`/`taskType` irem no topo de cada requisição ou dentro de `embedContentConfig`; mantemos o formato no topo. Se a API ignorasse o campo, devolveria vetores de 3072 dimensões; por isso `criarEmbedder` confere o número de vetores e a dimensão de cada um (e valida `DIMENSAO_EMBEDDING`) e falha antes de gravar no índice de 768. O formato será confirmado na primeira execução real (Task 11).

## 2026-11-12 — Prova real do indexador: aprovada

Workflow `indexar` disparado manualmente com `limite=5` (execução 43269595972). Como coperse e sisu3 têm feed, foram lidos os 5 itens mais recentes do coperse e os 3 que o feed do sisu3 traz: `nova: 8, erro: 0`. Conferido em produção:

- D1: 8 páginas com status `ok`, títulos e datas iguais aos dos feeds (datas em ISO, `ano` 2026); 8 trechos (notícias curtas cabem num trecho cada) e 8 linhas na busca de texto; a busca `inscricao OR inscricoes` sem acento encontra 4.
- Vectorize: 8 vetores de 768 dimensões, com metadados `site`, `url`, `titulo`, `data`, `processo`, `ano` (número). As gravações do Vectorize levaram cerca de 1 minuto para aparecer na contagem.
- Gemini: o formato do corpo com `taskType` e `outputDimensionality` no topo de cada requisição funcionou (a trava de dimensão não disparou), confirmando a dúvida registrada na entrada sobre embeddings.
- Segunda execução com `limite=5`: `igual: 8`, nada regravado.

A indexação agendada a cada 2 horas está ativa desde o merge.

## 2026-11-12 — Leitura de PDF: unpdf

PDFs dos editais são lidos com o `unpdf` (unjs/unpdf, licença MIT, cerca de 1,3 mil estrelas, mantido: último envio em 2026-11-11, versão 2.1.0). Motivo: roda em Node puro, sem dependências nativas, o que funciona no GitHub Actions sem instalar nada no sistema. PDF escaneado (sem camada de texto) fica com status `vazia`; não há OCR. Arquivos acima de 15 MB não são baixados e ficam como erro.

## 2026-11-12 — Keepalive do agendamento: liskin/gh-workflow-keepalive

O GitHub desliga workflows agendados de repositórios sem atividade por 60 dias. Usamos a ação `liskin/gh-workflow-keepalive@v1.2.1` (MIT) num job à parte do `indexar.yml`, só nas execuções agendadas. Ela reativa o workflow pela API, sem commits falsos no repositório; precisa apenas da permissão `actions: write` nesse job. Substitui a ideia de "commit mensal" da entrada sobre o GitHub Actions. O `gautamkrishnar/keepalive-workflow`, mais conhecido, foi descartado porque está bloqueado no GitHub.

## 2026-11-12 — Rastreamento próprio pela tabela `fila`

Os três sites são rastreados por código próprio: uma fila no D1 (`fila`), semeada pelos feeds RSS e pelas páginas-chave de `config/sites.json`, seguindo links do mesmo domínio até a profundidade configurada (10), com revisita de HTML após 20 horas e de PDF após 30 dias. Cada execução tem orçamento de itens (`LIMITE`, padrão 400) e de tempo (`PRAZO_MINUTOS`, padrão 25); o que sobra fica na fila para a próxima, a cada 2 horas. Motivo: crawlers prontos (crawlee e afins) exigem navegador ou são pesados para o Actions, e o censo dos sites mostrou que uma busca em largura simples sobre o HTML alcança todas as páginas e PDFs. Falhas são adiadas com espera crescente; uma página só é removida do índice depois de três respostas 404/410 seguidas.

## 2026-11-12 — Listas de candidatos: só título, data e link

Documentos com listas nominais (resultados, homologações, chamadas, notas, locais de prova etc., pelas regras de `config/listas.json`) não têm o conteúdo indexado: o bot guarda só título, data e link, num resumo que orienta o candidato a abrir o documento. PDF reconhecido como lista nem é baixado; página HTML reconhecida como lista é lida apenas para seguir os links. Aprovado pelo Jeferson. Motivo: privacidade dos candidatos e o bot não deve opinar sobre situação individual.

## 2026-11-12 — Todas as edições indexadas, com processo e ano

Edições antigas dos processos seletivos também são indexadas, cada trecho marcado com `processo` e `ano` (decisão b do Jeferson). Processo e ano saem do título e do caminho da URL (nunca do domínio: `sisu3.furg.br` não deve marcar tudo como SiSU), pelas regras de `config/processos.json`; um PDF sem essa informação herda processo e ano da página que o linkou; na falta, vale o processo padrão do site e o ano da data. Motivo: a busca pode filtrar ou priorizar a edição em andamento sem perder o histórico.

## 2026-11-12 — Teto de 6000 vetores

A indexação para quando o índice chega a 6000 vetores (`TETO_VETORES`): a contagem é refeita no início de cada execução, o documento que estouraria o teto fica na fila e o resumo da execução mostra `teto_atingido: true` (a execução não falha). Motivo: manter o Vectorize dentro do plano gratuito com folga. Se o teto for atingido, a decisão é do Jeferson entre reduzir a dimensão dos vetores para 384 (exige recriar o índice e reindexar) ou aumentar o tamanho dos trechos (menos vetores por documento).
