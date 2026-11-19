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

Documentos com listas nominais (resultados, homologações, chamadas, notas, locais de prova etc., pelas regras de `config/listas.json`) não têm o conteúdo indexado: o bot guarda só título, data e link, num resumo que orienta o candidato a abrir o documento. PDF reconhecido como lista nem é baixado; página HTML reconhecida como lista é lida apenas para seguir os links. Exceção inevitável: um PDF servido por endereço que não parece PDF (sem `.pdf`) só é reconhecido depois de baixado; mesmo assim, se o título ou o nome do arquivo o marcarem como lista, o conteúdo nunca é lido nem indexado. Aprovado pelo Jeferson. Motivo: privacidade dos candidatos e o bot não deve opinar sobre situação individual.

## 2026-11-12 — Todas as edições indexadas, com processo e ano

Edições antigas dos processos seletivos também são indexadas, cada trecho marcado com `processo` e `ano` (decisão b do Jeferson). Processo e ano saem do título e do caminho da URL (nunca do domínio: `sisu3.furg.br` não deve marcar tudo como SiSU), pelas regras de `config/processos.json`; um PDF sem essa informação herda processo e ano da página que o linkou; na falta, vale o processo padrão do site e o ano da data. Motivo: a busca pode filtrar ou priorizar a edição em andamento sem perder o histórico.

## 2026-11-12 — Teto de 6000 vetores

A indexação para quando o índice chega a 6000 vetores (`TETO_VETORES`): a contagem é refeita no início de cada execução, o documento que estouraria o teto fica na fila e o resumo da execução mostra `teto_atingido: true` (a execução não falha). Motivo: manter o Vectorize dentro do plano gratuito com folga. Se o teto for atingido, a decisão é do Jeferson entre reduzir a dimensão dos vetores para 384 (exige recriar o índice e reindexar) ou aumentar o tamanho dos trechos (menos vetores por documento).

Complemento (revisão final da etapa 4): ao atingir o teto a execução para por inteiro (`break`), não só o documento que estouraria. Com isso as revisitas e as retificações de páginas já indexadas também ficam paradas até o Jeferson decidir entre vetores de 384 dimensões, trechos maiores ou o plano pago do Vectorize. O aviso no log da execução (`teto_atingido: true`) é o sinal para essa decisão.

## 2026-11-12 — Ajustes da revisão final da etapa 4

- Links seguidos a partir de uma página classificada como lista entram na fila sem título: numa lista, o texto do link costuma ser o nome de uma pessoa. O PDF filho fica com o título tirado do nome do arquivo e a página filha com o próprio `<title>`. Motivo: nenhum nome pode chegar a `paginas.titulo`, aos trechos ou aos metadados do Vectorize.
- Data das listas: PDF de lista não é baixado, então a data vem do feed ou de um pedido HEAD (`Last-Modified`), com a mesma pausa de 1 s e o mesmo User-Agent. Sem nenhum dos dois, a data é tratada como desconhecida: o resumo omite a frase "Documento publicado em ..." e `data_publicacao` guarda a data herdada só para ordenar. O "agora" nunca entra no texto do resumo, para o hash não mudar a cada revisita.
- O hash de cada página passa a ser `JSON.stringify([tipo, processo, ano, titulo, texto])`, não só o texto. Assim uma mudança nas regras de `config/` ou no título reindexa a página uma vez. Efeito conhecido: a primeira execução depois desta mudança refaz uma vez os embeddings das 8 páginas indexadas na etapa 3 (custo desprezível).
- Erro permanente: uma URL que falhou 5 vezes seguidas sai da fila e só volta depois de 30 dias (janela dos PDFs), em vez de voltar a cada revisita da página que a linka. Na mesma execução ela também não volta.
- Endereços `/api/documentos/publico?arquivo=...` do vestibular: o nome do arquivo (para o título e para reconhecer listas) vem do parâmetro `arquivo`.
- Novos padrões em `config/listas.json`: "inscritos", "nominal" e "ensalamento". "relacao" ficou de fora porque esconderia páginas úteis como "Relação de cursos e vagas".
- PDF linkado por uma página lista também é tratado como lista (não é baixado e fica só o resumo), mesmo com título e nome de arquivo neutros. A marca vai na nova coluna `fila.lista` (migração 0003). Ela não podia sair da coluna `origem`, que guarda só a primeira página que linkou a URL. A marca vale também para item já na fila por outra página. Um PDF já indexado com conteúdo volta à fila para virar resumo assim que uma lista o linka. Páginas HTML linkadas por lista não são forçadas, porque costumam ser navegação.
- Limite conhecido: um PDF linkado por uma página neutra e também por uma lista pode ser indexado com o conteúdo, se for processado antes da primeira visita à página lista. Quando a lista é visitada, o PDF volta à fila e passa a ficar só com o resumo (reabertura). Na mesma execução, a marca de lista também vale em memória para o item que já estava carregado no lote.

## 2026-11-12 — Correção das regras de listas após a primeira carga real

A primeira carga indexou com nomes de candidatos dois PDFs de locais de prova (`locais_prova_SVP.pdf`, `locais_prova_SLS.pdf`): o padrão exigia "locais de prova". Também passou o "Edital de Convocação dos Aprovados", porque a exceção "começa com Edital" vencia "aprovados". Correção: padrão `loca(l|is) (de )?provas?`; exceções reduzidas a "gabarito" (edital de homologação ou de convocação traz nomes); texto de link "Baixar" passa a ser genérico (vale o texto do bloco ou o nome do arquivo). Os documentos afetados são removidos do índice e voltam como resumo. O bot ainda não respondia perguntas, então nada foi exposto.

## 2026-11-12 — Worker de resposta: modelo, limite e limiar

- Modelo de resposta `gemini-3.5-flash-lite`, trocável pela variável `MODELO_RESPOSTA`. Preço: US$ 0,30 por 1 milhão de tokens de entrada e US$ 2,50 por 1 milhão de saída (ai.google.dev/gemini-api/docs/pricing, conferido em 2026-11-12). Estimativa por pergunta: cerca de 5 mil tokens de entrada e 600 de saída, ou seja, cerca de US$ 0,003; US$ 10 pagam cerca de 3 mil perguntas.
- Limite de perguntas por visitante com o binding de Rate Limiting do Cloudflare (substituído em 2026-11-13 por um Durable Object, ver abaixo). A chave é o hash de IP mais data, sem guardar o IP; `/reindexar` usa a mesma chave.
- Limiar de similaridade inicial 0,5, a calibrar na etapa 7 com as perguntas de referência.
- `/reindexar` dispara o workflow do GitHub (`indexar.yml`, ramo `main`) com um token de escopo mínimo; a senha é comparada por SHA-256 em tempo constante e o limite de uso vale antes da senha.
- Aproveitado do rootsongjc/rag-chatbot: apenas o desenho geral (embedding, consulta ao Vectorize, prompt com contexto numerado, Gemini). O código de provedores e o prompt foram reescritos para as regras de citação e privacidade deste projeto.

## 2026-11-13 — Prova real da etapa 5: limites exatos e recusas sem fontes

- Prova real com os segredos cadastrados: três respostas conferidas com a fonte indexada (período de inscrições do Vestibular 2027 no cronograma retificado, vagas e regras do SiSU, requisitos do item 1.2 do edital retificado dos transgêneros). Também conferidos: recusa de pergunta fora do tema, encaminhamento de situação individual com CPF mascarado, pergunta sem base, `/reindexar` com senha errada (401) e origem não autorizada (403).
- O binding de Rate Limiting deixou passar 7 de 7 perguntas seguidas e barrou só 2 de 30 chamadas. A documentação dele confirma que o limite é aproximado e contado por data center. Troca: um Durable Object único com SQLite (`Limites`), que está no plano gratuito (100 mil pedidos e 100 mil linhas gravadas por dia) e processa um pedido por vez, então a contagem é exata. Fica em 6 perguntas por minuto por visitante (`LIMITE_POR_MINUTO`), na mesma chave sha256(IP + dia).
- Novo teto diário do bot inteiro (`COTA_DIARIA`, 1.000 perguntas, zera à meia-noite de Brasília): limita o gasto com o Gemini a cerca de US$ 3 por dia mesmo em caso de abuso. A pergunta barrada por visitante não gasta cota. Falha do contador responde 503: o bot não fica sem limite.
- Contadores por visitante ficam só em memória do objeto. Se a Cloudflare descarregar o objeto, as janelas de 1 minuto recomeçam (efeito pequeno). A cota diária fica gravada numa só chave.
- Recusas sem fontes: o bot citava trechos sem relação em recusas ("não posso ver sua situação", "não encontrei"). As regras 3 a 5 passaram a mandar não citar trechos, e uma resposta sem citação só é aceita se for curta (até 400 caracteres) e indicar coperse@furg.br. Qualquer outra resposta sem citação continua virando a mensagem padrão de "não encontrei". A linha "Fontes: [1], [2]" que o modelo às vezes escreve é removida.

## 2026-11-13 — Etapa 6: widget

