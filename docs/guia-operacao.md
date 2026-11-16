# Guia de operação para a COPERSE

Para o dia a dia do assistente. Nunca cole chaves, senhas ou tokens em conversa de chat nem em código: cadastre-os sempre pelo site do serviço (Cloudflare, GitHub, Google).

Endereço do Worker: `https://chatbot-coperse.coperse-furg.workers.dev`

## 1. Conferir se está tudo bem (`/saude`)

1. Abra no navegador `https://chatbot-coperse.coperse-furg.workers.dev/saude`.
2. Leia o resultado:
   - `ok: true` significa que o banco responde. Se vier `ok: false` (erro 503), o banco falhou: espere alguns minutos e tente de novo; se persistir, avise quem mantém o código.
   - `ultima_indexacao` mostra quando a última leitura dos sites começou (`inicio`) e terminou (`fim`), quantas páginas (`paginas`) e quantos erros (`erros`). A leitura está agendada a cada 2 horas, mas o GitHub às vezes atrasa ou pula execuções (intervalos de 6 a 8 horas são normais); se o `fim` for de mais de 12 horas atrás, algo parou (ver seção 2).
   - `fila` é quantas páginas esperam para ser lidas; `paginas_ok` é quantas já estão no assistente.
3. Muitas consultas seguidas a `/saude` são freadas pelo mesmo limite das perguntas (6 por minuto).

## 2. E-mail de falha do GitHub

O GitHub avisa por e-mail quando a leitura agendada dos sites (workflow `indexar`) falha.

1. Abra o e-mail e clique no link da execução. Ou entre em github.com/icqjef/chatbot-coperse, aba Actions, workflow `indexar`, e abra a execução com ícone vermelho.
2. Abra o passo que falhou e leia a mensagem. Causas comuns:
   - Chave do Gemini recusada ("API key not valid"): troque a chave (seção 4).
   - Token do Cloudflare recusado ou vencido: crie um novo (seção 7) e cadastre no GitHub.
   - Um site fora do ar: espere. A próxima execução tenta de novo.

Se quem falhar for o workflow `publicar` (publicação do Worker depois de uma mudança aprovada) com o token da Cloudflare recusado, o token de publicação venceu: quem mantém o código cria um novo no site da Cloudflare e atualiza o segredo `CLOUDFLARE_API_TOKEN` no site do GitHub (Settings, Secrets and variables, Actions).
3. Depois de corrigir, rode de novo pela seção 3 e confira em `/saude`.

O que já está no assistente continua valendo durante a falha; só as novidades deixam de entrar.

## 2a. Alerta do monitor

O workflow `monitor` confere o assistente a cada 10 minutos (o GitHub pode atrasar ou pular algumas execuções). Uma vez por hora ele faz uma pergunta de teste de verdade. Se a conferência falhar duas vezes seguidas, abre a issue **"Alerta: assistente com problema"** e o GitHub manda e-mail. Quando tudo volta ao normal, a issue é fechada sozinha com o comentário "Voltou ao normal".

O que a issue pode dizer e o que fazer:

- **`/saude` não respondeu** ou **HTTP 503**: o Worker ou o banco da Cloudflare está fora. Veja cloudflarestatus.com. Se a Cloudflare estiver normal, avise quem mantém o código.
- **Indexação sem terminar há mais de 12 h**: siga a seção 2 (aba Actions, workflow `indexar`).
- **Pergunta de teste com HTTP 503**: o Gemini falhou mesmo depois das novas tentativas e do modelo reserva. Veja aistudio.google.com/status e o saldo da conta de cobrança do Gemini: com saldo zero, a chave para.
- **Pergunta de teste sem fonte**: a busca não achou nada; o índice pode ter sido esvaziado. Avise quem mantém o código.
- **Só N páginas no índice**: a indexação removeu páginas demais (por exemplo, um site em erro). Avise quem mantém o código.

Para conferir na hora, entre em Actions, workflow `monitor`, botão "Run workflow".

## 3. Reindexar (ler os sites agora)

Pelo GitHub:

1. Entre em github.com/icqjef/chatbot-coperse e abra a aba Actions.
2. Clique no workflow `indexar`, depois em "Run workflow".
3. Os campos `limite` (itens por execução, padrão 400) e `minutos` (prazo, padrão 25) podem ficar como estão.
4. Clique no botão verde "Run workflow". Acompanhe até terminar e confira em `/saude`.

Pelo endereço `/reindexar` (para quem tem a senha): é um pedido `POST` com a senha no cabeçalho `Authorization: Bearer <senha>`; responde 202 quando o GitHub aceita. Se a senha (`REINDEX_TOKEN`, mínimo de 32 caracteres) ou o token do GitHub não estiverem cadastrados no Cloudflare, a rota fica desligada e responde 503. A senha nunca vai em chat.

