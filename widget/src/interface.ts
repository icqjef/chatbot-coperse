import type { Config } from './config';
import { ESTILOS } from './estilos';
import type { Enviar } from './tipos';

export type Widget = { host: HTMLElement; abrir(): void; fechar(): void; raiz: ShadowRoot };

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

// A Tarefa 2 liga o envio; aqui `deps.enviar` só é aceito.
export function montar(config: Config, _deps: { enviar?: Enviar } = {}): Widget {
  const host = el('div');
  host.id = 'chatbot-coperse';
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

  function abrir(): void {
    painel.hidden = false;
    botao.hidden = true;
    campo.focus();
  }
  function fecharPainel(): void {
    painel.hidden = true;
    botao.hidden = false;
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
      const focaveis = [...painel.querySelectorAll<HTMLElement>('button, textarea')];
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

  document.body.append(host);
  return { host, abrir, fechar: fecharPainel, raiz };
}