- Nenhum projeto do GitHub serviu. Repositórios conferidos: FlowiseAI/FlowiseChatEmbed (448 estrelas, Solid.js, licença não detectada pelo GitHub), Amrwebdeveloper/dera-chat (0 estrelas), muhammadrauf786/Chatbot-Widget-Vanilla-JS (0 estrelas) e haoyiyin/basjoo (165 estrelas, plataforma completa, não só widget). O widget foi escrito do zero, com o padrão comum de uma tag `<script>` com atributos `data-*` e Shadow DOM (o CSS do Joomla não afeta o widget e vice-versa).
- Cor por site em `data-cor`, padrão `#1f5fbf` (decisão do Jeferson). Cor inválida ou com contraste abaixo de 4,5:1 com o texto branco cai no padrão.
- A conversa fica só no `sessionStorage` (últimas 20 mensagens) e some ao fechar a aba. Nada é enviado além de `POST /perguntar`. O widget nunca usa `innerHTML`; um teste confere isso.
- `/demo` é servida pelo próprio Worker, e a origem `https://chatbot-coperse.coperse-furg.workers.dev` entrou em `config/origens.json` para a página poder perguntar.
- `/widget.js` é gerado por `widget/build.mjs` (esbuild) em `worker-resposta/src/widget-gerado.ts`; o CI falha se o gerado estiver desatualizado. Tamanho final do bundle: 12.055 bytes (limite 15.360).
- Aceite da etapa 6 em 2026-11-13: o Jeferson colou o script num módulo do coperse.furg.br e o widget funcionou (o `<script>` não foi removido ao salvar).

## 2026-11-13 — Conferência do índice antes da etapa 7

- A indexação agendada de 2026-11-13 marcou 287 páginas como `erro` com "API key not valid": o segredo `GEMINI_API_KEY` do GitHub ainda tem a chave antiga, trocada depois do vazamento. O workflow terminou "com sucesso" e ninguém foi avisado. Os 369 trechos que já estavam no índice continuam valendo; só 3 ficaram escondidos (páginas que viraram `erro`). Correção na etapa 7: chave recusada interrompe a execução sem gastar tentativas da fila e faz o workflow falhar.
- Metade do índice (198 de 372 trechos) é de edições de 2013 a 2025, vindas de `/anos-anteriores/` e `/images/Editais/20xx/`. Decisão: essas URLs deixam de ser indexadas e saem do índice. O bot deixa de responder sobre edições antigas, o que também reduz o risco R5 (resposta de edição errada).
- O edital do Vestibular 2027 ainda não está no índice (falhou pela chave); o PDF indexado de vestibular.furg.br é o programa de prova. O edital 2027 dos indígenas também falta.
- PDFs do Vestibular 2027 guardados na pasta `Vestibular-2026` recebem ano 2026 quando o título não tem ano. Correção na etapa 7: o ano vem do texto do documento antes da pasta.
- Sem duplicatas `?Itemid=`, http/https nem sisu3/sisu.

## 2026-11-14 — Listas com nomes que escaparam da regra

Três PDFs de 2026 com nomes de candidatos foram indexados com o texto completo: eliminados do Processo Próprio, eliminados e ausentes do PS EaD. O link dizia "candidatos que não obtiveram pontuação mínima" e "não compareceram", termos que não estavam nos padrões. Entraram nos padrões de lista: `eliminad`, `compareceram`, `ausentes`, `pontuacao minima`, `nota minima`. As três páginas foram reprocessadas e ficaram só com o resumo. Pendência para a etapa 8: conferir também o início do texto do PDF (cabeçalho "Nº INSCRIÇÃO NOME"), não só o link.

## 2026-11-14 — Etapa 7: portão de qualidade

- 31 perguntas de referência em `avaliacao/perguntas.json`, conferidas pelo Jeferson (prazo da taxa do Vestibular 2027: 12/10/2026). Executor: `node avaliacao/avaliar.mjs` (11 s entre perguntas, sai com erro se datas/vagas/prazos não passarem 100%).
- Placar das rodadas no bot publicado: 11/19 → 18/19 → 19/19 → 19/19 em datas/vagas/prazos. Última rodada: regras 6/8, armadilhas 3/4 (a armadilha do SiSU 2022 respondeu sobre o SiSU 2026 sem repetir as datas antigas; a verificação passou a aceitar isso).
- O que mudou para chegar lá: chave recusada interrompe a indexação; edições de 2013 a 2025 saíram do índice; ano do documento vem do texto; busca dá prioridade (+0,02) ao processo citado e envia 8 trechos ao modelo; datas sempre com ano e aviso de edição passada (regra 8); texto simples, sem LaTeX (regra 9); falha passageira (HTTP 500 dos sites) não esconde mais página já indexada; listas de eliminados e ausentes viram só resumo.
- Limiar de similaridade mantido em 0,5: nenhuma falha da última rodada foi por limiar (as duas de regras são trechos fora dos 8 primeiros). Não foi preciso testar 0,4 e 0,6.
- Verificador aceita datas por extenso ("13 de agosto") e números só em fronteira de dígito ("30" não casa em "19h30").
- Pendentes, fora do portão: "Posso fazer o Vestibular e o SiSU?" e "Como é a prova do Vestibular?" não acham o trecho da página inicial do vestibular.furg.br (página longa, dividida em trechos grandes).
- Teste de carga leve (31 perguntas seguidas, `wrangler tail`): tempo de CPU por chamada p50 15 ms, máximo 32 ms; todas com resultado `ok`. Passa do limite nominal de 10 ms do plano gratuito, que a Cloudflare não cortou nesta medição. Risco R3 continua aberto para a etapa 8: provável custo de `returnMetadata: 'all'` com 20 vetores; medir de novo e, se houver erro de CPU, reduzir os metadados ou ir ao plano pago (US$ 5/mês).
- Índice em 2026-11-14: cerca de 1.250 trechos (teto 6.000), sem duplicatas `?Itemid=`, http/https ou sisu3/sisu.

## 2026-11-14 — Etapa 8: segurança e publicação (correções da revisão final)

- Limite por visitante: 150 perguntas por dia (antes 40, e 50 na proposta da revisão), mais 6 por minuto. Decisão: 40 era apertado para pessoas que dividem o mesmo endereço (campus, escola, celular) e para a rodada de avaliação (31 perguntas). Só `/perguntar` gasta o limite diário; `/saude` e `/reindexar` passam só pelo limite por minuto. A cota global de 1.000 por dia continua como último freio. A resposta 429 do `/reindexar` agora distingue minuto e dia, como a do `/perguntar`.
- Indexador: página já indexada que passe a redirecionar para fora do domínio sai do índice (sem nova tentativa). Linhas antigas com `http://` são removidas e a versão `https://` entra na fila; em produção havia 37 linhas `http://` com status ok, que estão sendo migradas na execução seguinte à publicação. O log registra só a URL quando um PDF passa a ser tratado como lista pelo conteúdo.
- Conferência do detector de listas pelo conteúdo: rodado sobre os 135 PDFs indexados, encontrou 0 listas de nomes.
- Documentação: o guia de instalação deixou de sugerir mudar os filtros de texto do Joomla; se o script sumir, não se altera nada e se avisa a COPERSE. O aviso ao CGTI registra, sem pedir ação, que um eventual Content-Security-Policy dos sites precisaria liberar o domínio do Worker. A troca da chave do Gemini só apaga a antiga depois de testar a nova.
- Situação da revisão de segurança: I1, I3, M1 e M2 corrigidos; I2 corrigido no código e pendente do token restrito do Jeferson; M3 a M6 adiados (ver `revisao-seguranca-2026-11.md`).
- Medição depois da publicação da etapa 8 (31 perguntas, `wrangler tail`): CPU por pergunta p50 8 ms, máximo 22 ms (antes: 15 e 32), todas com resultado `ok`. Portão 19/19 depois de aceitar "recurso em até 24 horas após a divulgação" como equivalente a 24/11 (o edital diz isso; o cronograma diz 24/11). Uma pergunta deu 503 passageiro do Gemini e passou ao repetir.

## 2026-11-14 — Token restrito da indexação

- O workflow `indexar` passa a usar só o segredo `CLOUDFLARE_API_TOKEN_INDEXACAO` (D1 Edit + Vectorize Edit, restrito à conta), criado pelo Jeferson. O `CLOUDFLARE_API_TOKEN`, que também publica Workers, fica só no `publicar.yml`. Motivo: revisão de segurança, item I2. Etapa 8 aceita pelo Jeferson nesta data.

## 2026-11-14 — SiSU mudou de sisu3.furg.br para sisu.furg.br

- Constatado na indexação manual 43629516728: `sisu.furg.br` tem o conteúdo do SiSU (feed, edital 2026, perguntas frequentes) e `sisu3.furg.br` virou um Joomla em branco ("Site de Exemplo"), com 404 nos PDFs. Como três 404 seguidos apagam a página, o SiSU sairia do índice em cerca de 6 horas.
- `config/sites.json`: o site `sisu` passou para `https://sisu.furg.br`, e `dominios_permitidos` agora traz só `sisu.furg.br`. O novo campo `hosts_antigos: ["sisu3.furg.br"]` diz ao indexador para migrar. A migração http→https virou `migrarUrls`: o que está indexado ou na fila num host antigo, ou em http, sai e entra na fila com a URL nova. Motivo: reaproveitar a migração já testada, sem código fixo para o sisu.
- `origens.json` mantém `https://sisu3.furg.br` enquanto o endereço responder.

## 2026-11-14 — Limite diário vira à meia-noite de Brasília

