# Aviso ao CGTI (texto pronto para enviar)

Este aviso é só informativo. Não pede nenhuma alteração ao CGTI.

---

**Assunto:** Informação: assistente virtual de perguntas sobre processos seletivos (COPERSE) em páginas da FURG

Prezados,

A COPERSE vai colar, em módulo HTML personalizado do Joomla (autorizado pelo CGTI), uma linha de script nos sites coperse.furg.br e sisu3.furg.br. Para o vestibular.furg.br, o pedido será feito à pessoa que administra esse site. Informamos abaixo o que o script faz. Nenhuma ação é solicitada ao CGTI.

**O que é.** Um assistente virtual que responde perguntas de candidatos sobre o Vestibular e o SiSU, usando apenas o conteúdo publicado nesses sites, e sempre indica a página de origem.

**Domínio usado.** `chatbot-coperse.coperse-furg.workers.dev` (serviço Cloudflare Workers). Não usamos domínio furg.br, para não depender de DNS do CGTI.

**A linha colada nas páginas.**

```html
<script src="https://chatbot-coperse.coperse-furg.workers.dev/widget.js" data-cor="#8b0000" defer></script>
```

**O que o script faz.**
- Mostra um botão que abre um painel de conversa.
- Quando o candidato digita uma pergunta e envia, manda só esse texto (e as mensagens anteriores da mesma conversa) para o Worker acima.
- O Worker busca os trechos relevantes no índice e envia a pergunta, com esses trechos, ao modelo Gemini (API do Google) para redigir a resposta. Nada é gravado com identificação.
- Guarda a conversa apenas na aba do navegador (sessionStorage); ela some ao fechar a aba.

**O que o script não faz.**
- Não lê o conteúdo da página nem os campos de formulários.
- Não usa cookies.
- Não coleta dados pessoais; o painel avisa o candidato para não digitar CPF, nome ou outros dados pessoais.

**Onde roda e quem mantém.** O Worker roda na Cloudflare e o código fica em repositório público no GitHub (github.com/icqjef/chatbot-coperse), sem nenhuma chave ou senha. A manutenção é da COPERSE (responsável: Jeferson). Contato: coperse@furg.br.

**Medidas de segurança.**
- O Worker só aceita pedidos dos endereços listados em `config/origens.json` (sites da FURG e o próprio endereço do Worker, usado numa página de teste). A origem não é autenticação: um programa fora do navegador pode enviar esse cabeçalho. Por isso existem os limites a seguir.
- Limite de 6 perguntas por minuto e 150 por dia para cada visitante, e de 1.000 perguntas por dia no total. A contagem usa um código derivado do endereço IP e da data, sem guardar o IP.
- As chaves e senhas ficam como segredos da Cloudflare e do GitHub, nunca no código.

Informação para o futuro, sem pedido de ação agora: se os sites da FURG adotarem uma política de segurança de conteúdo (Content-Security-Policy), será preciso permitir o domínio do Worker em `script-src` e `connect-src`, além de estilos inline para o widget.

**Se for preciso desligar.** Basta apagar a linha do script ou despublicar o módulo no Joomla. Nada mais precisa ser alterado.

Atenciosamente,
Jeferson
COPERSE/FURG
