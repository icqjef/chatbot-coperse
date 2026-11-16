/**
 * GET /privacidade: aviso de privacidade do assistente (LGPD, arts. 9º, 23 e 41), ligado pelo widget.
 * Página estática, sem script; o texto deve acompanhar o que o código faz (ver docs/conformidade.md).
 */

const ATUALIZADO = '15/11/2026';

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacidade do Assistente COPERSE</title>
<style>
  :root { color-scheme: light dark; --texto: #1d232a; --fundo: #ffffff; --suave: #4a535c; --linha: #d5dbe1; --link: #7a0019; }
  @media (prefers-color-scheme: dark) { :root { --texto: #e8ebef; --fundo: #14181c; --suave: #b6bec7; --linha: #39414a; --link: #ff9fae; } }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .5rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; padding-top: 1rem; border-top: 1px solid var(--linha); }
  p, li { max-width: 70ch; }
  ul { padding-left: 1.25rem; }
  li + li { margin-top: .35rem; }
  a { color: var(--link); text-underline-offset: .15em; }
  a:focus-visible { outline: 3px solid var(--link); outline-offset: 2px; }
  .data { color: var(--suave); font-size: .95rem; }
  .pular { position: absolute; left: -999px; }
  .pular:focus { left: 1rem; top: 1rem; background: var(--fundo); padding: .5rem; }
</style>
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<main id="conteudo">
<h1>Privacidade do Assistente COPERSE</h1>
<p class="data">Atualizado em ${ATUALIZADO}.</p>
<p>Este aviso explica, em linguagem simples, que dados o assistente virtual da COPERSE trata quando você faz uma pergunta, para quê, por quanto tempo e com quem eles são compartilhados. O assistente responde dúvidas sobre o ingresso na FURG, os cursos de graduação e o começo da vida acadêmica, com base nas páginas oficiais.</p>

<h2>Quem é responsável</h2>
<ul>
  <li>Controladora: Universidade Federal do Rio Grande (FURG), por meio da Comissão Permanente do Processo Seletivo (COPERSE). Contato: <a href="mailto:coperse@furg.br">coperse@furg.br</a>.</li>
  <li>Encarregada pelo tratamento de dados pessoais da FURG: veja a identificação e o contato em <a href="https://lgpd.furg.br/encarregada">lgpd.furg.br/encarregada</a>.</li>
  <li>Este aviso segue a <a href="https://lgpd.furg.br/images/normativas_FURG/Resolucao_27_CONSUN_2023.pdf">Política de Proteção de Dados Pessoais e Privacidade da FURG</a> (Resolução nº 27/CONSUN/2023).</li>
</ul>

<h2>Não digite dados pessoais</h2>
<p>O assistente não precisa saber quem você é. Não informe CPF, nome, e-mail, telefone, número de inscrição ou outros dados pessoais. Se você digitar algum deles, o assistente troca CPF, e-mail, telefone, nome que você declarar ("meu nome é…") e números de inscrição, matrícula ou protocolo por "[removido]" antes de usar ou guardar a pergunta. O assistente não consulta a sua situação individual (inscrição, homologação, nota, recurso): para isso, use o sistema de inscrição ou escreva para a COPERSE.</p>

<h2>O que é tratado e por quanto tempo</h2>
<ul>
  <li><strong>Texto da pergunta</strong>, já com a troca acima: usado para buscar a resposta nas páginas oficiais e gerá-la. Perguntas feitas nos sites da FURG são guardadas sem nenhuma identificação de quem perguntou, para melhorar o assistente (ver quais dúvidas ficaram sem resposta), e apagadas automaticamente depois de 90 dias. Saudações e agradecimentos não são guardados.</li>
  <li><strong>Avaliação da resposta</strong> (👍 ou 👎), quando você clica: guarda a resposta do assistente e as páginas citadas, sem a pergunta e sem identificação. Apagada depois de 1 ano.</li>
  <li><strong>Contagem de perguntas por dia</strong>: só números, sem texto.</li>
  <li><strong>Limite de uso</strong>: para impedir abusos, o assistente calcula um código a partir do endereço IP e da data e o mantém só na memória durante o dia. O endereço IP não é guardado.</li>
  <li><strong>Conversa na sua tela</strong>: fica só no seu navegador (armazenamento da sessão) e some quando você fecha a aba ou clica em "Nova conversa".</li>
  <li>O assistente não usa cookies, não faz rastreamento de navegação e não tem publicidade.</li>
</ul>

<h2>Para que e com qual base legal</h2>
<p>Os dados são tratados para atender a finalidade pública da FURG de informar os candidatos sobre o ingresso, conforme o art. 23 da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais, LGPD), para manter a qualidade das respostas e para proteger o serviço contra abusos.</p>

<h2>Com quem é compartilhado</h2>
<ul>
  <li><strong>Cloudflare</strong>: hospeda o assistente e o banco de dados. Os dados trafegam com criptografia (HTTPS).</li>
  <li><strong>Google (API Gemini)</strong>: recebe o texto da pergunta, já com a troca acima, e trechos das páginas oficiais, e devolve a resposta. O serviço é contratado na modalidade paga: pelos termos do Google, as perguntas e respostas não são usadas para melhorar os produtos do Google e ficam registradas só por tempo limitado, para coibir uso indevido.</li>
  <li>Esses fornecedores podem processar dados fora do Brasil (transferência internacional, art. 33 da LGPD).</li>
  <li>Os dados não são vendidos nem cedidos a outras pessoas ou empresas.</li>
</ul>

<h2>Inteligência artificial</h2>
<p>As respostas são geradas automaticamente por um modelo de inteligência artificial, a partir das páginas oficiais da COPERSE, do SiSU, do Vestibular e do portal da FURG, sempre com a indicação das fontes. O assistente pode errar: confira sempre no edital. Ele não toma nenhuma decisão sobre você; quem decide sobre inscrição, classificação e matrícula é a FURG, nos termos de cada edital.</p>

<h2>Seus direitos</h2>
<p>Você pode pedir confirmação de que há tratamento, acesso, correção, eliminação, informações sobre o compartilhamento e os demais direitos do art. 18 da LGPD:</p>
<ul>
  <li>pelo formulário da Encarregada em <a href="https://lgpd.furg.br/contato">lgpd.furg.br/contato</a>;</li>
  <li>ou pela Ouvidoria da FURG, no <a href="https://falabr.cgu.gov.br/">Fala.BR</a>.</li>
</ul>
<p>Como as perguntas são guardadas sem identificação, para localizar uma delas informe o dia, o horário aproximado e o texto. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

<h2>Segurança</h2>
<p>O acesso é feito só por HTTPS; as chaves dos serviços ficam guardadas como segredos, fora do código; o painel de acompanhamento exige senha; e há limites de uso por visitante. Incidentes de segurança são tratados conforme a <a href="https://segurancadainformacao.furg.br/">Política de Segurança da Informação da FURG</a>.</p>
</main>
</body>
</html>
`;

export function paginaPrivacidade(): Response {
  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