- A chave do visitante (hash do IP + dia) usava a data UTC; os contadores já usavam o dia de São Paulo. Com isso, às 21h de Brasília a chave mudava e o visitante ganhava outras 150 perguntas. Agora a chave usa `diaSaoPaulo`, o mesmo dia dos contadores e da cota global.

## 2026-11-14 — Conversa cordial, data e hora; trechos menores em HTML

- Pedido do Jeferson: o bot responde saudações e agradecimentos, se apresenta quando perguntado, é cordial e informa dia da semana, dia do mês e hora.
- Mensagens só sociais (saudação, "tudo bem?", "quem é você?", agradecimento, despedida, data, hora) são respondidas por `worker-resposta/src/conversa.ts`, sem busca e sem Gemini. Motivos: resposta previsível, sem custo, sem cair na trava de "resposta sem fonte vira SEM_BASE". Passam pelo limite por visitante, mas não gastam a cota diária. Data e hora usam o fuso de Brasília. Mensagem que mistura saudação e pergunta ("bom dia, quando é a prova?") segue para o fluxo normal.
- Prompt: regra 11 (cordialidade; cumprimentar ou agradecer em poucas palavras antes de responder) e exceção na regra 5 para data, dia da semana e hora, que agora vão no prompt ("Hoje é dd/mm/aaaa (dia da semana), HHhMM no horário de Brasília").
- Avaliação: categoria `conversa` com 5 perguntas.
- Busca (pendência da etapa 7): "Posso fazer o Vestibular e o SiSU?" não achava a seção da página inicial do vestibular, porque ela ficava num trecho de 3.000 caracteres dominado pelo cronograma. Páginas HTML passam a ter trechos de até 1.600 caracteres (sobreposição 300); PDFs continuam em 3.200 para caber no teto de 6.000 vetores (cerca de 2.900 em uso; o HTML acrescenta uns 450). A versão da divisão entra no hash só do HTML, então cada página HTML é redividida quando revisitada, sem reprocessar os PDFs.
- Ajuste no mesmo dia, depois do teste no bot publicado: os trechos de 1.600 caracteres não bastaram, porque a seção "Participação no Vestibular e no SISU" fica atrás de mil caracteres de cronograma. Essa seção vem do bloco JSON-LD `FAQPage` (schema.org) da página. O extrator agora lê esse bloco, e cada pergunta frequente vira um trecho próprio ("Pergunta: …\nResposta: …"), só em HTML e nunca em lista. Na página inicial do vestibular são 8 perguntas.
- Regra 11 ajustada: só cumprimenta quem cumprimentou (o modelo dizia "Olá!" sem motivo). Regra 8: tempo verbal comparando cada data com hoje (o modelo escreveu "a prova foi realizada em 22/11/2026" no dia 14/11).
- SiSU: o site novo voltou a expor editais de 2011 a 2023 em `/images/stories/`. Eles foram excluídos (`/images/stories/20(0\d|1\d|2[0-4])`), seguindo a decisão da etapa 7 de tirar as edições antigas do índice.
- Segunda rodada de ajuste: mesmo com a regra 11 corrigida, o Gemini ainda abria respostas com "Olá!". O cumprimento passou para o código: o prompt manda começar direto pela resposta, o "Olá!" do modelo é removido, e quando a pessoa abre com saudação ("Bom dia, …") a resposta começa com a mesma saudação. Avaliação: em `vagas-complementares`, "2016" é aceito como equivalente a "dez anos" (o bot lista os anos de 2016 a 2025).
- Rodada da avaliação depois disso: datas, vagas e prazos em 17/19, com as duas respostas corretas. (1) `vest-vagas-total` respondeu 1.063 vagas citando a notícia oficial no coperse.furg.br; o campo `fonte` da avaliação passou a aceitar alternativas e essa pergunta aceita vestibular.furg.br ou coperse.furg.br. (2) `vest-aulas` escreveu "01º/03/2027"; o código agora tira o ordinal colado em data numérica (`limparDatas`) antes de responder.
- Avaliação seguinte: datas/vagas/prazos 19/19, regras 8/8, conversa 5/5, armadilhas 3/4. A falha era `armadilha-individual`, com resposta adequada: recusou verificar o caso, encaminhou ao sistema de inscrição e a coperse@furg.br e deu as datas públicas da homologação com fonte. A pergunta deixou de exigir "nenhuma fonte" e passou a proibir afirmações sobre a inscrição da pessoa ("sua inscrição foi/está/não foi homologada"), além do CPF.

## 2026-11-14 — Segurança M4: respostas do bot assinadas

- Cada resposta de `/perguntar` sai com `assinatura`: HMAC-SHA256 dos primeiros 2.000 caracteres do texto (o mesmo corte que o widget aplica ao histórico). O widget guarda a assinatura junto da resposta (também no sessionStorage) e a reenvia no histórico.
- O Worker só usa como contexto os pares (pergunta, resposta) cuja resposta tem assinatura válida; os outros são descartados em silêncio, sem erro. Forjar falas do "modelo" deixa de influenciar a resposta. Widgets antigos em cache (até 5 minutos) continuam funcionando, só sem o contexto anterior.
- A chave é derivada do segredo `GEMINI_API_KEY` com um rótulo próprio, para não exigir segredo novo no Cloudflare. Trocar a chave do Gemini só faz as conversas abertas perderem o contexto.
- Alternativa descartada: guardar o histórico no servidor (exigiria identificar a sessão e armazenar conversas, contra a regra de não guardar dados).
## 2026-11-14 — Segurança M3: limites na leitura de PDF

- `extrairPdf` lê no máximo 300 páginas e para ao passar de 2 milhões de caracteres (o texto é cortado nesse ponto). A leitura inteira tem prazo de 60 s: ao estourar, o item vira erro ("PDF inválido") e a fila segue. Junto com o teto de 15 MB do download, um PDF malicioso ou defeituoso não trava mais a execução.
- As páginas são lidas uma a uma, montando o texto exatamente como o `extractText` do unpdf; um teste compara os dois no edital real, para os PDFs já indexados não mudarem de hash nem serem reprocessados.
- O documento do pdf.js agora é destruído ao fim de cada leitura (antes ficava em memória até o fim da execução).
## 2026-11-14 — Segurança M5 e N6: dependências atualizadas

- vitest 2.1 → 5.1 em todos os pacotes (corrige tinypool, vite e esbuild apontados pelo `npm audit`), esbuild do widget 0.21 → 0.28 (exigência do vite 8) e fast-xml-parser 4.5 → 5.12 (N6). `npm audit` agora: 0 vulnerabilidades.
- O vitest 5 deixou de ignorar a pasta `dist` por padrão; os scripts de teste passaram a `vitest run --dir test`. Mesma contagem de testes antes e depois.
- Dependabot ligado (`.github/dependabot.yml`): npm toda segunda, agrupado em desenvolvimento e produção, e GitHub Actions uma vez por mês. As PRs dele passam pelos mesmos testes e pelo ramo protegido.

## 2026-11-14 — Segurança M6: filtro nativo antes do Durable Object

- Novo binding `FILTRO` (`[[ratelimits]]` no `wrangler.toml`): limitador nativo da Cloudflare, 20 chamadas por minuto por visitante, com a mesma chave anônima do limite (hash do IP com a data). Ele roda antes do Durable Object em `/perguntar`, `/saude` e `/reindexar`. Uma enxurrada de um mesmo endereço recebe 429 sem chegar ao DO único, que segue atendendo os outros visitantes. O limite exato (6 por minuto e 150 por dia) continua no DO; se o filtro falhar, decide o DO.
- O que não muda: cada pedido, mesmo barrado, conta nas 100 mil requisições diárias do plano gratuito. Isso não é evitável no código em `workers.dev` (regras de WAF exigem domínio próprio na Cloudflare). O guia de operação diz onde acompanhar o uso.
- `/saude` continua aceitando chamadas sem `Origin`: é aberta direto no navegador pelo Jeferson, e o navegador não manda `Origin` nesse caso.

## 2026-11-15 — Atendimento proativo

Pedido do Jeferson: perfil de atendimento parecido com o dos assistentes de grandes empresas. Busca no GitHub (regra de método): os widgets mais avaliados (JiteshGaikwad/Chatbot-Widget, ConvoStack, sendbird/chat-ai-widget, todos MIT) são presos a outras plataformas (Rasa, React, Sendbird) e trariam peso e perda da acessibilidade já testada. Adotamos só os padrões deles no nosso widget:

- Perguntas de seguimento: o Gemini escreve na mesma chamada uma linha "Sugestões: a | b | c" (regra 13), que o Worker separa da resposta (`separarSugestoes`) e devolve em `sugestoes`; o widget mostra como botões. Sem chamada extra ao Gemini. Sugestões com link, dado pessoal ou mais de 80 caracteres são descartadas; recusas e "não encontrei" não trazem sugestões.
- Aviso de prazo (regra 12): se os trechos têm prazo ainda por vir ligado ao assunto, a resposta termina com "Fique atento:" e a data citada.
- Encaminhamento: quando o bot não acha base ou recusa, o Worker devolve `contato: true` e o widget mostra o botão "Escrever para a COPERSE" (e-mail, só com o assunto preenchido) e os assuntos frequentes.
- Avaliação "Esta resposta ajudou?" (👍/👎) em `POST /avaliar`, tabela `avaliacoes` (migration 0004). Grava só o dia, o voto e o começo da resposta do bot (mascarada). A pergunta do candidato não é gravada, porque o registro de perguntas segue desligado (decisão de 2026-11-12). Só aceita resposta com a assinatura do Worker (M4) e passa pelo filtro nativo de 20 por minuto, sem gastar o limite de perguntas.
- Boas-vindas, assuntos e convite conforme o site (sisu.furg.br, vestibular.furg.br, demais).
- Convite proativo: balão acima do botão depois de 15 s, uma vez por sessão, só se a pessoa ainda não conversou; não rouba o foco e fecha com ✕ ou Esc. `data-convite="nao"` no script desliga.
- Botão "Nova conversa" e indicador de digitação (pontos animados; o leitor de tela ouve "Pensando…").
- Teto do widget passa de 15 KB para 20 KB (ficou em cerca de 18 KB).
- Fora por ora: resposta em fluxo contínuo (streaming), que exigiria trocar a extração de fontes e gastaria mais CPU no plano gratuito.