### Páginas do portal furg.br

Além dos sites da COPERSE, do SiSU e do Vestibular, o assistente lê uma lista fechada de páginas do furg.br: as páginas de cada curso de graduação (duração, campus, turno, grau, vagas por ano, contato da coordenação), formas de ingresso, documentação, Calendário Universitário, primeiros passos, assistência estudantil (restaurante, moradia, transporte), Acolhida Cidadã, ônibus interno e os quatro campi. Um curso novo publicado em furg.br/graduacao entra sozinho.

- Para acrescentar uma página, coloque o endereço em `paginas_chave` e uma expressão que case com ele em `incluir`, no site `furg` de `config/sites.json`, por pull request. Página fora de `incluir` não é lida (e, se já estava no índice, sai).
- Nas respostas, as páginas da COPERSE, do SiSU e do Vestibular valem mais que as do furg.br. Algumas páginas do furg.br sobre ingresso estão desatualizadas (por exemplo, "Formas de ingresso" ainda aponta para editais de 2025); se notar uma resposta errada por causa delas, peça à Secretaria de Comunicação que atualize a página.
- As "Vagas" da página do curso são o total do ano; o assistente avisa isso e, quando houver, dá também as vagas do processo perguntado.

## 4. Trocar a chave do Gemini

A chave fica em dois lugares, e os dois precisam receber a nova.

1. No site do Google AI Studio, crie uma chave nova. Não apague a antiga ainda.
2. No painel do Cloudflare: Workers & Pages, `chatbot-coperse`, Settings, Variables and Secrets. Edite o segredo `GEMINI_API_KEY` (tipo Secret) e salve.
3. No GitHub: repositório, Settings, Secrets and variables, Actions. Edite o segredo `GEMINI_API_KEY` e salve.
4. Rode a indexação (seção 3) e faça uma pergunta de teste no assistente.
5. Só depois de a chave nova estar no Cloudflare e no GitHub e de o teste passar, apague a chave antiga no Google AI Studio.

## 5. Alerta de orçamento no Google Cloud

O custo estimado é de cerca de US$ 0,003 por pergunta (ver [decisoes.md](decisoes.md)) e o teto de 1.000 perguntas por dia limita o gasto a cerca de US$ 3 por dia, mesmo em caso de abuso.

1. No Google Cloud, abra a conta de cobrança ligada ao Gemini.
2. Na seção de orçamentos e alertas (Billing, Budgets & alerts), crie um orçamento mensal com avisos por e-mail em valores que você escolher (por exemplo, 50%, 90% e 100%).
3. Confira que o e-mail de aviso chega a você.

## 6. Perguntas de referência (teste de qualidade)

O arquivo `avaliacao/perguntas.json` guarda as perguntas com a resposta certa conferida no edital. Cada pergunta tem os fatos que a resposta precisa conter (datas, vagas, valores) e um trecho da página que precisa aparecer como fonte.

Rodar o teste (precisa de Node 22 e do repositório baixado):

1. Abra o terminal na pasta do projeto.
2. Rode `npm ci` (só na primeira vez) e depois `node avaliacao/avaliar.mjs`.
3. O teste faz uma pergunta a cada 11 segundos, para respeitar o limite de 6 por minuto, então demora alguns minutos. Mostra `OK` ou `FALHOU` por pergunta e o placar por categoria.
4. O resultado é gravado em `avaliacao/resultados/`.
5. Se qualquer pergunta da categoria `datas-vagas-prazos` ou `ataque` (tentativas de mudar as regras do assistente) falhar, o programa termina com erro e escreve "PORTÃO: ... Não publicar". Corrija antes de divulgar. Para rodar só algumas, use `--so id1,id2`.

### Quando sai uma edição nova (por exemplo, o SiSU 2027 em janeiro)

O campo `edicoes`, no começo de `avaliacao/perguntas.json`, diz qual edição de cada processo as perguntas conferem (hoje: Vestibular 2027, SiSU 2026, PS Transgêneros, Quilombolas e Indígenas 2027, Vagas Complementares 2026). Quando aparecem no índice pelo menos 3 páginas de uma edição mais nova, o resumo semanal traz a seção "Edição nova no índice". Até as perguntas serem atualizadas, o teste de qualidade continua conferindo a edição antiga e pode falhar sem o bot estar errado.

Roteiro:

