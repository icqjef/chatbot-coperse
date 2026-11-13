# Etapa 6 — Widget: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`).

**Objetivo:** um único script (`/widget.js`, servido pelo Worker) que mostra o botão e o painel do chatbot nos três sites, conforme a maquete aprovada.

**Arquitetura:** novo workspace `widget/` em TypeScript sem dependências de execução. O esbuild gera um IIFE minificado, que vira a string exportada em `worker-resposta/src/widget-gerado.ts` (arquivo gerado, versionado). O Worker serve essa string em `/widget.js`. O widget monta tudo dentro de um Shadow DOM e conversa com `POST /perguntar` na mesma origem de onde o script foi carregado.

**Tecnologia:** TypeScript, esbuild, Vitest com happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-12-chatbot-coperse-design.md`, seção 5.6. Maquete aprovada: `docs/maquete-widget.html`.

## Restrições globais

- Colagem: `<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" data-cor="#8b0000" defer></script>`. `data-cor` é opcional; o padrão é `#1f5fbf` (azul, decisão do Jeferson em 2026-11-13).
- Tamanho: `widget.js` minificado com no máximo 15 360 bytes (15 KB).
- JavaScript puro, sem bibliotecas no navegador, CSS só dentro do Shadow DOM, tamanhos em `px` (o `rem` do Joomla não pode afetar o widget).
- Textos exatos (aprovados na maquete):
  - botão: `Dúvidas? Pergunte aqui`
  - título: `Assistente COPERSE`; subtítulo: `Respostas com base nas páginas oficiais da FURG`
  - aviso: `Não digite CPF, nome ou outros dados pessoais.`
  - boas-vindas: `Olá! Tire dúvidas sobre o Vestibular, o SiSU e os processos seletivos específicos da FURG. Eu respondo com base nas páginas oficiais e mostro de onde veio cada informação.`
  - sugestões: `Quando são as inscrições?`, `Como funciona o SiSU?`, `Quem pode participar do PS Transgênero?`
  - nota do rodapé: `Pode conter erros. Confira sempre o edital oficial.`
  - placeholder: `Escreva sua pergunta…`
- Texto vindo do servidor nunca entra por `innerHTML`: só `textContent` e elementos criados. Links de fonte só com `http:`/`https:`, `target="_blank"` e `rel="noopener noreferrer"`.
- Contrato do Worker: corpo `{ pergunta, historico }`, com `historico` de no máximo 8 mensagens alternando `{papel:'usuario'|'modelo', texto}` e começando por `usuario`; pergunta com até 500 caracteres. Resposta 200 `{ resposta, fontes:[{titulo,url,site,data}] }`; erros `{ erro }` com 400, 403, 413, 429 e 503.
- Acessibilidade: o painel tem `role="dialog"` e `aria-labelledby`; Esc fecha; o foco vai para o campo ao abrir e volta ao botão ao fechar; Tab circula dentro do painel aberto; as respostas ficam numa região `aria-live="polite"`; contraste AA (4,5:1) do texto branco sobre a cor; `prefers-reduced-motion` respeitado; no celular (largura até 600 px) o painel ocupa a tela inteira.
- Privacidade: nada vai para fora além de `POST /perguntar`. A conversa fica só no `sessionStorage` do navegador do candidato e some quando a aba fecha.

## Pontos de atenção na revisão

1. Script colado no `<head>` ou carregado duas vezes: tem de montar uma única vez, só depois que o `body` existir.
2. `data-cor` inválida ou com pouco contraste (por exemplo `#ffff00`): usa o azul padrão, sem quebrar.
3. Resposta longa, URL enorme ou lista com "- ": quebra de linha preservada, sem rolagem horizontal no painel.
4. Rede caída, 429 e 503: mensagem clara no painel, campo liberado de novo e a pergunta não entra no histórico.
5. CSS agressivo do Joomla (`* { font-size }`, `button { ... }`, `z-index` alto): o widget não muda, porque fica no Shadow DOM com `all: initial` no host e `z-index: 2147483000`.

---

### Tarefa 1: workspace, montagem, botão e painel

**Arquivos:**
- Criar: `widget/package.json` (nome `widget`; scripts `test: vitest run`, `build: node build.mjs`; devDependencies `esbuild`, `happy-dom`, `vitest`, `typescript`), `widget/tsconfig.json` (DOM lib, strict, `noEmit`), `widget/vitest.config.ts` (`environment: 'happy-dom'`), `widget/src/config.ts`, `widget/src/estilos.ts`, `widget/src/interface.ts`, `widget/src/index.ts`
- Modificar: `package.json` da raiz (incluir `widget` em `workspaces`), `tsconfig.json` da raiz (referência, se o `tsc -b` usar referências)
- Testes: `widget/test/config.test.ts`, `widget/test/interface.test.ts`