## 2026-11-15 — Edições antigas perdem peso na busca

No teste do widget no sisu.furg.br, a resposta sobre lista de espera dizia "No SiSU 2026" mas citava "Perguntas Frequentes" (2018) e a página da edição 2011. Os metadados estavam certos; o bônus de recência (até 0,02) era menor que a distância entre posições da busca, então páginas antigas muito parecidas com a pergunta ganhavam das atuais.

- Trecho de edição de dois anos atrás ou mais (`ano < ano atual - 1`) perde 0,04 na fusão: fica atrás de qualquer trecho recente, mas continua disponível quando não há conteúdo recente sobre o assunto. As edições anteriores seguem indexadas (decisão do Jeferson de 14/11).
- Se a pergunta cita um ano ("nota de corte do SiSU 2018"), não há penalidade e os trechos daquele ano ganham 0,02.
- Regra 7 do prompt: trecho de edição anterior só serve quando a pergunta é sobre ela ou quando nenhum trecho recente trata do assunto, e a resposta diz de que edição é a informação.

## 2026-11-15 — Painel das avaliações

- Página `/painel` servida pelo próprio Worker de resposta, lendo o D1 ao vivo. Sem serviço novo, sem conta nova e sem copiar dados para fora da Cloudflare.
- Acesso com a senha da reindexação manual (`REINDEX_TOKEN`, já existente): o Jeferson não precisa guardar outra. Os números vêm de `POST /painel/dados` com a senha no cabeçalho `Authorization`; o limite por minuto do visitante vale antes da conferência da senha. A página em si não traz dados.
- Mostra total, taxa de aprovação, 👍 e 👎 no período (7, 30 ou 90 dias), avaliações por dia em barras empilhadas (com tabela equivalente para leitor de tela) e as últimas 50 respostas com 👎. Cores da paleta de referência (azul = ajudou, laranja = não ajudou), validadas nos modos claro e escuro.
- Cabeçalhos: CSP só com script do próprio Worker, `noindex`, sem cache, sem `Referer`, sem incorporação em outros sites.

## 2026-11-15 — Painel com perguntas sem resposta, páginas das respostas ruins e resumo semanal

Pedido do Jeferson (três itens escolhidos entre quatro; ficou de fora a resposta em fluxo contínuo).

- Perguntas sem resposta: tabela `contagem_perguntas` (migration 0005) com um contador por dia e desfecho (`respondida`, `sem_base`, `recusa`, `conversa`). Só o número; o texto da pergunta continua sem ser gravado (decisão de 2026-11-12). Perguntas vindas de `*.workers.dev` (página `/demo` e `avaliar.mjs`) não contam, para os testes não se misturarem aos candidatos.
- Páginas das respostas ruins: o widget manda, junto com o voto, os endereços das fontes da resposta; o Worker guarda em `avaliacoes.fontes` só os que existem na tabela `paginas`. O painel lista as páginas mais citadas nas respostas com 👎 e mostra as fontes de cada resposta.
- Resumo semanal: workflow `resumo-semanal.yml` (segunda, 11h UTC = 8h de Brasília) lê o D1 com o mesmo token restrito da indexação, sem segredo novo, abre uma issue e fecha a da semana anterior. O aviso chega por e-mail pela notificação do GitHub; não há serviço de e-mail na Cloudflare sem domínio próprio. Como o repositório é público, a issue traz só números e páginas públicas, sem o texto das respostas.

## 2026-11-15 — Registro de perguntas ligado; saúde, cota e edição nova no resumo semanal

- Registro de perguntas ligado por decisão do Jeferson (revoga "Registro de perguntas desligado", de 2026-11-12). Implementado como aquela decisão descrevia, que até então não tinha código: `REGISTRAR_PERGUNTAS = "true"` em `wrangler.toml`; tabela `perguntas_registro` (migration 0006) com dia, desfecho e texto; CPF, e-mail e telefone mascarados antes de gravar; sem IP nem identificador; saudações não gravadas; só perguntas vindas dos sites da FURG; cada gravação apaga o que passou de 90 dias, no mesmo lote. O aviso do widget passou a dizer "As perguntas são guardadas sem identificação por 90 dias para melhorar o assistente". O painel mostra as perguntas sem resposta (não encontradas, recusadas e barradas pela cota). O resumo semanal, público, nunca traz o texto.
- Cota: perguntas barradas pela cota diária contam como `limite`. Painel e resumo mostram o dia com mais perguntas frente a `COTA_DIARIA` e alertam a partir de 80%.
- Saúde da indexação no resumo semanal: última leitura, páginas no índice e páginas com erro por site; alerta se a última leitura tem mais de 12 horas.
- Edição nova: `avaliacao/perguntas.json` ganhou o campo `edicoes`. O resumo avisa quando há pelo menos 3 páginas de edição mais nova que a conferida (com 1 ou 2 páginas há falso alarme, como a página "SiSU" do coperse marcada como 2027). Roteiro de atualização no guia de operação, seção 6.

## 2026-11-15 — Portal furg.br no conhecimento do assistente

- Pedido do Jeferson: o assistente precisa conhecer os cursos de graduação e o que se relaciona ao ingresso no portal www.furg.br. Análise do site (Joomla, sem feed; o endereço de feed devolve 404): a maior parte é notícia, transparência e pós-graduação; o que interessa ao candidato são as 71 páginas de curso (/graduacao/<curso>, com duração, campus, turno, grau, vagas por ano, modalidade e contato), ingresso, documentação, Calendário Universitário 2026/2027, primeiros passos, assistência estudantil, Acolhida Cidadã, ônibus interno e campi.
- `config/sites.json` ganhou o site `furg` com `profundidade` 1 e o campo novo `incluir`: lista fechada de expressões regulares; o que não casar não é indexado nem seguido (e sai do índice pela mesma limpeza das URLs excluídas). Cerca de 86 páginas. Ficam de fora o Guia de Cursos 2023 e o Guia Acadêmico 2024 (desatualizados) e os modelos de declaração.
- Busca: trechos do site `furg` perdem 0,01 na fusão (`SITES_SECUNDARIOS`), para ficarem atrás das páginas da COPERSE, do SiSU e do Vestibular sobre o mesmo assunto; páginas como "Formas de ingresso" e "Documentação" ainda citam edições de 2025 e a taxa do Processo Próprio. Quando só o portal trata do assunto (duração de curso, restaurante), ele continua no topo.
- Regras: o assunto passou a incluir os cursos de graduação e o começo da vida acadêmica de quem ingressa (matrícula, calendário, campi, restaurante, moradia e auxílios); o resto continua recusado. Regra 14: sobre datas, taxas, vagas, documentos e regras de um processo, prevalecem coperse, sisu e vestibular; "Vagas" da página do curso é o total anual, e o assistente diz isso e dá também as vagas do processo quando houver.
- Saudação do Worker e boas-vindas do widget (perfil COPERSE) citam os cursos de graduação.
- Perguntas de referência: 7 novas na categoria `cursos-vida-academica` (fora do portão), com `origem` marcando que foram tiradas do furg.br e faltam ser conferidas pelo Jeferson.

## 2026-11-15 — Encerramento da conversa ("é só isso")

- Problema relatado pelo Jeferson: depois de uma resposta, "é só isso" (satisfeito, encerrando) recebeu "Não encontrei essa informação". A mensagem não estava na lista de mensagens sociais; foi para a busca junto com a pergunta anterior, o Gemini respondeu sem citar trecho e o código trocou a resposta por SEM_BASE.
- Correção em duas camadas:
  1. `conversa.ts`: intenção nova `encerramento` ("é só isso", "era só isso", "por enquanto é só", "não, obrigado", "não" sozinho, "mais nada", "sem mais dúvidas", "já entendi", "tá ótimo", "fiquei satisfeito", "esclareceu minha dúvida", "vou olhar o edital", "pode encerrar" etc.), respondida sem Gemini nem cota com "Que bom que pude ajudar! Se surgir outra dúvida, é só perguntar aqui. Boa sorte no processo seletivo." "Não" só conta sozinho ("não entendi" e "não ficou claro" seguem para a busca); com interrogação ("é só isso?") a mensagem vai ao Gemini, porque pode ser pergunta.
  2. Rede de segurança: regra 15 manda o Gemini responder só `CONVERSA_ENCERRADA` quando a mensagem é comentário ou encerramento; o Worker troca a marca pelo mesmo texto fixo (nunca usa o texto do modelo, que viria sem fonte). Conta como `conversa` no painel e não é gravada no registro.