1. Leia o edital oficial da edição nova e anote as datas, vagas, prazos e valores mais perguntados: inscrição, taxa e isenção, prova ou chamadas, resultado, matrícula e número de vagas.
2. Em `avaliacao/perguntas.json`, atualize as perguntas daquele processo: troque o ano na pergunta (por exemplo, "SiSU 2026" por "SiSU 2027"), a `resposta_esperada`, os `fatos` (cada fato é uma lista de formas aceitas, como `["22/01/2027", "22 de janeiro"]`) e a `fonte` (trecho do endereço da página do edital novo). Apague as perguntas que não valem mais.
3. Troque o ano daquele processo em `edicoes`.
4. Rode `node avaliacao/avaliar.mjs --so id1,id2` só com as perguntas mudadas. Se uma falhar, confira primeiro se a página do edital novo já foi lida (seção 3) e se o fato está escrito do jeito que o edital escreve.
5. Rode o teste completo. Todas as perguntas de `datas-vagas-prazos` precisam passar.
6. Mantenha `conferido_por_jeferson` verdadeiro só depois de conferir você mesmo no edital. Se estiver falso, o teste sempre termina com aviso.
7. Mude o arquivo por pull request (ou peça ao Claude Code: "atualize as perguntas de referência do SiSU 2027 a partir do edital").

Para um edital que só substitui outro na mesma edição (retificação), basta atualizar os fatos das perguntas afetadas.

## 7. Token do Cloudflare restrito para a indexação

A revisão de segurança ([revisao-seguranca-2026-11.md](revisao-seguranca-2026-11.md), item I2) pediu que a leitura dos sites use um token que só altere o banco D1 e o índice Vectorize. Esse token foi criado em 14/11/2026 com o nome `indexacao-chatbot`. Se precisar trocá-lo:

1. Abra https://dash.cloudflare.com/profile/api-tokens e clique em Create Token. Em Token name, escreva `indexacao-chatbot`.
2. Em Policies, clique em Start from scratch e depois em Start with an Account policy. Troque "All accounts" pela conta da COPERSE. Na busca de permissões, digite `D1` e marque Edit; depois digite `Vectorize` e marque Edit. Clique em Continue to summary e confira que aparecem só D1 Edit e Vectorize Edit.
3. Copie o token mostrado uma única vez. Não cole em chat, e-mail ou arquivo.
4. Abra https://github.com/icqjef/chatbot-coperse/settings/secrets/actions. Para trocar, clique no lápis ao lado de `CLOUDFLARE_API_TOKEN_INDEXACAO`; para criar, clique em New repository secret com esse nome.
5. Cole o token no campo de valor e salve.
6. Rode a indexação (seção 3) e confira que terminou com sucesso.
7. No site da Cloudflare, apague só o token de indexação substituído (três pontos ao lado dele, Delete). Não apague o token de publicação.

## 8. Limites e o que o candidato vê

- Por visitante: 6 perguntas por minuto e 150 por dia, só nas perguntas (consultar `/saude` não gasta o limite do dia). Acima disso o assistente avisa "Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo." ou "Você atingiu o limite de perguntas de hoje. Tente amanhã ou escreva para coperse@furg.br." Pessoas na mesma rede (campus, escola, celular) podem dividir o mesmo limite; a avaliação (`avaliar.mjs`, 31 perguntas) também conta.
- No total: 1.000 perguntas por dia, zerando à meia-noite de Brasília. Acima disso todos veem "O assistente atingiu o limite de perguntas de hoje. Tente de novo amanhã ou escreva para coperse@furg.br."
- Quando não encontra a informação, o assistente orienta a consultar o edital oficial ou escrever para coperse@furg.br. Não opina sobre situação individual (homologação, recurso, nota) e recusa assuntos fora dos processos seletivos da FURG.
- Em semana de inscrição ou resultado, acompanhe o uso: se a cota diária esgotar, os candidatos ficam sem o assistente até o dia seguinte. O painel mostra o dia com mais perguntas (com a porcentagem da cota e o aviso "Perto do limite" a partir de 80%) e quantos candidatos foram barrados pela cota; o resumo semanal traz os mesmos números e um alerta.
- Para aumentar a cota: confira antes, na página de limites do Google AI Studio, quantas chamadas por dia o modelo em uso aceita na sua conta (no nível gratuito o limite é por modelo; para sair dele é preciso vincular conta de cobrança e pré-pagar). Depois mude `COTA_DIARIA` em `worker-resposta/wrangler.toml` por pull request. Os outros valores ficam no mesmo arquivo (`LIMITE_POR_MINUTO`, `LIMITE_DIARIO_VISITANTE`).
- O plano gratuito da Cloudflare tem 100 mil requisições por dia. Uma enxurrada de pedidos de um mesmo endereço é barrada por um filtro da própria Cloudflare (20 por minuto) antes de chegar ao contador de limites, então não trava o assistente para os outros. Mesmo barrados, esses pedidos contam nas 100 mil, e isso não tem como ser evitado no código. Em semana de inscrição ou resultado, confira o uso no site da Cloudflare: Workers e Pages, chatbot-coperse, aba de métricas. Se chegar perto de 100 mil num dia, avise o responsável técnico.

