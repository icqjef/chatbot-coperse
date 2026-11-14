# Pedido à administração do vestibular.furg.br (texto pronto para enviar)

---

**Assunto:** Pedido de uma linha de código no site do Vestibular (assistente virtual de perguntas)

Olá,

A COPERSE criou um assistente virtual que responde perguntas de candidatos usando o conteúdo publicado nos sites da COPERSE, do Vestibular e do SiSU, sempre indicando a página de origem. Gostaríamos de colocá-lo também no vestibular.furg.br.

**O que pedimos: colar uma linha.**

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" data-cor="#8b0000" defer></script>
```

`data-cor` é opcional (cor do botão). Pode trocar por outra cor escura ou tirar o atributo; sem ele o assistente fica azul.

**Onde colar.**
- Em um bloco ou módulo de HTML que apareça em todas as páginas, antes do `</body>`.
- Se o site for um aplicativo em React ou Next, no layout raiz (o componente que envolve todas as páginas), de modo que o script não seja removido quando o visitante troca de página.

**Como conferir.** Abra qualquer página do site: deve aparecer um botão no canto da tela. Ctrl+U e uma busca por `widget.js` também mostram se a linha foi entregue.

**O que o script faz e não faz.** Abre um painel de conversa e envia só a pergunta digitada para o endereço acima. Não lê a página, não usa cookies e não coleta dados pessoais. Para desligar, basta apagar a linha.

**Duas perguntas, para o assistente acompanhar melhor o site.**
1. Qual plataforma o site usa (Joomla, WordPress, aplicativo em React/Next ou outra)?
2. É possível ativar um feed RSS do site? Hoje o endereço de feed devolve erro. Com ele, as novidades entram no assistente mais cedo.

Obrigado!
Jeferson, COPERSE/FURG (coperse@furg.br)
