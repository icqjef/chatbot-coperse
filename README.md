# Chatbot COPERSE

Chatbot de perguntas e respostas (padrão RAG) para candidatos de processos seletivos da FURG. Responde apenas com base no conteúdo publicado em coperse.furg.br, vestibular.furg.br e sisu3.furg.br, sempre citando a página de origem, e indexa sozinho as publicações novas. Roda na Cloudflare (plano gratuito) com Gemini; o widget é um único script colado nas páginas.

## Estrutura

```
worker-indexacao/   indexador (Node, GitHub Actions)        [a criar]
worker-resposta/    Worker Cloudflare de resposta           [a criar]
widget/             fonte do widget (gera um único .js)     [a criar]
comum/              tipos, configuração e código compartilhado
config/             sites.json e origens.json
avaliacao/          perguntas de referência                 [a criar]
docs/               decisões, especificações e guias
```

## Testes

Requer Node 22 (ver `.nvmrc`).

```
npm install
npm test            # testes de todos os pacotes
npm run typecheck   # tsc -b
```

## Indexação

O workflow `.github/workflows/indexar.yml` roda a cada 2 horas e rastreia os três sites de `config/sites.json` por uma fila no banco D1 (tabela `fila`):

- **Sementes:** os itens do feed RSS de cada site (coperse e sisu3) e as `paginas_chave` (a página inicial de cada site) entram na fila em toda execução.
- **Rastreamento:** cada página lida tem seus links do mesmo domínio enfileirados, até `profundidade` níveis (10). Páginas HTML são revisitadas depois de 20 horas e PDFs depois de 30 dias; o que não mudou não é reprocessado. PDFs são lidos com o `unpdf` (até 15 MB; PDF escaneado fica como `vazia`).
- **Orçamento por execução:** no máximo `LIMITE` itens (padrão 400) e `PRAZO_MINUTOS` minutos (padrão 25). O que sobrar continua na fila e é processado nas execuções seguintes.
- **Teto de vetores:** a indexação para ao chegar a `TETO_VETORES` vetores no índice (6000). O resumo mostra `teto_atingido: true`; veja em [docs/decisoes.md](docs/decisoes.md) o que fazer.
- **Falhas:** são adiadas com espera crescente; uma página só sai do índice depois de três respostas 404/410 seguidas.

O resumo de cada execução aparece no log em JSON: contagens (`nova`, `alterada`, `igual`, `vazia`, `erro`, `teto`, `ignorada`, `removida`), `teto_atingido`, `fila_restante` e as URLs com erro.

### Regras de classificação

Dois arquivos em `config/` controlam como cada documento é marcado. Os padrões são expressões regulares aplicadas ao título e ao caminho da URL já normalizados: minúsculas, sem acentos, com `-`, `_`, `/` e `.` trocados por espaço.

- `config/processos.json`: lista de `{ "processo": "...", "padroes": [...] }`. Vale o primeiro processo que casar, por isso os mais específicos (quilombolas, indígenas...) vêm antes de `sisu` e `vestibular`. Para criar um processo novo, acrescente uma entrada antes das genéricas. Sem casamento, vale o processo do documento que trouxe o link, depois o `processo_padrao` do site, depois `geral`.
- `config/listas.json`: `padroes` reconhecem listas nominais (resultado, homologação, chamada...), que são indexadas só com título, data e link; `excecoes` impedem isso (um título que começa com "Edital" ou "Anexo", por exemplo). Se um documento importante estiver virando lista por engano, acrescente uma exceção; se uma lista estiver sendo indexada inteira, acrescente um padrão.

Em JSON a barra invertida é escrita dobrada (`"\\bsisu\\b"`). Os testes (`npm test`) conferem que os arquivos carregam.

Para rodar na hora: GitHub, aba Actions, workflow `indexar`, Run workflow, e informe `limite` (itens) e `minutos` se quiser outros valores. Os segredos `CLOUDFLARE_API_TOKEN` e `GEMINI_API_KEY` e as variáveis `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` e `VECTORIZE_INDICE` ficam nas configurações do repositório. Um segundo job (`workflow-keepalive`) evita que o GitHub desligue o agendamento por inatividade.

## Worker de resposta

`worker-resposta/` é o Worker Cloudflare que responde às perguntas (busca nos trechos indexados, Gemini e citação da fonte).

Rotas:

- `POST /perguntar`: recebe `{ pergunta, historico }` do widget; só aceita as origens de `config/origens.json`. Responde 429 acima de `LIMITE_POR_MINUTO` perguntas por minuto do mesmo visitante ou acima de `COTA_DIARIA` perguntas no dia (todos os visitantes somados, zera à meia-noite de Brasília). Os dois contadores ficam no Durable Object `Limites`.
- `GET /saude`: `{ ok, ultima_indexacao: { inicio, fim, paginas, erros } | null, fila, paginas_ok }`; responde 503 `{ ok: false }` se o D1 falhar.
- `POST /reindexar`: com `Authorization: Bearer <REINDEX_TOKEN>`, dispara o workflow de indexação no GitHub (resposta 202). Exemplo: `curl -X POST -H "Authorization: Bearer $SENHA" https://<worker>/reindexar`.
- `GET /widget.js`: o script do widget.

