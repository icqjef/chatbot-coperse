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

- `POST /perguntar`: recebe `{ pergunta, historico }` do widget; só aceita as origens de `config/origens.json` e limita as perguntas por visitante.
- `GET /saude`: `{ ok, ultima_indexacao: { inicio, fim, paginas, erros } | null, fila, paginas_ok }`; responde 503 `{ ok: false }` se o D1 falhar.
- `POST /reindexar`: com `Authorization: Bearer <REINDEX_TOKEN>`, dispara o workflow de indexação no GitHub (resposta 202). Exemplo: `curl -X POST -H "Authorization: Bearer $SENHA" https://<worker>/reindexar`.
- `GET /widget.js`: o script do widget.

Variáveis (em `worker-resposta/wrangler.toml`): `PROVEDOR_LLM`, `MODELO_RESPOSTA`, `MODELO_EMBEDDING`, `DIMENSAO_EMBEDDING`, `LIMIAR_SIMILARIDADE`, `GITHUB_REPO`, `GITHUB_WORKFLOW`.

Segredos: `GEMINI_API_KEY`, `REINDEX_TOKEN` (senha longa, no mínimo 32 caracteres; se faltar ou for menor, a rota `/reindexar` fica desativada e responde 503) e `GITHUB_TOKEN`. Cadastre-os no painel do Cloudflare: Workers & Pages, chatbot-coperse, Settings, Variables and Secrets, tipo Secret. Nunca coloque segredos no código nem no chat.

Token do GitHub de escopo mínimo: em GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens; escolha apenas este repositório e a permissão Repository permissions, Actions: Read and write.

## Documentos

- Projeto: [docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md](docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md)
- Decisões: [docs/decisoes.md](docs/decisoes.md)
- Briefing original: [CLAUDE.md](CLAUDE.md)