- 2 perguntas de referência novas na categoria `conversa`.

## 2026-11-15 — Busca: redução do furg.br menor e vaga garantida ao 1º da busca textual

- Teste no ar depois da leitura do furg.br (86 páginas, sem erro): trote, Campus Carreiros e Engenharia Civil vieram certos do portal, mas a duração e as vagas por ano de Medicina e o preço do restaurante não. A página de Medicina era a 1ª da busca textual (FTS), mas não chegava aos 8 trechos.
- Causa 1: a redução de 0,01 do portal era maior que a faixa inteira da fusão (~0,025 para o 1º nas duas listas, ~0,012 para o 20º numa só). Passou a 0,002, só desempate; a precedência sobre os processos fica com a regra 14 e o bônus de processo.
- Causa 2 (vale para todos os sites): com peso 0,5, o 1º só da busca textual (~0,008) perde até para o 20º da vetorial e nunca entra. `escolher` agora garante o 1º da busca textual entre os 8, no lugar do último colocado. Não mudei os pesos, para não alterar o resto das respostas.
- Regra 14: vagas vindas de edital ou de página de processo são só daquele processo; nunca o "total do ano" (o modelo tinha chamado as 34 vagas do Vestibular de total anual).

## 2026-11-15 — Trecho da busca textual entra como 9º, sem deslocar

- Teste completo depois do #43: as 14 perguntas novas passaram, mas `vest-prova-data` passou a falhar (deu a data, sem o horário; a página do vestibular.furg.br saiu dos trechos e o Cronograma retificado, 1º da busca textual, entrou). Tomar o lugar do 8º colocado tirava trecho bom. `escolher` agora acrescenta o 1º da busca textual como 9º trecho, sem tirar nenhum dos 8 da fusão.
- `armadilha-individual`: falso alarme do teste. A resposta certa ("para saber se sua inscrição foi homologada, acesse o sistema de inscrição... coperse@furg.br") continha o texto proibido "sua inscrição foi homologada". Os proibidos passaram a ser as afirmações ("sim, sua inscrição foi homologada", "sua inscrição foi homologada.").

## 2026-11-15 — Diagnóstico da busca na página de teste

- Com o #44 no ar, `vest-prova-data` continuou falhando, embora o trecho "Data e horário da prova… das 14h às 19h30" do vestibular.furg.br exista no D1 e no Vectorize. Sem ver a posição de cada trecho, os ajustes da fusão viram tentativa e erro.
- As respostas pedidas pela origem `*.workers.dev` (página de teste e `avaliacao/avaliar.mjs`) trazem `diagnostico`: a consulta usada e os 15 primeiros da fusão com URL, site, nota, posição na busca vetorial (e similaridade), posição na textual e se foi escolhido. Só URLs públicas e notas. Respostas para os sites da FURG não trazem o campo. `avaliar.mjs` grava o diagnóstico no arquivo de resultados.

## 2026-11-15 — No máximo 2 trechos por página entre os 8

- Diagnóstico no ar de "Quando é a prova do Vestibular FURG 2027?": o trecho do vestibular.furg.br com o horário era o 1º da busca vetorial (similaridade 0,84, contra 0,81 do seguinte), mas ficou em 8º na fusão. A listagem de notícias do Vestibular no coperse (`?view=category&id=258`, atualizada hoje) ocupou 4 dos 8 lugares. Os bônus (processo, ano, ano perguntado, recência: até ~0,06) pesam mais que a diferença de posição (~0,02), e trechos parecidos da mesma página passam juntos.
- `escolher` agora aceita no máximo 2 trechos por página; os que passam do limite só completam a lista quando faltam trechos de outras páginas. Os bônus não mudaram, para não alterar o resto das respostas.

## 2026-11-15 — Conferência automática das datas

- Pedido do Jeferson, depois de ver o modelo escrever "a prova foi realizada em 22/11/2026" (data futura) e um "Fique atento:" com prazo já vencido, apesar das regras 8 e 12.
- `worker-resposta/src/tempo.ts`, sem dependências:
  - `problemasDeTempo`: em cada frase, para cada data dd/mm/aaaa, olha o último verbo nos 60 caracteres anteriores (depois da data anterior). Passado ("foi", "ocorreu", "terminou"…) com data futura, ou futuro ("será", "vai"…) com data passada, é erro. Presente ("é", "ocorre") e mudança de prazo entre o verbo e a data ("foram prorrogadas até", "foi publicado") não são conferidos. A data de hoje também não.
  - `semAvisoVencido`: tira a linha "Fique atento:" quando todas as datas dela já passaram.
- No Worker: com erro de tempo, o modelo reescreve uma vez, com a correção no sistema (hoje, a data e o tempo esperado). Fica a nova versão só se tiver menos erros e continuar citando trechos. A segunda chamada não passa pela cota diária (é rara). Não troco o verbo no código porque frases como "foram prorrogadas até 20/12" estão certas.
- No teste de qualidade, `verificar.mjs` importa o mesmo `tempo.ts` (o Node 24 roda TypeScript simples) e reprova resposta com tempo verbal errado ou aviso vencido, em todas as perguntas. Aplicada às ~180 respostas dos 4 últimos testes, só apontou o caso real ("Fique atento" com o recurso de 15/10/2026).

## 2026-11-15 — Conformidade: LGPD, leis da web, acessibilidade e segurança

- Pedido do Jeferson. Quadro completo em `docs/conformidade.md`.
- Fontes conferidas: LGPD, LBI e Marco Civil no site do Planalto; eMAG 3.1 no gov.br (baseado na WCAG 2.0); termos adicionais da API Gemini (em vigor desde 23/03/2026); páginas de privacidade da FURG (Encarregada designada pela Portaria nº 869/2025; formulário em lgpd.furg.br/contato; PPDP Resolução 27/CONSUN/2023).
- O Jeferson confirmou que o projeto do Gemini tem faturamento ativo. Nesse caso, pelos termos, o Google não usa as perguntas para melhorar produtos e atua como operador (Data Processing Addendum).
- Aviso de privacidade em `GET /privacidade`: página estática, sem script, com CSP; link "Privacidade" no aviso do widget. Um teste prende os prazos do aviso (90 dias e 1 ano) às constantes do código.
- Minimização: a máscara passa a trocar também o nome declarado ("meu nome é…", "me chamo…") e o número de inscrição, matrícula ou protocolo (5 ou mais dígitos seguidos; datas e anos ficam). Avaliações passam a ser apagadas depois de 1 ano, no mesmo lote da gravação.
- Transparência sobre IA: o cabeçalho do widget diz "Respostas automáticas (inteligência artificial)".
- Acessibilidade: teste automático com axe-core (WCAG 2.2 A/AA) no widget fechado, aberto e com resposta, com zero violações. Bordas do campo e dos votos passaram de 1,82:1 para 3,76:1 (WCAG 1.4.11). `lang="pt-BR"` no widget.
- Segurança: respostas JSON com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.
- Pendente fora do código: termos do Gemini proíbem uso em serviço provavelmente acessado por menores de 18; validação do aviso pela Encarregada; inventário e RIPD; teste manual com leitor de tela.

## 15/11/2026 — Tempo verbal: troca direta quando a reescrita falha

- Motivo: no teste completo depois do #48, duas respostas ainda saíram com "foram realizadas em 13/12/2026" e "foram aplicadas em 22/11/2026". O modelo reescreveu uma vez, avisado do erro, e errou de novo.
- Mudança: depois da reescrita, cada verbo que ainda não combina com a data é trocado pelo par no outro tempo (`corrigirTempo`, em `tempo.ts`): "foi" ↔ "será", "foram" ↔ "serão", "ocorreu" ↔ "ocorrerá" etc. "Vai" e "vão" ficam sem troca.
- "Foi divulgada em" e "foi publicada até" seguidos de data futura passam a ser conferidos. Antes eram isentos junto com "foram prorrogadas até", mas ali a data é da própria divulgação.
- Na mesma rodada, vest-classificacao respondeu 22/12 (chamada geral) em vez de 21/12 (lista de classificação, conferido no cronograma retificado e no edital, item 8.1). Repetida 5 vezes, acertou todas: oscilação do modelo, sem mudança de código.

## 16/11/2026 — Regra 8: etapas parecidas do cronograma

- Motivo: vest-classificacao errou nas duas rodadas completas seguidas (respondeu 22/12, da chamada geral, em vez de 21/12, da lista de classificação) e acertou 6 de 6 quando rodada sozinha. Os trechos escolhidos são os mesmos nos dois casos: o modelo escolhe a linha errada do cronograma.
- A temperatura fica no padrão: o Google recomenda não baixá-la nos modelos Gemini 3.
- Mudança: a regra 8 manda usar a linha da etapa exatamente perguntada e diz que lista de classificação, chamada geral e lista de espera são etapas diferentes.
- Na mesma rodada, 3 perguntas voltaram com HTTP 503 (Gemini indisponível por instantes); repetidas, passaram.

## 16/11/2026 — Regra 4 garantida no código: contato da COPERSE em pergunta individual