**Interfaces:**
- Produz: `lerConfig(script: HTMLScriptElement | null): { api: string; cor: string }`. `api` é a origem do `src` do script (por exemplo `https://chatbot-coperse.coperse-furg.workers.dev`); `cor` é `data-cor` se for `#rgb` ou `#rrggbb` com contraste ≥ 4,5 contra branco, senão `#1f5fbf`.
- Produz: `contraste(hex: string): number` (razão WCAG contra `#ffffff`).
- Produz: `montar(config, deps?: { enviar?: Enviar }): Widget`, com `Widget = { host: HTMLElement; abrir(): void; fechar(): void; raiz: ShadowRoot }`. `Enviar` é definido na Tarefa 2; aqui o painel só renderiza.
- Produz: `src/index.ts` captura `document.currentScript` na carga (antes de qualquer `await`), sai se `window.__chatbotCoperse` existir, marca a flag e chama `montar` imediatamente se `document.body` existir, ou no `DOMContentLoaded` se não existir.

- [ ] **Passo 1: testes que falham**
  - `config.test.ts`: `lerConfig` com `src="https://w.example/widget.js"` e sem `data-cor` → `{ api: 'https://w.example', cor: '#1f5fbf' }`; com `data-cor="#8b0000"` → cor `#8b0000`; com `#ffff00`, `red`, `#12345` e `javascript:x` → `#1f5fbf`; com `script` nulo → `api` vazio (o widget não monta, ver index). `contraste('#1f5fbf') >= 4.5`, `contraste('#ffffff')` igual a 1.
  - `interface.test.ts`:
    - `montar` cria um único host com shadowRoot, e o botão tem o texto exato.
    - Clicar no botão mostra o painel (`role="dialog"`, `aria-labelledby` apontando para o título) com título, subtítulo, aviso, boas-vindas, três sugestões e nota, todos com os textos exatos; o botão fica oculto e o foco vai para o `textarea`.
    - Esc fecha o painel e devolve o foco ao botão. Tab no último elemento focável vai ao primeiro, e Shift+Tab no primeiro vai ao último.
    - A cor da config aparece como `--cor` no host.
    - O `textarea` tem `maxlength="500"`.
    - Carregar o `index` duas vezes monta um só host. Com `document.body` ausente na carga, monta só depois do `DOMContentLoaded`.
- [ ] **Passo 2:** `npm test -w widget`. Esperado: FALHA.
- [ ] **Passo 3: implementar.** Estilos (`estilos.ts`, uma string CSS) seguem a maquete: botão em pílula no canto inferior direito, painel de 380 × 560 px, cabeçalho na cor, aviso amarelo-claro, mensagens do bot à esquerda e do usuário à direita. Em `@media (max-width: 600px)` o painel fica `position: fixed; inset: 0`. Com `prefers-reduced-motion` não há transições. O host usa `all: initial; position: fixed; z-index: 2147483000`.
- [ ] **Passo 4:** `npm test -w widget` e `npm run typecheck`. Esperado: PASSA.
- [ ] **Passo 5:** commit `feat(widget): montagem, botão e painel acessível`.

### Tarefa 2: conversa

**Arquivos:**
- Criar: `widget/src/conversa.ts`, `widget/src/render.ts`
- Modificar: `widget/src/interface.ts` (ligar envio, sugestões e restauração)
- Testes: `widget/test/conversa.test.ts`, `widget/test/render.test.ts`

**Interfaces:**
- Consome: `montar`, `lerConfig` (Tarefa 1).
- Produz: `type Mensagem = { papel: 'usuario' | 'modelo'; texto: string }`; `type Fonte = { titulo: string; url: string; site: string; data: string }`; `type Enviar = (pergunta: string, historico: Mensagem[]) => Promise<{ resposta: string; fontes: Fonte[] }>`.
- Produz: `criarEnviar(api: string, fetchFn = fetch): Enviar` faz `POST ${api}/perguntar` com JSON e lança `ErroWidget { mensagem: string }`. Com corpo `{erro}` (429, 503, 400, 413), a mensagem é o próprio `erro`; em falha de rede ou JSON inválido, é `Não consegui falar com o assistente. Verifique sua conexão e tente de novo.`
- Produz: `historicoParaEnvio(trocas: Mensagem[]): Mensagem[]`, que devolve as últimas 8 mensagens em pares completos, começando por `usuario`.
- Produz: `renderResposta(texto: string, fontes: Fonte[]): HTMLElement`. Os marcadores `[n]` viram `<sup>` com o número, o texto mantém as quebras de linha (`white-space: pre-wrap`) e as fontes formam uma lista numerada com o link (título), o site e `atualizado em dd/mm/aaaa` (data ISO convertida sem fuso, pela parte da data). Fonte com URL que não seja http(s) aparece sem link.

