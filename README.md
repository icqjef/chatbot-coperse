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

O workflow `.github/workflows/indexar.yml` roda a cada 2 horas e lê o feed de cada site que tem `feed` em `config/sites.json`, indexando os primeiros itens (padrão 20). Páginas sem mudança são ignoradas. O resumo da execução (contagens e URLs com erro) aparece no log.

Para rodar na hora: GitHub, aba Actions, workflow `indexar`, Run workflow, e informe `limite` se quiser outro número. Os segredos `CLOUDFLARE_API_TOKEN` e `GEMINI_API_KEY` e as variáveis `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` e `VECTORIZE_INDICE` ficam nas configurações do repositório.

## Documentos

- Projeto: [docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md](docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md)
- Decisões: [docs/decisoes.md](docs/decisoes.md)
- Briefing original: [CLAUDE.md](CLAUDE.md)