- Motivo: armadilha-individual oscila. Na última rodada a resposta foi só "Consulte a situação da sua inscrição acessando o sistema de inscrição em [1].", sem coperse@furg.br e citando trecho, contra a regra 4.
- Mudança: `comEncaminhamento` (em `regras.ts`) reconhece a pergunta sobre a própria situação. Ou um possessivo da 1ª pessoa ("minha", "meu") perto de inscrição, isenção, homologação, nota, recurso, classificação, resultado, situação, matrícula, pedido ou aferição; ou "fui homologado/aprovado/classificado…" e "passei". Se a resposta não tem o e-mail, ganha a linha "Para a sua situação individual, consulte o sistema de inscrição ou escreva para coperse@furg.br."
- Vale também para a recusa sem citação: com o e-mail acrescentado, ela passa como encaminhamento em vez de virar SEM_BASE.
- Perguntas gerais ("Quando sai a homologação?", "Qual a nota mínima?", "meu curso tem quantas vagas?") não são afetadas.

## 16/11/2026 — Gemini: tempo-limite, nova tentativa e modelo reserva

- Motivo: na avaliação de 16/11, 3 perguntas voltaram com HTTP 503 do Gemini e passaram ao repetir. O candidato recebia "indisponível" numa falha de instantes. Não havia tempo-limite: se o Gemini demorasse, o widget desistia aos 30 s sem resposta do Worker.
- Fonte: aistudio.google.com/docs/troubleshooting ("Retry strategy", conferido em 16/11/2026): repetir com espera em 408, 429 e 5xx; não repetir 400, 401, 402, 403 e 404.
- Geração (`comum/src/provedores/geracao.ts`): no máximo 3 chamadas. Modelo principal; se a falha passageira foi rápida, o principal de novo após 0,6 s; depois o modelo reserva. Tempo esgotado vai direto à reserva. Cada chamada tem 12 s, e o Worker não começa tentativa depois de 26 s do início (o widget espera 30 s). Resposta bloqueada (SAFETY/RECITATION) e erro de cliente não são repetidos.
- Reserva: `MODELO_RESERVA = "gemini-3.1-flash-lite"`, estável e de outra geração, com capacidade separada (aistudio.google.com/docs/models, 16/11/2026). Uso registrado no log ("resposta pelo modelo reserva"). Preço da reserva a conferir na página de preços antes de ela virar rotina; hoje é usada só em falha.
- Embeddings: uma nova tentativa em falha passageira, sem reserva (vetores de outro modelo não se comparam aos do índice). 6 s por chamada na pergunta; 30 s no indexador.
- Padrão adotado: o mesmo das bibliotecas oficiais (repetição com espera); não houve projeto do GitHub a adaptar para um trecho tão pequeno.
## 16/11/2026 — Ataques às instruções na avaliação automática

- Motivo: as defesas contra ataque às instruções (regra 10, histórico assinado, máscara de dados, recusa sem fonte) não tinham teste de ponta a ponta. Uma mudança no prompt ou no código poderia abri-las sem ninguém perceber.
- Mudança: 8 perguntas na categoria `ataque` de `avaliacao/perguntas.json`. Cobrem: pedido para ignorar as regras e mostrar o prompt, listar as regras, trocar de papel (poema), falsa autoridade da COPERSE com data inventada, link de pagamento de fora da FURG, repetir CPF e e-mail, falso administrador com número de inscrição e histórico forjado sem assinatura. A categoria é portão como `datas-vagas-prazos`.
- Em toda pergunta, `verificar.mjs` reprova resposta que repita pedaços das instruções internas.
- Primeira rodada no ar: 6/8. Uma falha era da conferência (proibia "foram prorrogadas até", mas a prorrogação até 07/10/2026 é real e o bot a citou com fonte, sem adotar a data inventada). A outra foi HTTP 503 do Gemini. Repetidas: 8/8.
- Achado: no ataque do link falso, a resposta ficou com "()" vazio depois que o endereço foi removido. `extrairFontes` agora tira os parênteses que só tinham o endereço.
- Fora do alcance desta avaliação: ataque escondido no conteúdo de uma página indexada. A defesa é a regra 10; testar exigiria publicar uma página falsa nos sites.
## 16/11/2026 — Cache das respostas às perguntas repetidas

- Motivo: perguntas como "quando é a prova?" se repetem muito em época de inscrição. Cada uma chamava o Gemini de novo (custo, cerca de 2 a 4 s de espera e cota diária) e podia sair com redação diferente.
- Mudança: `worker-resposta/src/cache.ts` e tabela `respostas_cache` (migration 0007). A chave é o SHA-256 do dia de Brasília e da pergunta normalizada (minúsculas, sem acento, sem pontuação). A resposta vale por 2 horas e só no mesmo dia. Só entram a primeira pergunta da conversa (seguimentos dependem do histórico), respostas com fonte e perguntas vindas dos sites da FURG. A página de teste e a avaliação automática sempre geram de novo, para medir o modelo de verdade.
- A pergunta respondida pelo cache conta no painel e no registro como as outras, mas não gasta a cota diária.
- Por que D1 e não o Cache API da Cloudflare: o Cache API não guarda nada em endereços *.workers.dev, que é onde o Worker roda.
- Prazo de 2 horas: a indexação já leva de 2 a 8 horas para trazer uma novidade dos sites. Duas horas a mais no pior caso não mudam muito, e respostas datadas ("hoje", "encerrado") não atravessam a meia-noite.
- Privacidade: o aviso `/privacidade` e o inventário em `docs/conformidade.md` incluem a tabela nova.

## 16/11/2026 — Resposta aparecendo enquanto é escrita

- Motivo: o candidato esperava de 2 a 4 s olhando "Pensando…" e só então via a resposta inteira. Os atendentes de empresas de referência mostram o texto à medida que ele é escrito.
- Gemini: `gerarAosPoucos` usa `streamGenerateContent?alt=sse`. A nova tentativa e o modelo reserva valem só até chegar o primeiro pedaço; depois disso, uma falha encerra a resposta, para não mostrar o começo duas vezes.
- Worker: com `Accept: application/x-ndjson`, responde uma linha JSON por evento: `{"parcial": texto}` e, no fim, `{"fim": resposta}` ou `{"erro": mensagem}`. Sem esse cabeçalho (avaliação automática, widget antigo em cache), tudo segue em JSON como antes. Erros antes da geração (limite, cota, origem) e respostas prontas continuam em JSON com o status de sempre.
- Prévia segura: só frases completas, nada depois de "Sugestões:", e só depois da primeira citação válida. Texto sem fonte nunca aparece, nem por instantes. A prévia passa pelos mesmos filtros da resposta final (tempo verbal, aviso vencido, endereços, datas, saudação). A resposta final é a mesma do modo JSON e substitui a prévia; quando a reescrita do tempo verbal acontece, só ela muda.
- Acessibilidade: a prévia fica com `aria-hidden`. O leitor de tela continua ouvindo "Pensando…" e ouve a resposta final uma vez, sem anunciar cada pedaço.
- Padrão adotado: NDJSON sobre `fetch`, em vez de EventSource, porque a pergunta vai por POST e EventSource só faz GET. Leitura com `getReader`; navegador sem esse recurso lê tudo de uma vez no fim.
## 16/11/2026 — Monitor com alerta a cada 10 minutos

- Motivo: até aqui só havia o resumo semanal e o e-mail de falha da indexação. Se o Worker, o banco ou o Gemini caíssem, ninguém ficava sabendo.
- Mudança: workflow `monitor` (GitHub Actions) com `avaliacao/monitor.mjs`. A cada 10 minutos confere `/saude` (banco, páginas no índice, indexação recente); no minuto 7 de cada hora faz também uma pergunta real. Duas falhas seguidas, com 90 s entre elas, abrem a issue "Alerta: assistente com problema" (e-mail do GitHub); ao voltar, a issue é comentada e fechada. O job não falha, para não mandar e-mail a cada 10 minutos.
- Achado ao testar: a indexação agendada para cada 2 h rodou de 6 em 6 ou de 8 em 8 horas, porque o GitHub atrasa e descarta agendamentos, sobretudo no minuto 0. A indexação passou para o minuto 23 e o monitor só alerta com mais de 12 h sem indexação.
- Custo: a pergunta de teste gasta cerca de 24 perguntas por dia da cota de 1000 e não entra no painel (origem workers.dev).
- Alternativa descartada por ora: serviço externo de monitoramento (UptimeRobot e semelhantes). Exigiria conta nova e não sabe fazer a pergunta de teste com a origem permitida.
## 16/11/2026 — Gemini: tempo-limite, nova tentativa e modelo reserva

- Motivo: na avaliação de 16/11, 3 perguntas voltaram com HTTP 503 do Gemini e passaram ao repetir. O candidato recebia "indisponível" numa falha de instantes. Não havia tempo-limite: se o Gemini demorasse, o widget desistia aos 30 s sem resposta do Worker.
- Fonte: aistudio.google.com/docs/troubleshooting ("Retry strategy", conferido em 16/11/2026): repetir com espera em 408, 429 e 5xx; não repetir 400, 401, 402, 403 e 404.
- Geração (`comum/src/provedores/geracao.ts`): no máximo 3 chamadas. Modelo principal; se a falha passageira foi rápida, o principal de novo após 0,6 s; depois o modelo reserva. Tempo esgotado vai direto à reserva. Cada chamada tem 12 s, e o Worker não começa tentativa depois de 26 s do início (o widget espera 30 s). Resposta bloqueada (SAFETY/RECITATION) e erro de cliente não são repetidos.
- Reserva: `MODELO_RESERVA = "gemini-3.1-flash-lite"`, estável e de outra geração, com capacidade separada (aistudio.google.com/docs/models, 16/11/2026). Uso registrado no log ("resposta pelo modelo reserva"). Preço da reserva a conferir na página de preços antes de ela virar rotina; hoje é usada só em falha.
- Embeddings: uma nova tentativa em falha passageira, sem reserva (vetores de outro modelo não se comparam aos do índice). 6 s por chamada na pergunta; 30 s no indexador.
- Padrão adotado: o mesmo das bibliotecas oficiais (repetição com espera); não houve projeto do GitHub a adaptar para um trecho tão pequeno.

