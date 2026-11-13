import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESTILOS } from '../src/estilos';
import { montar, type Widget } from '../src/interface';

const config = { api: 'https://w.example', cor: '#8b0000' };
let w: Widget;

const q = <T extends Element>(s: string) => w.raiz.querySelector(s) as T;
const tecla = (alvo: Element, key: string, shiftKey = false) =>
  alvo.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true }));

beforeEach(() => {
  document.body.replaceChildren();
  w = montar(config);
});

describe('montar', () => {
  it('cria um host com shadowRoot e o botão com o texto exato', () => {
    expect(document.body.children).toHaveLength(1);
    expect(w.host.shadowRoot).toBe(w.raiz);
    expect(q<HTMLButtonElement>('.botao').textContent).toBe('Dúvidas? Pergunte aqui');
    expect(q<HTMLElement>('.painel').hidden).toBe(true);
  });

  it('aplica a cor como --cor no host', () => {
    expect(w.host.style.getPropertyValue('--cor')).toBe('#8b0000');
  });

  it('abre o painel com os textos exatos, oculta o botão e foca o textarea', () => {
    q<HTMLButtonElement>('.botao').click();
    const painel = q<HTMLElement>('.painel');
    expect(painel.hidden).toBe(false);
    expect(painel.getAttribute('role')).toBe('dialog');
    expect(painel.getAttribute('aria-labelledby')).toBe('titulo');
    expect(w.raiz.getElementById('titulo')!.textContent).toBe('Assistente COPERSE');
    expect(q('.cab p').textContent).toBe('Respostas com base nas páginas oficiais da FURG');
    expect(q('.aviso').textContent).toContain('Não digite CPF, nome ou outros dados pessoais.');
    expect(q('.msg.bot').textContent).toContain(
      'Olá! Tire dúvidas sobre o Vestibular, o SiSU e os processos seletivos específicos da FURG. Eu respondo com base nas páginas oficiais e mostro de onde veio cada informação.',
    );
    expect([...w.raiz.querySelectorAll('.sugestoes button')].map((b) => b.textContent)).toEqual([
      'Quando são as inscrições?',
      'Como funciona o SiSU?',
      'Quem pode participar do PS Transgênero?',
    ]);
    expect(q('.nota').textContent).toBe('Pode conter erros. Confira sempre o edital oficial.');
    expect(q<HTMLTextAreaElement>('textarea').placeholder).toBe('Escreva sua pergunta…');
    expect(q<HTMLElement>('.botao').hidden).toBe(true);
    expect(w.raiz.activeElement).toBe(q('textarea'));
  });

  it('host tem isolamento inline (position fixed e z-index)', () => {
    const estilo = w.host.getAttribute('style') ?? '';
    expect(estilo).toContain('position: fixed');
    expect(estilo).toContain('z-index: 2147483000');
    expect(estilo).toContain('all: initial');
    expect(estilo).toContain('system-ui');
    expect(estilo).toContain('color: #1d232a');
  });

  it('CSS móvel não dimensiona o host nem usa opacity no subtítulo', () => {
    const movel = ESTILOS.slice(ESTILOS.indexOf('@media (max-width: 600px)'));
    const bloco = movel.slice(0, movel.indexOf('@media (prefers'));
    expect(bloco).not.toContain(':host');
    expect(ESTILOS).not.toContain('opacity');
  });

  it('textarea limita a 500 caracteres', () => {
    expect(q<HTMLTextAreaElement>('textarea').getAttribute('maxlength')).toBe('500');
  });

  it('Esc fecha e devolve o foco ao botão', () => {
    w.abrir();
    tecla(q('textarea'), 'Escape');
    expect(q<HTMLElement>('.painel').hidden).toBe(true);
    expect(w.raiz.activeElement).toBe(q('.botao'));
  });

  it('Tab circula dentro do painel', () => {
    w.abrir();
    const focaveis = [...w.raiz.querySelectorAll<HTMLElement>('.painel button, .painel textarea')];
    const primeiro = focaveis[0]!;
    const ultimo = focaveis[focaveis.length - 1]!;
    ultimo.focus();
    tecla(ultimo, 'Tab');
    expect(w.raiz.activeElement).toBe(primeiro);
    tecla(primeiro, 'Tab', true);
    expect(w.raiz.activeElement).toBe(ultimo);
  });
});

describe('index', () => {
  const carregar = async (src: string | null) => {
    vi.resetModules();
    const s = src === null ? null : Object.assign(document.createElement('script'), { src });
    Object.defineProperty(document, 'currentScript', { value: s, configurable: true });
    await import('../src/index');
  };
  beforeEach(() => {
    document.body.replaceChildren();
    delete window.__chatbotCoperse;
  });
  afterEach(() => {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
  });

  it('carregar duas vezes monta um só host', async () => {
    await carregar('https://w.example/widget.js');
    await carregar('https://w.example/widget.js');
    expect(document.body.children).toHaveLength(1);
  });

  it('não monta sem api', async () => {
    await carregar(null);
    expect(document.body.children).toHaveLength(0);
    expect(window.__chatbotCoperse).toBeUndefined();
  });

  it('sem body na carga, monta só após DOMContentLoaded', async () => {
    const body = document.body;
    body.remove();
    try {
      await carregar('https://w.example/widget.js');
      expect(document.querySelector('#chatbot-coperse')).toBeNull();
      document.documentElement.append(body);
      document.dispatchEvent(new Event('DOMContentLoaded'));
      expect(document.querySelectorAll('#chatbot-coperse')).toHaveLength(1);
    } finally {
      if (!body.isConnected) document.documentElement.append(body);
    }
  });
});
