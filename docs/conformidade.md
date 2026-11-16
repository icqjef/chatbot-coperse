# Conformidade do assistente: LGPD, leis da web, acessibilidade e segurança

Situação em 15/11/2026. Fontes conferidas nesta data:

- LGPD (Lei 13.709/2018), Lei Brasileira de Inclusão (Lei 13.146/2015) e Marco Civil da Internet (Lei 12.965/2014), no site do Planalto;
- eMAG, no gov.br;
- termos adicionais da API Gemini (aistudio.google.com/docs/terms, em vigor desde 23/03/2026);
- páginas de privacidade da FURG (www.furg.br/privacidade-e-seguranca-da-informacao e lgpd.furg.br).

Este documento não é parecer jurídico. Os itens marcados como **decisão** dependem da Encarregada, da Procuradoria Federal junto à FURG ou do CGTI.

## 1. Inventário do tratamento (LGPD, art. 37)

| Dado | Origem | Para quê | Onde fica | Prazo |
|---|---|---|---|---|
| Texto da pergunta, com CPF, e-mail, telefone, nome declarado e número de inscrição/matrícula/protocolo trocados por [removido] | Candidato, no widget | Buscar e gerar a resposta | Memória do Worker (Cloudflare) e API Gemini (Google, serviço pago) | Só durante a requisição; o Google guarda por tempo limitado, só para coibir abuso |
| O mesmo texto, sem identificação, só das perguntas feitas nos sites da FURG e sem saudações | Idem | Ver o que ficou sem resposta | D1, tabela `perguntas_registro` | 90 dias (apagado automaticamente) |
| Avaliação 👍/👎, resposta do assistente (600 caracteres) e páginas citadas | Clique do candidato | Qualidade das respostas | D1, tabela `avaliacoes` | 1 ano (apagado automaticamente) |
| Contagem de perguntas por dia e desfecho | Worker | Painel e resumo semanal | D1, tabela `contagem_perguntas` | Sem prazo (só números) |
| Código derivado do IP e da data | Requisição | Limite de uso por visitante | Memória do Durable Object | O dia corrente; o IP não é guardado |
| Conversa na tela | Widget | Continuar a conversa | `sessionStorage` do navegador do candidato | Até fechar a aba ou clicar em "Nova conversa" |

- Não há cookies, rastreamento nem publicidade.
- O registro automático de cada requisição no Cloudflare está desligado (`invocation_logs = false`) porque traria o IP.

## 2. LGPD

| Exigência | Situação |
|---|---|
| Informação ao titular, de acesso facilitado (art. 9º), e divulgação pública das hipóteses de tratamento pelo poder público (art. 23, I) | **Atendido no código.** Aviso em `/privacidade`, ligado pelo link "Privacidade" no aviso amarelo do widget. Traz controladora, finalidade, dados, prazos, compartilhamento, transferência internacional, IA, direitos e canais. **Decisão:** a Encarregada deve validar o texto, sobretudo a base legal (art. 23). |
| Encarregado identificado e com contato público (art. 41, §1º) | **Atendido pela FURG** em lgpd.furg.br/encarregada (Portaria nº 869/2025). O aviso aponta para essa página, e não para um nome fixo, que poderia mudar. |
| Direitos do titular (art. 18) | **Atendido.** O aviso indica o formulário lgpd.furg.br/contato e o Fala.BR. Como os dados não têm identificação, a pessoa informa o dia, o horário e o texto. |
| Minimização e necessidade (art. 6º, III) | **Atendido.** O widget pede para não digitar dados pessoais e mascara CPF, e-mail, telefone, nome declarado e número de inscrição, matrícula ou protocolo antes de enviar ao Gemini e de gravar. Saudações não são gravadas, o registro dura 90 dias, as avaliações duram 1 ano e o IP não é guardado. |
| Adolescentes (art. 14) | **Atendido em parte.** Não há coleta de identificação nem perfilamento, o que é compatível com o melhor interesse. **Decisão:** ver o item 6.1 (termos do Gemini e menores de 18). |
| Compartilhamento e transferência internacional (art. 33) | **Decisão.** Cloudflare e Google podem processar dados fora do Brasil. O Google atua como operador pelo Data Processing Addendum dos serviços pagos. A Encarregada deve confirmar a hipótese do art. 33 (por exemplo, cláusulas-padrão da ANPD) e registrar os fornecedores no inventário da FURG. |
| Registro das operações (art. 37) | **Rascunho pronto:** a seção 1 deste documento. **Decisão:** incluir no inventário de dados da FURG. |
| Relatório de impacto (art. 38) | **Decisão.** O risco é baixo (sem identificação, mascaramento, prazos curtos, sem decisão automatizada sobre a pessoa), mas cabe à Encarregada decidir se faz o relatório. As seções 1, 2 e 4 servem de base. |
| Segurança (art. 46) e incidentes (art. 48) | **Atendido.** Ver a seção 4. Um incidente segue a Política de Segurança da Informação da FURG e é comunicado à Encarregada. |
| Decisão automatizada (art. 20) | **Não se aplica.** O assistente só informa e não decide nada sobre a pessoa. O aviso e o cabeçalho do widget dizem que as respostas são geradas por IA e devem ser conferidas no edital. |