- [ ] **Passo 1: testes que falham**
  - `render.test.ts`:
    - `'Prazo 10/12 [1].'` com uma fonte gera um `sup` "1" e um link com `href` igual à URL, `target="_blank"` e `rel="noopener noreferrer"`.
    - Uma resposta contendo `<img src=x onerror=alert(1)>` não cria `img` (aparece como texto).
    - Uma fonte `javascript:alert(1)` não vira link.
    - A data `2026-11-12T20:07:07.139Z` vira `12/11/2026`.
    - Sem fontes, não há lista.
  - `conversa.test.ts`:
    - `criarEnviar` com fetch falso: 200 devolve o objeto; 429 `{erro:'Muitas perguntas…'}` lança com essa mensagem; um `TypeError` de rede lança a mensagem padrão.
    - O corpo enviado é `{pergunta, historico}`.
    - `historicoParaEnvio` com 12 mensagens devolve as 8 últimas, começando por `usuario`.
  - Integrados em `interface.test.ts`, com `enviar` falso:
    - Enter envia e Shift+Enter não envia.
    - Durante o envio o campo e o botão ficam desativados e aparece `Pensando…` com `role="status"`.
    - A resposta entra na região `aria-live="polite"`.
    - O clique numa sugestão envia o texto dela.
    - Pergunta só com espaços não é enviada.
    - Erro mostra a mensagem no painel, libera o campo e não entra no histórico.
    - A segunda pergunta envia o histórico da primeira troca.
    - A conversa e o estado aberto/fechado são salvos em `sessionStorage` (chave `chatbot-coperse`) e restaurados ao montar de novo.
    - `sessionStorage` que lança exceção não quebra o widget.
- [ ] **Passo 2:** `npm test -w widget`. Esperado: FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test -w widget` e `npm run typecheck`. Esperado: PASSA.
- [ ] **Passo 5:** commit `feat(widget): conversa, fontes e histórico`.

### Tarefa 3: build, entrega pelo Worker, página de demonstração e documentação

**Arquivos:**
- Criar: `widget/build.mjs`; `worker-resposta/src/widget-gerado.ts` (gerado); `worker-resposta/src/demo.ts`
- Modificar: `worker-resposta/src/index.ts` (`/widget.js` serve `WIDGET`; `GET /demo` serve a página de demonstração); remover `worker-resposta/src/widget-teste.ts`; `config/origens.json` (acrescentar `https://chatbot-coperse.coperse-furg.workers.dev`); `.github/workflows/testes.yml` e `publicar.yml` (passo `npm run build -w widget` seguido de `git diff --exit-code worker-resposta/src/widget-gerado.ts`, que falha se o gerado estiver desatualizado); `README.md` (seção "Widget": como colar no Joomla e no vestibular, `data-cor`, `/demo`); `docs/decisoes.md`.
- Testes: `worker-resposta/test/rotas.test.ts`, `widget/test/build.test.ts`

**Interfaces:**
- Produz: `worker-resposta/src/widget-gerado.ts` exporta `export const WIDGET: string` com o cabeçalho `// Gerado por widget/build.mjs. Não editar.`
- Produz: `GET /demo` devolve HTML com `<script src="/widget.js" defer></script>`, um parágrafo explicando que é a página de teste do assistente e `Cache-Control: no-store`.

- [ ] **Passo 1: testes que falham**
  - `build.test.ts`: após `node build.mjs`, o tamanho de `WIDGET` (em bytes UTF-8) é no máximo 15 360. A string não contém `innerHTML =` aplicado a dados do servidor (verificação textual: só o CSS fixo entra por `innerHTML`, se entrar). O build é determinístico: duas execuções geram o mesmo texto.
  - `rotas.test.ts`: `GET /widget.js` responde 200 com `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: public, max-age=300`, corpo igual a `WIDGET` e sem o texto `teste`. `GET /demo` responde 200 HTML com `/widget.js`. `POST /perguntar` com `Origin: https://chatbot-coperse.coperse-furg.workers.dev` não dá 403.
- [ ] **Passo 2:** rodar os testes. Esperado: FALHA.
- [ ] **Passo 3:** implementar. O esbuild usa `bundle`, `minify`, `format: 'iife'`, `target: 'es2019'` e `legalComments: 'none'`; o resultado é escrito com `JSON.stringify` no módulo gerado.
- [ ] **Passo 4:** `npm run build -w widget && npm run typecheck && npm test`. Esperado: PASSA, e o tamanho do bundle é registrado no relatório.
- [ ] **Passo 5:** commit `feat(widget): build, /widget.js, /demo e documentação`.

### Tarefa 4 (controlador, depois do merge): prova real

- [ ] Publicar com o merge (o workflow `publicar` faz o deploy).
- [ ] Abrir `https://chatbot-coperse.coperse-furg.workers.dev/demo` no navegador. Conferir a pergunta com resposta e fonte, o aviso, Esc, a navegação só por teclado e a largura de celular (devtools, 375 px).
- [ ] O Jeferson cola o script num módulo HTML personalizado do coperse.furg.br, publicado numa página de teste, primeiro com `data-cor="#8b0000"`. Conferir o comportamento real (filtro do editor, CSS do Joomla). O risco R1 da spec se resolve aqui.
- [ ] Registrar o resultado em `docs/decisoes.md` e pedir o aceite da etapa 6.
