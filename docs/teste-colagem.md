# Teste de colagem do script no Joomla (Etapa 2)

Objetivo: confirmar que o Joomla do sisu3 aceita um `<script>` colado num módulo HTML personalizado, sem precisar de plugin nem de acesso ao código. É o mesmo caminho que o chatbot vai usar.

O script de teste só mostra um selo "Chatbot COPERSE — teste" no canto inferior direito. Não coleta nada e não chama nenhum outro serviço.

## O código a colar

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" defer></script>
```

## Passo a passo (sisu3.furg.br roda Joomla 3)

1. **Criar o módulo:** **Extensões → Gerenciar módulos → Novo → HTML personalizado** (Custom).
   - Título: `Chatbot - teste` (em **Exibir título**, escolha **Ocultar**).
   - **Antes de colar**, clique no botão **Alternar editor** (abaixo da caixa de texto). A caixa passa a mostrar código cru. **Não cole no editor visual**: ele transforma o código em texto e o `<script>` aparece escrito na página.
   - Apague o que houver na caixa e cole o código acima. Salve sem alternar o editor de novo.
   - Se não houver botão "Alternar editor": menu do usuário → **Editar conta** → **Configurações básicas** → **Editor** = **Editor - CodeMirror** ou **Editor - Nenhum**.
   - **Posição:** use a **mesma posição de um módulo que você vê no site** (por exemplo, o do rodapé; a posição aparece na lista de módulos). Posições que o tema "pip" não usa nunca aparecem.
   - Status: **Publicado**.
2. **Mostrar só numa página** (para o teste não aparecer para todo mundo):
   aba **Atribuição de menu** → **Somente nas páginas selecionadas** → marque **uma** página de pouco movimento.
3. **Salvar.** Depois de salvar, **reabra o módulo** e confira se o código continua lá, igual ao colado.

## O que verificar e me contar

1. Ao reabrir o módulo, o `<script ...>` **continua lá** ou **sumiu/mudou**?
2. Na página escolhida, aparece o selo **"Chatbot COPERSE — teste"** no canto inferior direito?
3. No celular, o selo aparece?
4. (Opcional) No computador, tecle **F12 → Console**: aparece `[chatbot-coperse] script carregado`?

## Se o script sumir ao salvar

O Joomla tem um **filtro de texto** por grupo de usuários. Verifique em **Sistema → Configuração global → aba Filtros de texto** qual é o filtro do grupo **Administrator**:

- **Sem filtragem**: o problema era o editor. Volte ao passo 1.
- **Lista negra padrão** ou outro: o Joomla está removendo o `<script>`. **Não altere** essa configuração sem autorização; me avise. Será preciso que alguém com perfil **Super User** cole o script, ou que o filtro do grupo seja revisto por quem administra o site.

## Depois do teste

Despublique o módulo (**Status: Despublicado**) ou apague-o. O módulo definitivo será criado na publicação do chatbot, já com o widget de verdade.

## Resultado em 2026-11-12 (sisu3)

Funcionou: o `<script>` ficou salvo, chegou às páginas como código e o selo apareceu no computador e no celular. Os dois tropeços foram a posição (a primeira escolhida não existe no tema) e o editor visual (converteu o código em texto). Ambos estão cobertos no passo a passo acima.
