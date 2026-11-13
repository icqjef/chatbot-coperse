import type { Config } from './config';
import { ESTILOS } from './estilos';
import { historicoParaEnvio } from './conversa';
import { renderResposta } from './render';
import type { Enviar, Fonte, Mensagem } from './tipos';

export type Widget = { host: HTMLElement; abrir(): void; fechar(): void; raiz: ShadowRoot };

const CHAVE = 'chatbot-coperse';
const MSG_ERRO = 'Não consegui falar com o assistente. Verifique sua conexão e tente de novo.';
type Item = Mensagem & { fontes?: Fonte[] };
type Estado = { aberto: boolean; itens: Item[] };

function lerEstado(): Estado {
  try {
    const bruto = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null');
    if (bruto && Array.isArray(bruto.itens)) {
      const itens = (bruto.itens as Item[]).filter(
        (i) => i && (i.papel === 'usuario' || i.papel === 'modelo') && typeof i.texto === 'string',
      );
      return { aberto: bruto.aberto === true, itens };
    }
  } catch {
    // sessionStorage indisponível ou conteúdo inválido: começa vazio.
  }
  return { aberto: false, itens: [] };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SUGESTOES = [
  'Quando são as inscrições?',
  'Como funciona o SiSU?',
  'Quem pode participar do PS Transgênero?',
];

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

export function montar(config: Config, deps: { enviar?: Enviar } = {}): Widget {
  const host = el('div');
  host.id = 'chatbot-coperse';
  // Inline para vencer regras da página (div { ... }, * { ... }) que superam :host.
  host.style.cssText =
    'all: initial !important; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important; color: #1d232a !important; position: fixed !important; z-index: 2147483000 !important; right: 20px !important; bottom: 20px !important;';
  host.style.setProperty('--cor', config.cor);
  host.style.setProperty('--cor-escura', `color-mix(in srgb, ${config.cor} 80%, #000)`);
  const raiz = host.attachShadow({ mode: 'open' });

  const estilo = el('style');
  estilo.textContent = ESTILOS;

  const botao = el('button', 'botao');
  botao.type = 'button';
  botao.append(icone(), 'Dúvidas? Pergunte aqui');

  const painel = el('div', 'painel');
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-labelledby', 'titulo');
  painel.hidden = true;

  const cab = el('div', 'cab');
  const titulos = el('div');
  const titulo = el('h2', undefined, 'Assistente COPERSE');
  titulo.id = 'titulo';
  titulos.append(titulo, el('p', undefined, 'Respostas com base nas páginas oficiais da FURG'));
  const fechar = el('button', 'fechar', '✕');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar');
  cab.append(titulos, fechar);

  const aviso = el('div', 'aviso');
  const alerta = el('span', undefined, '⚠');
  alerta.setAttribute('aria-hidden', 'true');
  aviso.append(alerta, 'Não digite CPF, nome ou outros dados pessoais.');

  const msgs = el('div', 'msgs');
  msgs.setAttribute('aria-live', 'polite');
  const boasVindas = el(
    'div',
    'msg bot',
    'Olá! Tire dúvidas sobre o Vestibular, o SiSU e os processos seletivos específicos da FURG. Eu respondo com base nas páginas oficiais e mostro de onde veio cada informação.',
  );
  const sugestoes = el('div', 'sugestoes');
  for (const s of SUGESTOES) {
    const b = el('button', undefined, s);
    b.type = 'button';
    sugestoes.append(b);
  }
  boasVindas.append(sugestoes);
  msgs.append(boasVindas);

  const rodape = el('div', 'rodape');
  const entrada = el('div', 'entrada');
  const campo = el('textarea');
  campo.maxLength = 500;
  campo.placeholder = 'Escreva sua pergunta…';
  campo.setAttribute('aria-label', 'Sua pergunta');
  const enviar = el('button', 'enviar', '➤');
  enviar.type = 'button';
  enviar.setAttribute('aria-label', 'Enviar');
  entrada.append(campo, enviar);
  rodape.append(entrada, el('p', 'nota', 'Pode conter erros. Confira sempre o edital oficial.'));

  painel.append(cab, aviso, msgs, rodape);
  raiz.append(estilo, botao, painel);

  const estado = lerEstado();
  let enviando = false;

  function salvar(): void {
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      // Sem armazenamento: a conversa só vale enquanto a página estiver aberta.
    }
  }
  function rolar(): void {
    msgs.scrollTop = msgs.scrollHeight;
  }
  function mostrar(item: Item): void {
    if (item.papel === 'usuario') msgs.append(el('div', 'msg usu', item.texto));
    else msgs.append(renderResposta(item.texto, item.fontes ?? []));
  }

  async function perguntar(texto: string): Promise<void> {
    const pergunta = texto.trim();
    if (!pergunta || enviando || !deps.enviar) return;
    enviando = true;
    sugestoes.remove();
    campo.value = '';
    campo.disabled = true;
    enviar.disabled = true;
    msgs.append(el('div', 'msg usu', pergunta));
    const pensando = el('div', 'msg bot', 'Pensando…');
    pensando.setAttribute('role', 'status');
    msgs.append(pensando);
    rolar();
    try {
      const r = await deps.enviar(pergunta, historicoParaEnvio(estado.itens));
      pensando.remove();
      estado.itens.push({ papel: 'usuario', texto: pergunta });
      const modelo: Item = { papel: 'modelo', texto: r.resposta, fontes: r.fontes };
      estado.itens.push(modelo);
      mostrar(modelo);
      salvar();
    } catch (e) {
      pensando.remove();
      const m = (e as { mensagem?: unknown } | null)?.mensagem;
      msgs.append(el('div', 'msg bot erro', typeof m === 'string' && m ? m : MSG_ERRO));
      campo.value = pergunta;
    } finally {
      enviando = false;
      campo.disabled = false;
      enviar.disabled = false;
      rolar();
      if (!painel.hidden) campo.focus();
    }
  }

  for (const b of sugestoes.querySelectorAll('button')) {
    b.addEventListener('click', () => void perguntar(b.textContent ?? ''));
  }
  enviar.addEventListener('click', () => void perguntar(campo.value));
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void perguntar(campo.value);
    }
  });

  if (estado.itens.length) {
    sugestoes.remove();
    estado.itens.forEach(mostrar);
  }

  function abrir(): void {
    painel.hidden = false;
    botao.hidden = true;
    estado.aberto = true;
    salvar();
    campo.focus();
    rolar();
  }
  function fecharPainel(): void {
    painel.hidden = true;
    botao.hidden = false;
    estado.aberto = false;
    salvar();
    botao.focus();
  }

  botao.addEventListener('click', abrir);
  fechar.addEventListener('click', fecharPainel);
  host.addEventListener('keydown', (e) => {
    if (painel.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharPainel();
    } else if (e.key === 'Tab') {
      const focaveis = [...painel.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), a[href]')];
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const atual = raiz.activeElement;
      if (e.shiftKey && atual === primeiro) {
        e.preventDefault();
        ultimo?.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro?.focus();
      }
    }
  });

  if (estado.aberto) {
    painel.hidden = false;
    botao.hidden = true;
    rolar();
  }

  document.body.append(host);
  return { host, abrir, fechar: fecharPainel, raiz };
}