Variáveis (em `worker-resposta/wrangler.toml`): `PROVEDOR_LLM`, `MODELO_RESPOSTA`, `MODELO_EMBEDDING`, `DIMENSAO_EMBEDDING`, `LIMIAR_SIMILARIDADE`, `GITHUB_REPO`, `GITHUB_WORKFLOW`, `LIMITE_POR_MINUTO` (padrão 6), `LIMITE_DIARIO_VISITANTE` (padrão 40 perguntas por visitante por dia), `COTA_DIARIA` (padrão 1000).

Segredos: `GEMINI_API_KEY`, `REINDEX_TOKEN` (senha longa, no mínimo 32 caracteres; se faltar ou for menor, a rota `/reindexar` fica desativada e responde 503) e `GITHUB_TOKEN`. Cadastre-os no painel do Cloudflare: Workers & Pages, chatbot-coperse, Settings, Variables and Secrets, tipo Secret. Nunca coloque segredos no código nem no chat.

Token do GitHub de escopo mínimo: em GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens; escolha apenas este repositório e a permissão Repository permissions, Actions: Read and write.

## Widget

O assistente é um único script, que o Worker entrega em `/widget.js`. O código fica em `widget/src`; `npm run build -w widget` gera `worker-resposta/src/widget-gerado.ts` (não editar à mão; o GitHub confere que está atualizado).

### Colar no Joomla (coperse e sisu)

1. No painel do Joomla, vá em Extensões, Módulos, Novo, e escolha o tipo "Personalizado" (Custom).
2. No módulo, use o botão "Alternar editor" (Toggle Editor) para ver o código em texto puro. O editor padrão de cada usuário é escolhido em "Editar conta", "Configurações básicas", Editor; "Nenhum" ou CodeMirror são os mais seguros, porque o editor visual (TinyMCE) pode alterar o `<script>`.
3. Cole este código, sem mudar nada:

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" data-cor="#8b0000" defer></script>
```

4. Em "Posição", escolha uma posição que apareça em todas as páginas do modelo (rodapé, por exemplo). Em "Atribuição de menu", marque "Em todas as páginas". Deixe "Mostrar título" em "Ocultar" e salve.
5. Confira depois de salvar: abra o módulo de novo e veja se a linha `<script ...>` continua lá. Também dá para abrir uma página do site e apertar Ctrl+U (código-fonte) e procurar por `widget.js`.
6. Se a linha sumiu, foi o filtro de texto do Joomla para o seu grupo de usuário. Peça a um Super Usuário do site para salvar o módulo com o script, ou para marcar "Sem filtragem" para o seu grupo em Configuração Global, Filtros de texto (só um Super Usuário consegue fazer isso).

### Cor (`data-cor`)

`data-cor` é opcional e define a cor do botão e do cabeçalho. No coperse use `#8b0000` (vinho). No SiSU, omita o atributo: o padrão é o azul `#1f5fbf`. Se a cor for inválida ou clara demais (o texto branco ficaria difícil de ler), o widget usa o azul padrão.

### Vestibular

O vestibular.furg.br é administrado por outra pessoa. Envie a ela o mesmo código acima (com o `data-cor` que combine com o site, ou sem ele) e peça para colar em um módulo ou bloco de HTML que apareça em todas as páginas, antes do `</body>` se houver essa opção.

### Testar

Abra `https://chatbot-coperse.coperse-furg.workers.dev/demo`: é uma página só com o assistente, para testar sem mexer em nenhum site. O widget não coleta dados pessoais; a conversa fica só na aba do navegador e some ao fechá-la.

## Documentos

- Projeto: [docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md](docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md)
- Decisões: [docs/decisoes.md](docs/decisoes.md)
- Instalação nas páginas (Joomla): [docs/guia-instalacao.md](docs/guia-instalacao.md)
- Operação do dia a dia (COPERSE): [docs/guia-operacao.md](docs/guia-operacao.md)
- Aviso ao CGTI (só informativo): [docs/aviso-cgti.md](docs/aviso-cgti.md)
- Pedido ao vestibular.furg.br: [docs/pedido-vestibular.md](docs/pedido-vestibular.md)
- Revisão de segurança: [docs/revisao-seguranca-2026-11.md](docs/revisao-seguranca-2026-11.md)
- Briefing original: [CLAUDE.md](CLAUDE.md)
