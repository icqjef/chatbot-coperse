# Guia de operação para a COPERSE

Para o dia a dia do assistente. Nunca cole chaves, senhas ou tokens em conversa de chat nem em código: cadastre-os sempre pelo site do serviço (Cloudflare, GitHub, Google).

Endereço do Worker: `https://chatbot-coperse.coperse-furg.workers.dev`

## 1. Conferir se está tudo bem (`/saude`)

1. Abra no navegador `https://chatbot-coperse.coperse-furg.workers.dev/saude`.
2. Leia o resultado:
   - `ok: true` significa que o banco responde. Se vier `ok: false` (erro 503), o banco falhou: espere alguns minutos e tente de novo; se persistir, avise quem mantém o código.
   - `ultima_indexacao` mostra quando a última leitura dos sites começou (`inicio`) e terminou (`fim`), quantas páginas (`paginas`) e quantos erros (`erros`). A leitura roda a cada 2 horas; se o `inicio` for de mais de um dia atrás, algo parou (ver seção 2).
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

## 3. Reindexar (ler os sites agora)

Pelo GitHub:

1. Entre em github.com/icqjef/chatbot-coperse e abra a aba Actions.
2. Clique no workflow `indexar`, depois em "Run workflow".
3. Os campos `limite` (itens por execução, padrão 400) e `minutos` (prazo, padrão 25) podem ficar como estão.
4. Clique no botão verde "Run workflow". Acompanhe até terminar e confira em `/saude`.

Pelo endereço `/reindexar` (para quem tem a senha): é um pedido `POST` com a senha no cabeçalho `Authorization: Bearer <senha>`; responde 202 quando o GitHub aceita. Se a senha (`REINDEX_TOKEN`, mínimo de 32 caracteres) ou o token do GitHub não estiverem cadastrados no Cloudflare, a rota fica desligada e responde 503. A senha nunca vai em chat.

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
5. Se qualquer pergunta da categoria `datas-vagas-prazos` falhar, o programa termina com erro e escreve "PORTÃO: ... Não publicar". Corrija antes de divulgar. Para rodar só algumas, use `--so id1,id2`.

A cada edital novo:

1. Leia o edital oficial e escolha as datas, vagas, prazos e valores mais perguntados.
2. Acrescente perguntas em `avaliacao/perguntas.json`, no mesmo formato das existentes, com a resposta conferida no edital.
3. Se um edital substituir outro, atualize ou apague as perguntas antigas.
4. Mantenha `conferido_por_jeferson` verdadeiro só depois de conferir você mesmo. Se estiver falso, o teste sempre termina com aviso.
5. Mude o arquivo por pull request.

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
- Em semana de inscrição ou resultado, acompanhe o uso: se a cota diária esgotar, os candidatos ficam sem o assistente até o dia seguinte. Os valores ficam em `worker-resposta/wrangler.toml` (`LIMITE_POR_MINUTO`, `LIMITE_DIARIO_VISITANTE`, `COTA_DIARIA`) e são mudados por pull request.
- O plano gratuito da Cloudflare tem 100 mil requisições por dia. Uma enxurrada de pedidos de um mesmo endereço é barrada por um filtro da própria Cloudflare (20 por minuto) antes de chegar ao contador de limites, então não trava o assistente para os outros. Mesmo barrados, esses pedidos contam nas 100 mil, e isso não tem como ser evitado no código. Em semana de inscrição ou resultado, confira o uso no site da Cloudflare: Workers e Pages, chatbot-coperse, aba de métricas. Se chegar perto de 100 mil num dia, avise o responsável técnico.

## 9. O que o assistente guarda

- Nada além da conversa na aba do navegador do candidato, que some ao fechar a aba.
- O Worker não grava as perguntas. Para limitar o uso, ele guarda apenas um código derivado do endereço IP e da data, nunca o IP.
- Quando o candidato clica em 👍 ou 👎 ("Esta resposta ajudou?"), o Worker guarda o dia, o voto, o começo da resposta do bot e os endereços das páginas citadas nela. Não guarda a pergunta nem nada que identifique a pessoa.
- Para cada pergunta, o Worker soma 1 na contagem do dia (respondida, não encontrada, recusada ou conversa). Só o número, nunca o texto.

### Resumo semanal

Toda segunda-feira às 8h, o GitHub abre um aviso (issue) no repositório com o resumo da semana anterior: perguntas, perguntas sem resposta, avaliações, taxa de aprovação comparada com a semana anterior e as páginas mais citadas nas respostas com 👎. O aviso da semana anterior é fechado sozinho. O GitHub manda e-mail para quem acompanha o repositório (o dono acompanha por padrão; para conferir, botão "Watch" no topo do repositório).

O repositório é público, então o resumo traz só números e páginas públicas dos sites, sem o texto das respostas (esse fica no painel). Para gerar um resumo fora de hora: aba Actions → `resumo-semanal` → "Run workflow". Para desligar: Actions → `resumo-semanal` → "..." → "Disable workflow".

Para acompanhar as avaliações, abra o painel https://chatbot-coperse.coperse-furg.workers.dev/painel e digite a mesma senha da reindexação manual (seção 3). Ele mostra, nos últimos 7, 30 ou 90 dias:

- quantas perguntas os candidatos fizeram e quantas ficaram sem resposta, separando as não encontradas nas páginas (falta página ou edital) das recusadas (fora do tema ou caso individual);
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