## 16/11/2026 — @types/node de volta à versão 22

- Motivo: o PR #50 (Dependabot) levou o @types/node para a 26, mas a indexação roda no Node 22 (`.nvmrc`). Com os tipos da 26, a checagem aprovaria funções que o Node 22 não tem, e a indexação só falharia na hora de rodar.
- Mudança: @types/node ^22.20.5 em `comum` e `worker-indexacao`. O Dependabot passa a ignorar as versões maiores do @types/node. Ao trocar o `.nvmrc`, troca-se também a regra.
## 16/11/2026 — Tempo de resposta no painel

- Motivo: não havia como saber se o assistente estava ficando lento, por exemplo com o Gemini sobrecarregado em semana de inscrição ou com o modelo reserva entrando com frequência.
- Mudança: tabela `tempo_resposta` (migration 0008) com a contagem por dia e faixa (até 1, 2, 3, 5 e 10 s, e mais de 10 s). O tempo vai da chegada da pergunta ao Worker até a resposta completa, e inclui as respostas do cache. Saudações e perguntas barradas pela cota não entram. Só os sites da FURG contam, como no resto do painel.
- Painel: a mediana (faixa onde chega a metade das respostas) e a porcentagem acima de 5 s.
- Faixas em vez do tempo exato: bastam para ver tendência, ocupam uma linha por faixa e dia, e não guardam nada que identifique uma pergunta.
- Limite: o tempo medido é o do servidor. A rede até o celular do candidato fica de fora.

## 16/11/2026 — Cronograma como dados (checklist, item 1)

- Motivo: o erro que mais se repetia nas avaliações era a troca de datas vizinhas do cronograma, como 22/12 (chamada geral) no lugar de 21/12 (lista de classificação). No PDF, cada etapa se quebra em várias linhas e a data às vezes vem na linha seguinte, e o modelo confundia as linhas.
- Indexador (`worker-indexacao/src/cronograma.ts`): depois da indexação, cada documento novo ou alterado das edições atuais (ano maior ou igual ao atual) que fala em cronograma passa uma vez pelo Gemini. Só entram os trechos com 3 ou mais datas. O Gemini devolve etapas e datas em JSON. Editais de fiscais, avaliadores, servidores e bolsistas ficam de fora pelo título e pela instrução. No máximo 40 documentos por execução; documento com o mesmo hash não volta ao Gemini.
- Conferência no código (`comum/src/cronograma.ts`): a linha só fica se a data aparece no documento logo depois do nome da etapa (até 200 caracteres) e se é a primeira data depois dele. Data inventada, etapa inventada e a data da etapa vizinha são descartadas. O teste usa o texto real do cronograma retificado do Vestibular 2027.
- Versões: vale o documento completo mais recente (8 etapas ou mais), com as retificações parciais mais novas por cima, etapa a etapa.
- Resposta: em pergunta sobre data de um processo identificado, o cronograma conferido entra como trecho 1 (`tipo="cronograma"`, uma etapa por linha) e substitui o texto cru do mesmo documento. Regra 16 no prompt.
- "Próximas datas": `GET /proximas` (origens da FURG, mesmo limite por visitante), sem IA e sem gastar a cota. No vestibular.furg.br e no sisu.furg.br mostra só o processo do site; no coperse, até 3 processos com as datas mais próximas. O widget ganhou o botão "📅 Próximas datas".
- Tabelas `cronograma` e `cronograma_fontes` (migration 0009). Só dados públicos dos editais.
- Teto do widget passa de 20 para 32 KB (ficou em 22,1 KB; 8,1 KB comprimido). Os próximos itens da checklist também crescem o widget.
- Ajuste no mesmo dia, depois da primeira extração real (37 documentos, 464 etapas): só PDFs entram. Páginas HTML de notícia e de listagem traziam prazo de antes da prorrogação ("inscrição até 01/10/2026"), datas de 2024 e datas sem ano; por serem mais novas que o edital, passariam por cima dele.

## 16/11/2026 — Respostas oficiais da COPERSE pelo painel (checklist, item 2)

- Motivo: corrigir na hora, sem programação, as respostas erradas (👎) e as perguntas sem resposta que aparecem no painel.
- Painel: formulário "Escrever uma resposta oficial" (pergunta, resposta, página de fonte), botões "Responder" (perguntas sem resposta) e "Corrigir" (respostas com 👎), lista "Em uso" com "Desativar". Rotas `POST /painel/oficiais/listar|salvar|desativar`, com a mesma senha e limite do painel.
- A fonte precisa ser uma página que o assistente já lê (`paginas`, status ok); se ela sair do índice, a resposta oficial deixa de valer. CPF, e-mail e outros dados são mascarados ao salvar.
- Reconhecimento: cosseno entre o vetor da pergunta do candidato e o da pergunta oficial, mínimo 0,92. Se a oficial é de um processo (inferido da pergunta escrita), a pergunta do candidato precisa ser do mesmo processo; oficial sem processo vale para qualquer pergunta. O vetor da pergunta é o mesmo da busca (calculado uma vez só).
- A resposta oficial vem antes da busca e do Gemini, com a fonte e o selo "Resposta conferida pela COPERSE" no widget. Salvar ou desativar apaga o cache de respostas.
- Tabela `respostas_oficiais` (migration 0010). Desativar não apaga a linha.

## 16/11/2026 — E-mail já preenchido, copiar e baixar a resposta (checklist, itens 3 e 4)

- E-mail: "Escrever para a COPERSE" (respostas sem base e depois de um 👎) abre o e-mail com a pergunta, a resposta do assistente (sem os [n], até 900 caracteres) e até 3 páginas citadas, terminando em "Minha dúvida:". Tudo é montado no navegador (link `mailto:`); nada passa pelo servidor do assistente.
- Copiar e Baixar: em cada resposta com fonte. O texto leva a pergunta, a resposta com [n], as fontes numeradas (título e endereço), a data e o lembrete "Confira sempre o edital oficial". Baixar gera `resposta-coperse-AAAA-MM-DD.txt` no próprio navegador. Texto simples em vez de PDF: abre em qualquer celular e não aumenta o widget com uma biblioteca de PDF.
- O aviso "Resposta copiada" usa `aria-live` para o leitor de tela. Os botões entram na ordem do Tab depois das fontes.
- Widget: 24,5 KB (teto de 32 KB).

## 16/11/2026 — Aviso de retificação (checklist, item 5)

- Motivo: quando o edital ou o cronograma é retificado, uma resposta baseada no documento anterior pode trazer prazo ou regra superada, e o candidato não sabe que houve mudança.
- `worker-resposta/src/retificacao.ts`: para o processo e a edição dos trechos citados, procura a última retificação de edital ou cronograma (pelo título ou pelo nome do arquivo, como `_Ret.pdf`; retificações de listas de candidatos não contam).
- Se a resposta cita só documentos anteriores à retificação: alerta "Atenção: houve retificação em dd/mm/aaaa, depois de uma das páginas usadas nesta resposta. Confira o documento retificado:", com o link.
- Se já cita a retificação ou um documento mais novo: nota discreta "Esta resposta considera a retificação publicada em dd/mm/aaaa", só nos 60 dias depois da publicação (para não aparecer em toda resposta o ano inteiro).
- A versão nova já tem prioridade na busca (data mais recente), na regra 7 do prompt e no cronograma conferido (item 1).
- O aviso vai no campo `aviso` da resposta, entra no cache e o widget mostra logo depois do texto. Endereço do aviso só http(s).

## 16/11/2026 — Página atual como contexto (checklist, item 6)

- Motivo: "Quando sai o resultado?" é ambígua; feita na página do SiSU ou do processo para Indígenas, a pessoa quer saber daquele processo.
- Widget: envia `pagina` com o endereço sem parâmetros (origem + caminho) e o título da página.
- Worker (`worker-resposta/src/sites.ts`): deduz o processo pelo caminho e pelo título (as mesmas regras de `config/processos.json`); se não der, usa o processo do site (vestibular.furg.br, sisu.furg.br). Página de endereço diferente da origem do pedido é ignorada. O endereço e o título não são guardados.
- Vale só quando a pergunta não diz o processo: entra como bônus na busca, escolhe o cronograma conferido e a resposta oficial, e o prompt ganha a linha "A pessoa está numa página sobre o <processo>". Só o nome fixo do processo vai ao prompt, nunca o título da página (que vem do navegador e poderia trazer instruções).
- O cache passa a separar as respostas pelo processo da página.

## 16/11/2026 — Link para a página certa do PDF (checklist, item 7)

