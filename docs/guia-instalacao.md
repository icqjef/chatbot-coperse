# Guia de instalação do assistente nas páginas

Para quem edita o site como Administrator do Joomla (coperse.furg.br e sisu.furg.br). Não precisa instalar nada: é uma única linha de código colada num módulo.

## A linha que será colada

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" data-cor="#8b0000" defer></script>
```

`data-cor` é opcional e define a cor do botão e do cabeçalho.

- coperse.furg.br: use `data-cor="#8b0000"` (vinho).
- sisu.furg.br: tire o `data-cor`; o assistente fica no azul padrão (`#1f5fbf`).
- Se a cor for inválida ou clara demais para o texto branco, o assistente usa o azul padrão.

## Antes de começar: teste sem mexer em site nenhum

Abra `https://chatbot-coperse.coperse-furg.workers.dev/demo`. É uma página só com o assistente.

## Colar no coperse.furg.br e no sisu.furg.br

1. Entre no painel do Joomla como Administrator.
2. Abra a lista de módulos: no menu de Módulos (Conteúdo → Módulos do Site, ou Extensões → Módulos, conforme a versão). No site do SiSU (Joomla 3, conferido quando ainda era sisu3) o caminho é Extensões → Módulos.
3. Clique em Novo e escolha o tipo "Personalizado" (HTML personalizado / Custom).
4. Dê o título `Assistente COPERSE` e, em "Mostrar título", escolha "Ocultar".
5. Antes de colar, deixe a caixa de texto em código puro, de um destes jeitos:
   - clique em "Alternar editor" (Toggle Editor); ou
   - no menu do usuário, em Editar conta, Configurações básicas, escolha o editor "Nenhum" (ou CodeMirror).

   O editor visual pode estragar o `<script>`: ele passa a aparecer escrito na página.
6. Cole a linha do script, sem mudar nada, e salve. Não alterne o editor de novo.
7. Em "Posição", escolha uma posição que apareça em todas as páginas do modelo (o rodapé, por exemplo). Use a mesma posição de um módulo que você já vê no site.
8. Na aba de atribuição de menu, escolha "Em todas as páginas". Deixe o status "Publicado" e salve.

## Conferir que funcionou

1. Reabra o módulo e veja se a linha `<script ...>` continua lá, igual à que você colou.
2. Abra uma página do site e veja o botão do assistente no canto da tela.
3. Na mesma página, aperte Ctrl+U e procure por `widget.js`. Se estiver lá, o script foi entregue.
4. Faça uma pergunta de teste, por exemplo "Quando é a prova do Vestibular?".

## Se o `<script>` sumir

Se o `<script>` desaparecer depois de salvar o módulo, não mude mais nada no Joomla. Avise quem mantém o assistente (coperse@furg.br): a linha pode ser colada por uma pessoa cujo grupo de usuários já mantém scripts nas páginas. Depois confira de novo, como na seção anterior.

## Vestibular

O vestibular.furg.br é administrado por outra pessoa. O texto pronto para pedir a ela está em [pedido-vestibular.md](pedido-vestibular.md).

## Mudança do sisu3 para o sisu (feita em 2026-11-14)

O SiSU passou a ser publicado em `sisu.furg.br`; `sisu3.furg.br` virou um Joomla em branco. Em `config/sites.json`, o site `sisu` aponta para `https://sisu.furg.br` e lista `sisu3.furg.br` em `hosts_antigos`: o indexador tira do índice e da fila tudo o que estava no host antigo e enfileira o mesmo caminho no host novo. O script colado no Joomla não muda (ele aponta para o Worker). `https://sisu3.furg.br` continua em `config/origens.json` enquanto o endereço antigo responder.

Se outro site mudar de endereço, faça o mesmo: troque `base`, `feed`, `paginas_chave` e `dominios_permitidos` e ponha o host antigo em `hosts_antigos`.