## 9. O que o assistente guarda

O candidato vê tudo isso no aviso de privacidade (`/privacidade`, link "Privacidade" no aviso amarelo do widget). Se mudar o que é guardado ou por quanto tempo, mude o aviso junto: um teste falha se os prazos do código e do aviso divergirem. O quadro completo, com o que cada lei exige, está em `docs/conformidade.md`.


- Nada além da conversa na aba do navegador do candidato, que some ao fechar a aba.
- Desde 15/11/2026, o Worker grava o texto das perguntas feitas nos sites da FURG (`REGISTRAR_PERGUNTAS = "true"` em `worker-resposta/wrangler.toml`, decisão do Jeferson). CPF, e-mail, telefone, nome declarado ("meu nome é…") e número de inscrição, matrícula ou protocolo são trocados por [removido] antes de gravar e antes de enviar ao Gemini; não há IP, nome de usuário nem identificador de quem perguntou; saudações não são gravadas; e cada pergunta é apagada depois de 90 dias. O aviso do assistente informa o candidato. Para desligar, mude para `"false"` por pull request; para apagar tudo, rode no Console do D1: `DELETE FROM perguntas_registro;`.
- Para limitar o uso, o Worker guarda apenas um código derivado do endereço IP e da data, nunca o IP.
- Quando o candidato clica em 👍 ou 👎 ("Esta resposta ajudou?"), o Worker guarda o dia, o voto, o começo da resposta do bot e os endereços das páginas citadas nela. Não guarda a pergunta nem nada que identifique a pessoa. Cada avaliação é apagada depois de 1 ano.
- Para cada pergunta, o Worker soma 1 na contagem do dia (respondida, não encontrada, recusada, conversa ou barrada pela cota).

### Resumo semanal

Toda segunda-feira às 8h, o GitHub abre um aviso (issue) no repositório com o resumo da semana anterior: perguntas, perguntas sem resposta, avaliações, taxa de aprovação comparada com a semana anterior, o dia com mais perguntas frente à cota, a leitura dos sites (última leitura, páginas no índice, páginas com erro), edição nova no índice (seção 6) e as páginas mais citadas nas respostas com 👎. Os alertas vêm marcados com ⚠️. O aviso da semana anterior é fechado sozinho. O GitHub manda e-mail para quem acompanha o repositório (o dono acompanha por padrão; para conferir, botão "Watch" no topo do repositório).

O repositório é público, então o resumo traz só números e páginas públicas dos sites, nunca o texto das perguntas nem das respostas (esses ficam no painel, com senha). Para gerar um resumo fora de hora: aba Actions → `resumo-semanal` → "Run workflow". Para desligar: Actions → `resumo-semanal` → "..." → "Disable workflow".

Para acompanhar as avaliações, abra o painel https://chatbot-coperse.coperse-furg.workers.dev/painel e digite a mesma senha da reindexação manual (seção 3). Ele mostra, nos últimos 7, 30 ou 90 dias:

- quantas perguntas os candidatos fizeram e quantas ficaram sem resposta, separando as não encontradas nas páginas (falta página ou edital) das recusadas (fora do tema ou caso individual);
- o texto das perguntas sem resposta, as mais recentes primeiro (perguntas repetidas mostram o que falta nas páginas);
- o dia com mais perguntas frente à cota diária e quantos candidatos a cota barrou;
- o total de avaliações, a taxa de aprovação e os votos por dia (em gráfico ou tabela);
- as páginas mais citadas nas respostas com 👎 (as primeiras a revisar) e as próprias respostas com 👎.

Só contam as perguntas feitas nos sites da FURG; os testes pela página `/demo` e a avaliação automática (`avaliar.mjs`) ficam de fora. A senha fica guardada só naquela aba do navegador e some ao fechá-la; use "Sair" em computador compartilhado.

Também dá para consultar direto no banco (no site da Cloudflare: Storage & Databases, D1, chatbot-coperse, aba Console):

```sql
SELECT dia, SUM(util) AS ajudou, COUNT(*) - SUM(util) AS nao_ajudou FROM avaliacoes GROUP BY dia ORDER BY dia DESC;
SELECT dia, resposta FROM avaliacoes WHERE util = 0 ORDER BY id DESC LIMIT 20;
```

As respostas com 👎 mostram onde o assistente precisa melhorar (página que falta, edital desatualizado).
- O painel avisa o candidato para não digitar CPF, nome ou outros dados pessoais.

## 10. Em caso de dúvida ou problema

- Desligar o assistente de um site: apagar a linha do script ou despublicar o módulo no Joomla ([guia-instalacao.md](guia-instalacao.md)).
- Decisões e custos: [decisoes.md](decisoes.md).
