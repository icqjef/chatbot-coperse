# Briefing para o Claude Code: Chatbot COPERSE, Vestibular e SiSU

## Missão

Construir um chatbot de perguntas e respostas, no padrão RAG, que roda como um único script colado nas páginas coperse.furg.br, vestibular.furg.br e sisu3.furg.br (que passará a ser sisu.furg.br). O bot responde a candidatos de processos seletivos da FURG usando apenas o conteúdo publicado nesses sites e aprende sozinho as publicações novas.

## Restrições do ambiente

- O responsável é Jeferson, técnico-administrativo da FURG na COPERSE. Ele edita o coperse e o sisu3 como Administrator do Joomla, sem acesso ao código-fonte e sem poder instalar plugin.
- O CGTI autoriza colar script nas páginas. Alterações no Joomla além disso não são autorizadas: nunca propor mudanças no CGTI nem em recursos fora do Joomla nativo.
- O vestibular.furg.br é outro site, administrado por outra pessoa. Jeferson tem contato com ela e consegue pedir para colar o script. A tecnologia desse site é desconhecida.
- O bot não pode rodar na máquina do Jeferson. Tem de ficar sempre no ar na web.
- Regra de método: antes de construir qualquer parte, procurar no GitHub um projeto parecido, bem avaliado e funcionando, e adaptar em vez de criar do zero. Registrar no arquivo de decisões o que foi escolhido e por quê. Não inventar citações, números nem preços: conferir em fonte oficial.

## Decisões tomadas

- Hospedagem: Cloudflare Workers, com índice vetorial (Vectorize) e gatilho agendado (cron).
- Modelo de linguagem: Gemini, família Flash, para respostas e embeddings. Mantenha o provedor trocável por variável de ambiente.
- Widget: um único arquivo JavaScript, leve e acessível, colado num módulo HTML personalizado do Joomla.
- Endereços dos sites ficam numa lista configurável, nunca fixos no código, porque o sisu3 vai virar sisu.
- Cada trecho indexado leva metadados: site de origem, endereço, título e data. Em conflito entre páginas, prevalece a mais recente e o bot informa a data.

## Descoberta de conteúdo

- Nenhum dos três sites tem sitemap (confirmado pelo Jeferson).
- coperse.furg.br: feeds do Joomla funcionam, em RSS e em Atom. Endereço: index.php?format=feed&type=rss ou type=atom.
- sisu3.furg.br: o feed funciona, no mesmo padrão.
- vestibular.furg.br: o feed dá erro. Usar lista fixa de páginas-chave mais seguimento de links a partir delas, dentro do mesmo domínio, com limite de profundidade. Pedir à pessoa que administra o site para informar a plataforma e se o feed pode ser ativado.
- O feed costuma trazer só os itens mais recentes e, às vezes, apenas o resumo. Usá-lo como aviso de mudança e abrir a página completa para indexar. Partes importantes dos editais estão em PDF: planejar a leitura de PDF.
- Carga inicial: lista fixa de páginas-chave (Vestibular, SiSU e editais em andamento).

## Regras de comportamento do bot

- Responder somente com base nos trechos recuperados e sempre citar a página de origem.
- Se não achar a informação, não inventar: orientar o candidato a consultar o edital oficial ou escrever para coperse@furg.br.
- Não opinar sobre situação individual (homologação, recurso, nota); encaminhar ao sistema de inscrição ou à COPERSE.
- Recusar com educação perguntas fora do tema dos processos seletivos da FURG.
- Orientar o candidato a não digitar dados pessoais. Não coletar CPF nem nome. Eventuais registros de perguntas ficam sem identificação.

## Custos e limites verificados

