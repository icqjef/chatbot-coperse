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