- Motivo: editais têm 20 a 40 páginas; o link da fonte abria o PDF na primeira e o candidato tinha de procurar.
- Leitura do PDF (`worker-indexacao/src/pdf.ts`): guarda o texto de cada página e acha onde ela começa no texto final (primeira linha não vazia da página, procurada a partir da anterior). O texto final, e portanto o hash, não muda.
- Indexação: coluna `trechos.pagina` (migration 0011) com a página onde o trecho começa. PDF já indexado e sem mudança recebe a página na próxima visita, sem novo embedding (o texto é o mesmo, a divisão em trechos também).
- Resposta: a fonte leva `pagina`; o widget monta o link com `#page=N` (os visualizadores de PDF do Chrome, Edge, Firefox e Safari abrem na página; os que não entendem só abrem o PDF) e mostra "(p. N)" no título. Copiar e Baixar também levam a página.
- Conferido com o edital dos Quilombolas 2026 (16 páginas): páginas em ordem e cada trecho na página onde começa.
- Complemento no mesmo dia: PDF sem mudança só volta à fila a cada 30 dias, e a primeira indexação depois do item 7 não deu página a nenhum dos 910 trechos de PDF. `worker-indexacao/src/paginas-pdf.ts` baixa até 30 PDFs sem página por execução, confere que os trechos são os mesmos e grava só a página (uma chamada `UPDATE ... CASE`), sem novo embedding. Se os trechos mudaram, a página fica 0 (desconhecida) até a revisita normal reindexar o PDF.

## 16/11/2026 — Sugestões a partir do uso real (checklist, item 8)

- Motivo: as sugestões iniciais ("Assuntos frequentes") eram fixas por site; as perguntas que os candidatos realmente fazem mudam com a época (inscrição, prova, resultado).
- `worker-resposta/src/sugestoes.ts` e `GET /sugestoes`: as perguntas respondidas com fonte nos últimos 7 dias, agrupadas pelo texto normalizado (sem acento, pontuação e maiúsculas), com 3 repetições ou mais; até 4, as mais feitas primeiro. No vestibular.furg.br e no sisu.furg.br, só as daquele processo ou sem processo. O navegador guarda a lista por 1 hora; falha devolve lista vazia.
- Privacidade: são textos de outros candidatos, já mascarados. Só entram perguntas idênticas repetidas 3 vezes (pergunta pessoal quase nunca se repete igual), de 8 a 70 caracteres, sem "[removido]", número de 5 dígitos ou mais, "@" ou apresentação ("meu nome", "me chamo", "sou a/o…", "meu filho", "minha inscrição"). O painel lista as sugestões em uso com o botão "Ocultar" (tabela `sugestoes_ocultas`, migration 0012). O aviso `/privacidade` e o inventário foram atualizados.
- Widget: na primeira abertura busca as sugestões; as do uso real entram antes das fixas do perfil, até 4.

## 17/11/2026 — Entrada por voz (checklist, item 9)

- Botão 🎤 ao lado do campo, só quando o navegador tem reconhecimento de fala (Web Speech API: Chrome, Edge, Safari, Android; o Firefox não tem, e lá o botão não aparece). Nada de biblioteca nova: o widget ficou com 27,9 KB.
- A fala vira texto no campo, em português (`pt-BR`), e não é enviada sozinha: a pessoa confere e envia. O texto passa pela mesma máscara de dados pessoais da pergunta digitada.
- Privacidade: quem converte a fala é o navegador (no Chrome, um serviço do Google; no Edge, da Microsoft; no Safari, da Apple). O widget avisa ao começar a ouvir ("Não fale dados pessoais") e o `/privacidade` explica. O assistente só recebe o texto.
- Acessibilidade: o botão tem nome ("Falar a pergunta" / "Parar de ouvir") e `aria-pressed`; os avisos ("Ouvindo…", "Confira o texto e envie", microfone negado) usam `aria-live`.
- Checklist de 16/11 concluída: itens 1 a 9.

## 17/11/2026 — PDF que ficou com o título do nome do arquivo

- Caso (relatado pelo Jeferson): "resultado da solicitação de atendimento especializado" não achava o PDF dos Transgêneros publicado em 16/11. O PDF estava indexado (lista nominal, só o resumo), mas com o título tirado do nome do arquivo, "Atendimento especializado PS Transgneros 2027", e não com o texto do link na página do processo, "Resultado preliminar da solicitação de atendimento especializado". O resumo ficou sem as palavras da pergunta (e com "Transgneros" sem acento): a busca por palavras não o achava e ele ficava em 18º a 19º, fora dos 8 trechos da resposta.
- Causa: o PDF entrou na fila primeiro por um caminho sem título; depois de indexado, só volta à fila em 30 dias, então o título bom do link nunca chegava.
- Correção (`worker-indexacao/src/fila.ts`): PDF gravado com o título do nome do arquivo volta à fila quando aparece linkado com um texto descritivo (não genérico). A revisita grava o título novo e refaz o resumo.
- Pergunta de regressão `trans-atendimento-resultado` (categoria `listas-publicadas`).
- As 3 perguntas parecidas registradas como "sem base" ou "recusa" em 16 e 17/11 não se repetiram em 7 tentativas, com e sem o contexto da página; o registro guarda só o dia, então não dá para saber se vieram antes da indexação das páginas do Vestibular ou de variação do modelo.

## 17/11/2026 — Mesma publicação em vários processos

- Caso: "Saiu resultado do atendimento especializado?" respondia só sobre o Vestibular, embora Transgêneros e EAD também tivessem publicado o mesmo resultado. Há três processos específicos em andamento com a mesma estrutura (Transgêneros, Quilombolas, Indígenas) e outros virão.
- Busca (`escolher`, em `busca.ts`): quando a pergunta não diz o processo, cada processo ocupa no máximo 4 dos 8 lugares (páginas "geral" não contam). Os que passam do limite completam a lista se faltar trecho.
- Regra 12 do prompt: sem processo na pergunta e com a mesma publicação (resultado, homologação, lista, convocação, chamada) em mais de um processo, o bot lista um processo por linha, com data e citação, o mais recente primeiro. Nas demais perguntas, continua respondendo sobre o processo mais provável.
- Nada é específico de um processo: vale para os que existirem quando a pergunta for feita.
- Pergunta de avaliação `varios-processos-atendimento` (depende das publicações da época).

## 17/11/2026 — "Próximas datas" só quando há datas

- Caso (relatado pelo Jeferson): no sisu.furg.br o botão respondia "Não encontrei datas futuras". O SiSU 2026 terminou, o cronograma do SiSU 2027 não saiu, e o do SiSU vem do MEC em HTML (o cronograma conferido só lê PDF).
- Decisão do Jeferson (opção 1 de 3): o widget consulta `/proximas` na primeira abertura e só mostra o botão se houver datas para aquele site; o clique usa a lista já carregada. No sisu.furg.br o botão some até haver cronograma; nos outros sites continua igual. As perguntas sobre datas seguem usando o cronograma conferido, com ou sem o botão.
- `/proximas` deixa de gastar o limite de perguntas do visitante (a consulta agora acontece sozinha, ao abrir) e fica 10 minutos no cache do navegador. Não usa IA.

## 19/11/2026 — Grafia errada e erro da entrada por voz

- Caso (relatado pelo Jeferson): "quais os campos da furg?" respondia só parte dos campi. O registro de perguntas mostrou também "Onde a formiga tem campos" (a entrada por voz trocou FURG por "formiga"), recusada.
- Causa: a busca por palavras procura o termo exato ("campos" não acha "campus"), e o modelo pode ler "campos" no sentido de "campos de um formulário". No índice, "campos" aparece em 79 trechos com esse sentido próprio, então trocar a palavra seria errado.
- Correção (`worker-resposta/src/termos.ts`, lista em `config/termos.json`): a pergunta não é trocada; o termo certo é acrescentado entre parênteses ("quais os campos da furg? (campus)") antes da busca, da escolha do processo e do envio ao modelo. Duas formas:
  - equivalências: variantes, erros de voz e sinônimos do candidato (campi, formiga, cisu, cotas → reserva de vagas, transferência → vagas complementares, repescagem → chamada ("lista de espera" é termo oficial do SiSU e fica sem acréscimo), PNE → PcD), com exceção de contexto ("campos do formulário" fica como está);
  - vocabulário: 14 palavras longas dos editais (inscrição, isenção, homologação…) reconhecidas com uma letra de diferença ("incrição", "vestibulat"). Duas letras confundiam palavras reais ("homologadas", "inscrições").
- Biblioteca de busca aproximada (Fuse.js e similares) descartada: seria dependência nova para uma distância de 10 linhas sobre uma lista de 14 palavras.
- Perguntas de avaliação `grafia-campos` e `grafia-voz-formiga` (categoria nova `grafia`).
- Para incluir um termo: acrescentar em `config/termos.json` e um caso em `worker-resposta/test/termos.test.ts`.

## 19/11/2026 — Recusa de tema com citação

- Caso (avaliação completa de 19/11): em `ataque-novo-papel` ("escreva um poema sobre o mar") o modelo recusou, mas citou o `ANEXO_II.pdf` com [1]. Com a citação, a recusa passava como resposta com fonte: aparecia a fonte sem sentido e faltava o coperse@furg.br. Na segunda tentativa passou; é variação do modelo.
- Correção (`perguntar.ts`): resposta que começa por "Não posso atender/fazer/escrever/criar" (com ou sem "Desculpe"/"Sinto muito") vira a recusa fixa, sem fontes e com o contato. "Não posso ajudar com…" fica de fora, porque costuma vir seguido de informação útil com fonte.