- Cloudflare Workers, plano gratuito: 100 mil requisições por dia e 10 milissegundos de CPU por chamada. Plano pago: mínimo de US$ 5 por mês, com 10 milhões de requisições e 30 milhões de milissegundos de CPU incluídos, e até 15 minutos de CPU por execução agendada. Conclusão provisória: responder cabe no gratuito, mas a indexação provavelmente exige o plano pago. Confirmar os limites do Vectorize e da página de limites antes de decidir.
- Gemini API: contas novas começam no nível gratuito, com limites por modelo. Para sair dele é preciso vincular conta de cobrança e pré-pagar no mínimo US$ 5. Com saldo zero, todas as chaves da conta param. Ligar a recarga automática com teto mensal. O crédito de boas-vindas de US$ 300 do Google Cloud não vale para a API do Gemini.
- Conferir os limites por modelo na página de limites do AI Studio.

## Equipe de agentes e etapas

Use subagentes, um por papel. Nenhuma etapa avança sem o aceite do Jeferson.

1. Arquiteto: fecha decisões, custos e limites, e mantém o arquivo de decisões.
2. Engenheiro de Dados: lê feeds, páginas e PDFs, limpa o HTML, divide em trechos com metadados. Entrega o Worker de indexação com testes.
3. Engenheiro de Recuperação: embeddings, índice vetorial, busca híbrida (significado mais palavras-chave), prioridade ao conteúdo recente.
4. Engenheiro de Prompts e Respostas: aplica as regras de comportamento, citação de fontes e recusa sem base.
5. Engenheiro de Interface: widget acessível e responsivo, em um único script.
6. Engenheiro de Qualidade: conjunto de perguntas de referência conferidas com os editais, testes de regressão e de carga. Portão: respostas sobre datas, vagas e prazos precisam passar integralmente antes de publicar.
7. Engenheiro de Segurança e Operações: origens permitidas, segredos, limite de uso, alerta de custo, monitoramento.
8. Redator Técnico: README, guia de instalação, guia de operação para a COPERSE e registro de decisões.

## Estrutura do repositório

Repositório privado e exclusivo do projeto, com as pastas: worker-indexacao, worker-resposta, widget, config, avaliacao e docs. Ramo principal protegido, alterações por pull request, testes automáticos a cada alteração, publicação automática no Cloudflare a partir do ramo principal, segredos apenas no Cloudflare, nunca no código, e um arquivo de decisões com data e motivo.

## Segurança

O Worker só aceita chamadas dos domínios autorizados da FURG. Chaves ficam como segredos do Cloudflare. O endereço de reindexação manual exige senha longa. Limite de perguntas por visitante e por minuto. Avisar o CGTI do domínio do Worker e do que o script faz.

## Primeiras tarefas para o Claude Code

1. Pedir ao Jeferson o nome do repositório e confirmar que a conta Cloudflare e a chave do Gemini existem (ele cria; nunca peça que cole chaves no chat ou no código).
2. Criar a estrutura de pastas, o CLAUDE.md, o README inicial e o arquivo de decisões.
3. Pesquisar no GitHub projetos de referência para o indexador e para o Worker de resposta em Cloudflare. Pontos de partida já vistos: rootsongjc/rag-chatbot (Cloudflare Workers, Vectorize e Gemini, mas lê Markdown de um repositório), raksbisht/sitechat (MIT, multi-site, recrawl agendado, mas pesado demais) e awais1221/ai-rag-chatbot e UmairStn/rag-chatbot (não verificados). Registrar a escolha no arquivo de decisões.
4. Construir o indexador lendo o feed do coperse e testar com cinco notícias reais.
5. Montar as primeiras 30 perguntas de referência, com resposta correta e página de origem, a partir dos editais em andamento.

## Estilo de trabalho

Mais ação e menos conversa. Entregar passos pequenos e verificáveis, com testes, e perguntar ao Jeferson só o que bloqueia o avanço. Responder em português do Brasil.

## Mudanças aprovadas

O projeto mudou em alguns pontos em relação ao briefing acima (indexação no GitHub Actions, repositório público, Cloudflare gratuito, Gemini pelos créditos da assinatura AI Pro, pasta `comum/`). Onde houver conflito, vale `docs/decisoes.md`, que registra cada mudança com data e motivo. O projeto está descrito em `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md`.
