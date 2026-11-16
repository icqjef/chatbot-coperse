import type { Config } from './config';
import { ESTILOS } from './estilos';
import { filtrarAviso, filtrarFontes, filtrarSugestoes, historicoParaEnvio } from './conversa';
import { perfilDoSite } from './perfil';
import { renderResposta } from './render';
import type { Avaliar, Aviso, BuscarProximas, Enviar, Fonte, Mensagem } from './tipos';

export type Widget = { host: HTMLElement; abrir(): void; fechar(): void; raiz: ShadowRoot };

const MAX_ITENS = 20;
const CHAVE = 'chatbot-coperse';
const MSG_ERRO = 'Não consegui falar com o assistente. Verifique sua conexão e tente de novo.';
const EMAIL = 'coperse@furg.br';
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent('Dúvida sobre processo seletivo')}`;
/** Espera antes do convite proativo (uma vez por sessão, só se a pessoa ainda não conversou). */
export const ESPERA_CONVITE_MS = 15_000;

/** `avaliado`: a pessoa já respondeu "Esta resposta ajudou?". */
type Item = Mensagem & { fontes?: Fonte[]; sugestoes?: string[]; contato?: boolean; oficial?: boolean; aviso?: Aviso; avaliado?: boolean };
/** `convidado`: o convite proativo já apareceu nesta sessão. */
type Estado = { aberto: boolean; itens: Item[]; convidado?: boolean };

function lerEstado(): Estado {
  try {
    const bruto = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null');
    if (bruto && Array.isArray(bruto.itens)) {
      const itens: Item[] = [];
      for (const i of bruto.itens) {
        if (!i || (i.papel !== 'usuario' && i.papel !== 'modelo') || typeof i.texto !== 'string') {
          continue;
        }
        const item: Item = { papel: i.papel, texto: i.texto };
        if (i.papel === 'modelo') {
          if (Array.isArray(i.fontes)) item.fontes = filtrarFontes(i.fontes);
          if (typeof i.assinatura === 'string') item.assinatura = i.assinatura;
          const sugestoes = filtrarSugestoes(i.sugestoes);
          if (sugestoes.length) item.sugestoes = sugestoes;
          if (i.contato === true) item.contato = true;
          if (i.oficial === true) item.oficial = true;
          const aviso = filtrarAviso(i.aviso);
          if (aviso) item.aviso = aviso;
          if (i.avaliado === true) item.avaliado = true;
        }
        itens.push(item);
      }
      return { aberto: bruto.aberto === true, itens: itens.slice(-MAX_ITENS), convidado: bruto.convidado === true };
    }
  } catch {
    // sessionStorage indisponível ou conteúdo inválido: começa vazio.
  }
  return { aberto: false, itens: [] };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(classe: string, texto: string, rotulo?: string): HTMLButtonElement {
  const b = el('button', classe || undefined, texto);
  b.type = 'button';
  if (rotulo) b.setAttribute('aria-label', rotulo);
  return b;
}

function icone(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  const caminho = document.createElementNS(SVG_NS, 'path');
  caminho.setAttribute('d', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z');
  svg.append(caminho);
  return svg;
}

function linkContato(texto: string, href = MAILTO): HTMLAnchorElement {
  const a = el('a', 'contato', texto);
  a.href = href;
  return a;
}

/** Texto para copiar ou baixar: pergunta, resposta com [n], fontes numeradas e o lembrete do edital. */
export function textoParaGuardar(pergunta: string | undefined, resposta: string, fontes: Fonte[], hoje = new Date()): string {
  const dia = hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return [
    ...(pergunta ? ['Pergunta: ' + pergunta, ''] : []),
    `Resposta do Assistente COPERSE (${dia}):`,
    resposta.trim(),
    ...(fontes.length ? ['', 'Fontes:', ...fontes.map((f, i) => `${i + 1}. ${f.titulo}${f.pagina ? ` (p. ${f.pagina})` : ''} - ${f.url}`)] : []),
    '',
    'Resposta automática. Confira sempre o edital oficial.',
  ].join('\n');
}

/**
 * E-mail já preenchido com a pergunta, a resposta do assistente e as páginas citadas: a COPERSE recebe o
 * contexto e a pessoa só escreve a dúvida. Tudo fica no navegador; nada passa pelo servidor do assistente.
 */
export function mailtoContato(pergunta?: string, resposta?: string, fontes: Fonte[] = []): string {
  if (!pergunta) return MAILTO;
  const limpa = (resposta ?? '').replace(/\s*\[\d+\]/g, '').trim().slice(0, 900);
  const corpo = [
    'Olá, COPERSE.',
    '',
    'Perguntei ao assistente virtual:',
    pergunta.slice(0, 500),
    '',
    ...(limpa ? ['Resposta do assistente:', limpa, ''] : []),
    ...(fontes.length ? ['Páginas citadas:', ...fontes.slice(0, 3).map((f) => f.url), ''] : []),
    'Minha dúvida:',
    '',
  ].join('\n');
  return `${MAILTO}&body=${encodeURIComponent(corpo)}`;
}

export function montar(
  config: Config,
  deps: { enviar?: Enviar; avaliar?: Avaliar; proximas?: BuscarProximas; host?: string } = {},
): Widget {
  const perfil = perfilDoSite(deps.host ?? location.hostname);
  const host = el('div');
  host.id = 'chatbot-coperse';
  // O widget fala português mesmo em página de outro idioma (leitor de tela usa a pronúncia certa).
  host.lang = 'pt-BR';
  // Inline para vencer regras da página (div { ... }, * { ... }) que superam :host.
  host.style.cssText =
    'all: initial !important; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important; color: #1d232a !important; position: fixed !important; z-index: 2147483000 !important; right: 20px !important; bottom: 20px !important;';
  host.style.setProperty('--cor', config.cor);
  host.style.setProperty('--cor-escura', `color-mix(in srgb, ${config.cor} 80%, #000)`);
  const raiz = host.attachShadow({ mode: 'open' });

  const estilo = el('style');
  estilo.textContent = ESTILOS;

  const abrirBotao = el('button', 'botao');
  abrirBotao.type = 'button';
  abrirBotao.append(icone(), 'Dúvidas? Pergunte aqui');

  // Convite proativo: balão acima do botão, como nos atendimentos on-line. Não rouba o foco.
  const convite = el('div', 'convite');
  convite.hidden = true;
  const conviteTexto = botao('convite-texto', perfil.convite);
  const conviteFechar = botao('convite-fechar', '✕', 'Dispensar convite');
  convite.append(conviteTexto, conviteFechar);

  const painel = el('div', 'painel');
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-labelledby', 'titulo');
  painel.hidden = true;

  const cab = el('div', 'cab');
  const titulos = el('div');
  const titulo = el('h2', undefined, 'Assistente COPERSE');
  titulo.id = 'titulo';
  titulos.append(titulo, el('p', undefined, 'Respostas automáticas (inteligência artificial) com base nas páginas oficiais da FURG'));
  const nova = botao('nova', '↺', 'Nova conversa');
  nova.title = 'Nova conversa';
  const fechar = botao('fechar', '✕', 'Fechar');
  cab.append(titulos, nova, fechar);

  const aviso = el('div', 'aviso');
  const alerta = el('span', undefined, '⚠');
  alerta.setAttribute('aria-hidden', 'true');
  const textoAviso = el('span', undefined, 'Não digite CPF, nome ou outros dados pessoais. As perguntas são guardadas sem identificação por 90 dias para melhorar o assistente. ');
  if (config.api) {
    const privacidade = el('a', 'privacidade', 'Privacidade') as HTMLAnchorElement;
    privacidade.href = `${config.api}/privacidade`;
    privacidade.target = '_blank';
    privacidade.rel = 'noopener';
    privacidade.setAttribute('aria-label', 'Privacidade (abre em nova aba)');
    textoAviso.append(privacidade);
  }
  aviso.append(alerta, textoAviso);

  const msgs = el('div', 'msgs');
  msgs.setAttribute('aria-live', 'polite');
  const boasVindas = el('div', 'msg bot', perfil.boasVindas);
  msgs.append(boasVindas);

  const rodape = el('div', 'rodape');
  const entrada = el('div', 'entrada');
  const campo = el('textarea');
  campo.maxLength = 500;
  campo.placeholder = 'Escreva sua pergunta…';
  campo.setAttribute('aria-label', 'Sua pergunta');
  const enviar = botao('enviar', '➤', 'Enviar');
  entrada.append(campo, enviar);
  // "Próximas datas": direto dos cronogramas conferidos, sem IA e sem gastar a cota.
  const datas = botao('datas', '📅 Próximas datas');
  const atalhos = el('div', 'atalhos');
  if (deps.proximas) atalhos.append(datas);
  rodape.append(atalhos, entrada, el('p', 'nota', 'Pode conter erros. Confira sempre o edital oficial.'));

  painel.append(cab, aviso, msgs, rodape);
  raiz.append(estilo, convite, abrirBotao, painel);

  let estado = lerEstado();
  let enviando = false;

  function salvar(): void {
    if (estado.itens.length > MAX_ITENS) estado.itens = estado.itens.slice(-MAX_ITENS);
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      // Sem armazenamento: a conversa só vale enquanto a página estiver aberta.
    }
  }
  function rolar(): void {
    msgs.scrollTop = msgs.scrollHeight;
  }

  /** Botões de pergunta pronta; somem quando a pessoa pergunta de novo. */
  function chips(textos: string[], rotulo?: string): HTMLElement {
    const caixa = el('div', 'sugestoes');
    if (rotulo) {
      caixa.setAttribute('role', 'group');
      caixa.setAttribute('aria-label', rotulo);
      caixa.append(el('p', 'rotulo', rotulo));
    }
    for (const s of textos) {
      const b = botao('', s);
      b.addEventListener('click', () => void perguntar(s));
      caixa.append(b);
    }
    return caixa;
  }

  function avaliacao(item: Item, pergunta?: string): HTMLElement {
    const caixa = el('div', 'avaliacao');
    const rotulo = el('span', undefined, 'Esta resposta ajudou?');
    const sim = botao('voto', '👍', 'Sim, ajudou');
    const nao = botao('voto', '👎', 'Não ajudou');
    const votar = (util: boolean): void => {
      item.avaliado = true;
      salvar();
      if (item.assinatura && deps.avaliar) {
        void deps.avaliar({ util, resposta: item.texto, assinatura: item.assinatura, fontes: (item.fontes ?? []).map((f) => f.url) });
      }
      caixa.replaceChildren();
      const obrigado = el('span', undefined, 'Obrigado pela avaliação!');
      obrigado.setAttribute('role', 'status');
      caixa.append(obrigado);
      if (!util) {
        caixa.append(' Tente perguntar de outro jeito ou ', linkContato(`escreva para ${EMAIL}`, mailtoContato(pergunta, item.texto, item.fontes)), '.');
      }
      campo.focus();
    };
    sim.addEventListener('click', () => votar(true));
    nao.addEventListener('click', () => votar(false));
    caixa.append(rotulo, sim, nao);
    return caixa;
  }

  /** Copiar e baixar a resposta (com pergunta e fontes), para guardar uma data ou um documento exigido. */
  function guardar(item: Item, pergunta?: string): HTMLElement {
    const caixa = el('div', 'guardar');
    const aviso = el('span', 'aviso-guardar');
    aviso.setAttribute('aria-live', 'polite');
    const texto = () => textoParaGuardar(pergunta, item.texto, item.fontes ?? []);
    const copiar = botao('acao-guardar', 'Copiar');
    copiar.addEventListener('click', () => {
      navigator.clipboard?.writeText(texto()).then(
        () => (aviso.textContent = 'Resposta copiada.'),
        () => (aviso.textContent = 'Não foi possível copiar. Selecione o texto e copie.'),
      ) ?? (aviso.textContent = 'Não foi possível copiar. Selecione o texto e copie.');
    });
    const baixar = botao('acao-guardar', 'Baixar');
    baixar.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([texto()], { type: 'text/plain;charset=utf-8' }));
      const a = el('a');
      a.href = url;
      a.download = `resposta-coperse-${new Date().toISOString().slice(0, 10)}.txt`;
      raiz.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      aviso.textContent = 'Arquivo baixado.';
    });
    caixa.append(copiar, baixar, aviso);
    return caixa;
  }

  /** `pergunta`: a mensagem da pessoa que esta resposta atende (vai no e-mail já preenchido). */
  function mostrar(item: Item, ultimo = false, pergunta?: string): void {
    if (item.papel === 'usuario') {
      msgs.append(el('div', 'msg usu', item.texto));
      return;
    }
    const fontes = item.fontes ?? [];
    const bolha = renderResposta(item.texto, fontes);
    if (item.oficial) bolha.insertBefore(el('p', 'oficial', '✔ Resposta conferida pela COPERSE'), bolha.firstChild);
    if (item.aviso) {
      const p = el('p', `retificacao ${item.aviso.tipo}`, `${item.aviso.texto} `);
      const a = el('a', undefined, item.aviso.titulo);
      a.href = item.aviso.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      p.append(a);
      bolha.querySelector('.texto')?.after(p);
    }
    if (item.contato) {
      const acao = el('div', 'acao');
      acao.append(linkContato('Escrever para a COPERSE', mailtoContato(pergunta, item.texto, item.fontes)));
      bolha.append(acao);
    }
    if (fontes.length) bolha.append(guardar(item, pergunta));
    if (fontes.length && !item.avaliado && item.assinatura) bolha.append(avaliacao(item, pergunta));
    msgs.append(bolha);
    if (!ultimo) return;
    if (item.sugestoes?.length) msgs.append(chips(item.sugestoes, 'Você também pode perguntar'));
    else if (!fontes.length) msgs.append(chips(perfil.sugestoes, 'Assuntos frequentes'));
  }

  function limparSugestoes(): void {
    for (const s of msgs.querySelectorAll('.sugestoes')) s.remove();
  }

  let relogioConvite: ReturnType<typeof setTimeout> | undefined;
  function esconderConvite(): void {
    clearTimeout(relogioConvite);
    convite.hidden = true;
  }

  async function perguntar(texto: string): Promise<void> {
    const pergunta = texto.trim();
    if (!pergunta || enviando || !deps.enviar) return;
    enviando = true;
    limparSugestoes();
    esconderConvite();
    campo.value = '';
    // readOnly (e não disabled) mantém o foco no campo.
    campo.readOnly = true;
    campo.setAttribute('aria-busy', 'true');
    enviar.disabled = true;
    nova.disabled = true;
    msgs.querySelector('.erro')?.remove();
    const bolha = el('div', 'msg usu', pergunta);
    msgs.append(bolha);
    const pensando = el('div', 'msg bot digitando');
    pensando.setAttribute('role', 'status');
    const pontos = el('span', 'pontos');
    pontos.setAttribute('aria-hidden', 'true');
    pontos.append(el('i'), el('i'), el('i'));
    pensando.append(pontos, el('span', 'so-leitor', 'Pensando…'));
    msgs.append(pensando);
    rolar();
    try {
      // Prévia enquanto o assistente escreve: só para quem vê a tela (aria-hidden). O leitor de tela segue com
      // "Pensando…" e anuncia uma vez a resposta final, que substitui a prévia.
      let previa: HTMLElement | undefined;
      const r = await deps.enviar(pergunta, historicoParaEnvio(estado.itens), (texto) => {
        const nova = renderResposta(texto, []);
        nova.classList.add('previa');
        nova.setAttribute('aria-hidden', 'true');
        if (previa) previa.replaceWith(nova);
        else {
          msgs.insertBefore(nova, pensando);
          pensando.className = 'so-leitor';
        }
        previa = nova;
        rolar();
      });
      previa?.remove();
      pensando.remove();
      const modelo: Item = { papel: 'modelo', texto: r.resposta, fontes: r.fontes };
      if (r.assinatura) modelo.assinatura = r.assinatura;
      if (r.sugestoes?.length) modelo.sugestoes = r.sugestoes;
      if (r.contato) modelo.contato = true;
      if (r.oficial) modelo.oficial = true;
      if (r.aviso) modelo.aviso = r.aviso;
      mostrar(modelo, true, pergunta);
      estado.itens.push({ papel: 'usuario', texto: pergunta }, modelo);
      salvar();
    } catch (e) {
      msgs.querySelector('.previa')?.remove();
      pensando.remove();
      bolha.remove();
      const m = (e as { mensagem?: unknown } | null)?.mensagem;
      msgs.append(el('div', 'msg bot erro', typeof m === 'string' && m ? m : MSG_ERRO));
      campo.value = pergunta;
    } finally {
      enviando = false;
      campo.readOnly = false;
      campo.removeAttribute('aria-busy');
      enviar.disabled = false;
      nova.disabled = false;
      rolar();
      if (!painel.hidden) campo.focus();
    }
  }

  async function mostrarDatas(): Promise<void> {
    if (!deps.proximas || datas.disabled) return;
    datas.disabled = true;
    limparSugestoes();
    msgs.querySelector('.erro')?.remove();
    try {
      const { processos } = await deps.proximas();
      const bolha = el('div', 'msg bot');
      if (!processos.length) {
        bolha.append('Não encontrei datas futuras nos cronogramas publicados. Consulte o edital do processo ou escreva para ', linkContato(EMAIL), '.');
      } else {
        const fontes = new Map<string, string>();
        for (const p of processos) {
          bolha.append(el('strong', undefined, `${p.nome} ${p.ano}`));
          const ul = el('ul', 'lista-datas');
          for (const e of p.etapas) {
            const li = el('li');
            li.append(`${e.etapa}: `, el('strong', undefined, e.quando));
            ul.append(li);
            fontes.set(e.fonte.url, e.fonte.titulo);
          }
          bolha.append(ul);
        }
        const lista = el('ol', 'fontes');
        for (const [url, t] of fontes) {
          const li = el('li');
          if (/^https?:\/\//.test(url)) {
            const a = el('a', undefined, t);
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            li.append(a);
          } else li.append(t);
          lista.append(li);
        }
        bolha.append(el('p', 'nota', 'Datas do cronograma oficial, conferidas com o documento:'), lista);
      }
      msgs.append(bolha);
    } catch (e) {
      const m = (e as { mensagem?: unknown } | null)?.mensagem;
      msgs.append(el('div', 'msg bot erro', typeof m === 'string' && m ? m : MSG_ERRO));
    } finally {
      datas.disabled = false;
      rolar();
    }
  }
  datas.addEventListener('click', () => void mostrarDatas());

  function recomecar(): void {
    if (enviando) return;
    estado.itens = [];
    salvar();
    msgs.replaceChildren(boasVindas);
    boasVindas.append(chips(perfil.sugestoes));
    campo.value = '';
    campo.focus();
  }

  enviar.addEventListener('click', () => void perguntar(campo.value));
  nova.addEventListener('click', recomecar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void perguntar(campo.value);
    }
  });

  if (estado.itens.length) {
    try {
      estado.itens.forEach((item, i) => mostrar(item, i === estado.itens.length - 1, estado.itens[i - 1]?.papel === 'usuario' ? estado.itens[i - 1]!.texto : undefined));
    } catch {
      // Estado restaurado inválido: descarta e começa vazio.
      msgs.replaceChildren(boasVindas);
      estado = { aberto: false, itens: [] };
    }
  }
  if (!estado.itens.length) boasVindas.append(chips(perfil.sugestoes));

  function abrir(): void {
    esconderConvite();
    painel.hidden = false;
    abrirBotao.hidden = true;
    estado.aberto = true;
    salvar();
    campo.focus();
    rolar();
  }
  function fecharPainel(): void {
    painel.hidden = true;
    abrirBotao.hidden = false;
    estado.aberto = false;
    salvar();
    abrirBotao.focus();
  }

  abrirBotao.addEventListener('click', abrir);
  conviteTexto.addEventListener('click', abrir);
  conviteFechar.addEventListener('click', () => {
    esconderConvite();
    abrirBotao.focus();
  });
  fechar.addEventListener('click', fecharPainel);
  host.addEventListener('keydown', (e) => {
    if (painel.hidden) {
      if (e.key === 'Escape' && !convite.hidden) esconderConvite();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharPainel();
    } else if (e.key === 'Tab') {
      const focaveis = [...painel.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), a[href]')];
      // Circula manualmente para que os links das fontes entrem no ciclo.
      const i = focaveis.indexOf(raiz.activeElement as HTMLElement);
      const n = focaveis.length;
      const prox = focaveis[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n];
      e.preventDefault();
      prox?.focus();
    }
  });

  if (estado.aberto) {
    painel.hidden = false;
    abrirBotao.hidden = true;
  } else if (config.convite !== false && !estado.convidado && !estado.itens.length) {
    relogioConvite = setTimeout(() => {
      if (!painel.hidden || estado.itens.length) return;
      convite.hidden = false;
      estado.convidado = true;
      salvar();
    }, ESPERA_CONVITE_MS);
  }

  document.body.append(host);
  if (estado.aberto) rolar();
  return { host, abrir, fechar: fecharPainel, raiz };
}
