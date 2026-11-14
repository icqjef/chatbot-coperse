# Etapa 8 — Segurança, documentação e publicação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar o bot pronto para ser colado nos três sites: CPU dentro do plano gratuito, listas de nomes barradas também pelo conteúdo, revisão de segurança feita, e guias para a COPERSE, o CGTI e a administração do vestibular.

**Architecture:** duas correções de código (busca sem metadados do Vectorize; detecção de lista pelo cabeçalho do PDF), uma revisão de segurança do repositório inteiro com correções, e documentos em `docs/`. A colagem nos sites é feita pelo Jeferson e pela pessoa que administra o vestibular.furg.br.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers/D1/Vectorize, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md` (seções 5, 6 item 8, 7 R1–R6)

## Global Constraints

- O Worker só aceita chamadas dos domínios autorizados da FURG (`config/origens.json`).
- Segredos só no Cloudflare e no GitHub; nunca em código, log, teste ou documento.
- `/reindexar` exige senha longa (mínimo 32 caracteres).
- Limite por visitante (6/min) e cota diária (1.000) continuam.
- Não coletar CPF nem nome; registros sem identificação.
- Nunca propor mudanças ao CGTI nem recursos fora do Joomla nativo; só colar o script num módulo HTML personalizado.
- Documentos para a COPERSE em português do Brasil, sem jargão, com passos numerados.

## Review Focus

- Pergunta comum com 20 vetores e metadados: CPU por chamada abaixo de 10 ms na média (medir com `wrangler tail` depois do deploy).
- PDF com título neutro ("Resultado", "Baixar") cujo texto começa com "Nº INSCRIÇÃO NOME" e linhas de nomes: vira lista (só resumo).
- PDF de edital que cita "nome" e "inscrição" no corpo: continua indexado com o conteúdo.
- Pedido ao `/perguntar` sem `Origin`, com `Origin` de outro domínio, com corpo de 1 MB: 403/403/413, sem gastar Gemini.
- Guia de operação seguido por quem nunca viu o projeto: dá para conferir a saúde, reindexar e trocar a chave sem colar segredo em lugar nenhum.

---

### Task 1: Busca sem metadados do Vectorize

**Files:** `worker-resposta/src/busca.ts` (chamada `vectorize.query`), `worker-resposta/test/busca.test.ts`

- [ ] Teste: `buscarTrechos` chama `vectorize.query` com `returnMetadata: 'none'` (e `returnValues` ausente ou `false`); o resultado continua igual, porque título, URL, data, processo e ano vêm do D1.
- [ ] Implementar; conferir que nada no Worker lê `match.metadata`.
- [ ] `npm test` e `npm run typecheck`; commit `perf(busca): não pede metadados ao Vectorize`.

### Task 2: Lista de nomes detectada pelo cabeçalho do PDF

**Files:** `comum/src/classificar.ts` (função nova), chamada no indexador onde o texto do PDF já existe (`worker-indexacao/src/principal.ts`, ramo PDF), testes em `comum/test/classificar.test.ts` e `worker-indexacao/test/principal.test.ts`

**Interfaces:**
- Produces: `export function pareceListaDeNomes(texto: string): boolean`. Verdadeiro quando, nos primeiros 4000 caracteres: (a) há um cabeçalho de tabela com "inscrição" e "nome" na mesma linha (sem acento, sem diferenciar maiúsculas, ex.: `Nº INSCRIÇÃO NOME`, `INSCRIÇÃO | NOME`, `NOME ... INSCRIÇÃO`); ou (b) pelo menos 8 linhas no formato número seguido de 2 ou mais palavras em maiúsculas (`87 CINTIA LEVI DE FARIA`).

- [ ] Testes: o trecho real "Nº INSCRIÇÃO NOME\n329 ALINE DAIANE SCHEIBLER\n300 ANA CARLA PEREIRA" → true; 8 linhas `123 NOME SOBRENOME` sem cabeçalho → true; início do edital do Vestibular 2027 ("3.4. A pessoa candidata poderá se inscrever... nome social...") → false; tabela de vagas ("Medicina 34 vagas") → false.
- [ ] No indexador, PDF cujo texto `pareceListaDeNomes` vira `tipo='lista'` (só resumo), como os PDFs marcados pela regra do link. Teste no nível do indexador com PDF de título "Resultado final" neutro e texto de lista.
- [ ] `npm test`, `npm run typecheck`; commit `fix(indexacao): lista de nomes também pelo conteúdo do PDF`.

### Task 3: Revisão de segurança e correções

Revisor (modelo mais capaz) lê o repositório inteiro com foco nas Global Constraints e no Review Focus: CORS/origens, validação de entrada, limites, `/reindexar`, `/saude`, segredos em logs e no CI, dados pessoais (máscara, logs, `sessionStorage` do widget), widget sem `innerHTML`, dependências e ações do GitHub fixadas por versão, permissões dos workflows (`permissions:` mínimos), token do GitHub com escopo mínimo. Saída: `docs/revisao-seguranca-2026-11.md` com achados, gravidade e decisão. Achados Críticos e Importantes são corrigidos numa única onda por um implementador, com testes.

### Task 4: Documentos

**Files:** `README.md` (atualizar), `docs/guia-instalacao.md`, `docs/guia-operacao.md`, `docs/aviso-cgti.md`, `docs/pedido-vestibular.md`

- `guia-instalacao.md`: colar o script em coperse.furg.br e sisu3.furg.br (módulo Personalizado, editor "Nenhum", posição em todas as páginas, conferir com Ctrl+U), cor por site, o que fazer se o `<script>` sumir; e a troca sisu3 → sisu (editar `config/sites.json` e `config/origens.json` por PR).
- `guia-operacao.md` (para a COPERSE, sem jargão): conferir `/saude`; o e-mail de falha do GitHub e o que fazer; reindexar pelo GitHub (Actions → indexar → Run workflow) e pelo `/reindexar`; trocar a chave do Gemini (Cloudflare e GitHub, pelo site, nunca colar em chat); alerta de orçamento no Google Cloud; rodar as perguntas de referência (`node avaliacao/avaliar.mjs`) e atualizar `avaliacao/perguntas.json` a cada novo edital; limites (6/min, 1.000/dia) e o que o candidato vê; o que o bot guarda (nada além da conversa no navegador).
- `aviso-cgti.md`: texto pronto para o Jeferson enviar: domínio do Worker, o que o script faz (abre um painel, envia só a pergunta digitada para o Worker), o que não faz (não lê a página, não usa cookies, não coleta dados pessoais), onde roda e quem mantém. Sem pedir nenhuma mudança ao CGTI.
- `pedido-vestibular.md`: mensagem para a pessoa que administra o vestibular.furg.br: a linha do script, onde colar (antes de `</body>` em todas as páginas; em app React/Next, no layout raiz, sem ser removido na navegação), e as perguntas pendentes (plataforma, feed).
- [ ] Commit `docs: guias de instalação e operação, aviso ao CGTI e pedido ao vestibular`.

### Task 5 (controlador): medir e publicar

- [ ] Depois do deploy, rodar `node avaliacao/avaliar.mjs` com `wrangler tail`: portão 100% e CPU média abaixo de 10 ms.
- [ ] Entregar ao Jeferson os passos de colagem e os textos do CGTI e do vestibular.
- [ ] Registrar em `docs/decisoes.md`.
