# Teste de colagem do script no Joomla (Etapa 2)

Objetivo: confirmar que o Joomla do sisu3 aceita um `<script>` colado num módulo HTML personalizado, sem precisar de plugin nem de acesso ao código. É o mesmo caminho que o chatbot vai usar.

O script de teste só mostra um selo "Chatbot COPERSE — teste" no canto inferior direito. Não coleta nada e não chama nenhum outro serviço.

## O código a colar

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" defer></script>
```

## Passo a passo (Joomla 4/5, sisu3.furg.br)

1. **Trocar o editor para não "limpar" o código** (só para o seu usuário):
   no canto superior direito do painel, menu do usuário → **Editar conta** → aba **Configurações básicas** → **Editor** = **Editor - CodeMirror** (ou **Editor - Nenhum**) → **Salvar e fechar**.
   Motivo: o editor visual (TinyMCE) costuma apagar `<script>`.
2. **Criar o módulo:** **Conteúdo → Módulos do site → Novo → Personalizado** (Custom).
   - Título: `Chatbot - teste` (em **Exibir título**, escolha **Ocultar**).
   - No campo de conteúdo, cole o código acima.
   - **Posição:** escolha uma posição que aparece no rodapé do site (qualquer uma que esteja visível nas páginas).
   - Status: **Publicado**.
3. **Mostrar só numa página** (para o teste não aparecer para todo mundo):
   aba **Atribuição de menu** → **Somente nas páginas selecionadas** → marque **uma** página de pouco movimento.
4. **Salvar.** Depois de salvar, **reabra o módulo** e confira se o código continua lá, igual ao colado.

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