## 3. Outras leis da web

- **Marco Civil, art. 15** (guarda de registros de acesso por 6 meses): obriga só o provedor de aplicações que atua "com fins econômicos". A FURG, autarquia federal de ensino, não se enquadra; por isso o assistente não guarda IP. Se houver ordem judicial ou pedido de autoridade (§§ 1º e 2º), a guarda passa a ser feita a partir dessa data.
- **Lei de Acesso à Informação e transparência:** o código é público no GitHub, assim como o registro de decisões (este diretório), e o resumo semanal sai em issue pública, sempre sem o texto das perguntas.

## 4. Segurança da informação

- A revisão de segurança de 11/2026 (`docs/revisao-seguranca-2026-11.md`) tem todos os itens importantes e menores corrigidos ou mitigados.
- **Transporte:** só HTTPS. Os domínios `.dev` estão na lista de pré-carga de HSTS dos navegadores.
- **Acesso:** o Worker só aceita as origens da FURG (`config/origens.json`). Há limite por minuto e por dia por visitante e cota diária do bot inteiro.
- **Chaves:** ficam como segredos do Cloudflare e do GitHub. O token de indexação é separado e restrito. O painel e a reindexação exigem senha de 32 ou mais caracteres, comparada em tempo constante.
- **Integridade da conversa:** o histórico é assinado com HMAC, e mensagem forjada é descartada.
- **Cabeçalhos:**
  - respostas JSON com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`;
  - páginas `/painel` e `/privacidade` com `Content-Security-Policy` restritiva, `Referrer-Policy: no-referrer` e `frame-ancestors 'none'`.
- **Conteúdo:** os trechos das páginas entram como material de consulta, nunca como instrução (regra 10). As respostas sem fonte são trocadas pela orientação de procurar a COPERSE.

## 5. Acessibilidade (LBI art. 63, eMAG 3.1 e WCAG)

A LBI exige acessibilidade "conforme as melhores práticas e diretrizes" internacionais. O eMAG 3.1, obrigatório no governo federal, foi feito a partir da WCAG 2.0. O assistente é testado contra a WCAG 2.2, níveis A e AA, que inclui a 2.0.

- **Teste automático:** axe-core em `widget/test/acessibilidade.test.ts`, com o widget fechado, aberto e com resposta (fontes, sugestões, avaliação e contato). Zero violações. O teste roda a cada mudança.
- **Contraste**, calculado à mão porque o axe não mede no ambiente de teste:
  - textos de 5,49:1 a 15,8:1;
  - cor do site, validada no carregamento (mínimo de 4,5:1 com o branco);
  - bordas do campo e dos botões de voto corrigidas de 1,82:1 para 3,76:1 (WCAG 1.4.11).
- **Teclado e leitor de tela:**
  - janela com `role="dialog"`, foco preso dentro dela, Esc fecha e o foco volta ao botão;
  - mensagens novas anunciadas por `aria-live`;
  - ícones com `aria-hidden` e botões com nome;
  - `lang="pt-BR"` no widget e alvos de toque de 24 px ou mais.
- **Movimento e tamanho:** respeita a redução de movimento do sistema; ocupa a tela inteira até 600 px de largura; campo com 16 px no celular, para evitar zoom.
- **Pendente (teste manual):**
  - conferir com leitor de tela real (NVDA no Windows e TalkBack no Android) e com zoom de 200%;
  - o símbolo de acessibilidade exigido no art. 63, §1º, é dos sites (Joomla), não do widget.

## 6. Decisões fora do código

1. **Termos da API Gemini e menores de 18 anos.** Os termos dizem que a API não pode ser usada em site ou aplicativo "likely to be accessed by individuals under the age of 18". Candidatos do Vestibular e do SiSU podem ter 17 anos.
   - A restrição não depende do serviço ser pago.
   - **Decisão** da Procuradoria e da Encarregada:
     - aceitar o risco;
     - consultar o Google;
     - ou trocar o provedor. O provedor é trocável por variável de ambiente, por exemplo para a Vertex AI no Google Cloud, cujos termos precisam ser conferidos antes.
2. **Validar o texto de `/privacidade`** com a Encarregada (base legal e art. 33) e registrar o tratamento no inventário da FURG.
3. **Relatório de impacto:** decidir se é necessário.
4. **Teste manual de acessibilidade** com leitor de tela, antes de colar o widget nos três sites.
