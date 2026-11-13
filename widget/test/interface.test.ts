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

describe('conversa', () => {
  const fonte = {
    titulo: 'Edital',
    url: 'https://coperse.furg.br/e',
    site: 'coperse.furg.br',
    data: '2026-11-12T00:00:00Z',
  };
  const ok = { resposta: 'Resp [1]', fontes: [fonte] };
  const pronto = () => new Promise((r) => setTimeout(r, 0));
  const montarCom = (enviar: ReturnType<typeof vi.fn>) => {
    document.body.replaceChildren();
    w = montar(config, { enviar });
    w.abrir();
    return enviar;
  };
  const digitar = (t: string) => {
    q<HTMLTextAreaElement>('textarea').value = t;
  };
  const enter = (shift = false) =>
    q('textarea').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: shift,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  const clicarEnviar = () => q<HTMLButtonElement>('.enviar').click();

  beforeEach(() => sessionStorage.clear());

  it('Enter envia, Shift+Enter não', async () => {
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    digitar('Oi');
    enter(true);
    expect(env).not.toHaveBeenCalled();
    enter();
    await pronto();
    expect(env).toHaveBeenCalledWith('Oi', []);
    expect(q('.msg.usu').textContent).toBe('Oi');
    expect(q('.msgs').textContent).toContain('Resp');
    expect(q('.msgs sup').textContent).toBe('1');
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('');
  });

  it('durante o envio desativa campo e botão e mostra Pensando…', async () => {
    let fim!: (v: unknown) => void;
    montarCom(vi.fn().mockReturnValue(new Promise((r) => (fim = r))));
    digitar('Oi');
    clicarEnviar();
    expect(q<HTMLTextAreaElement>('textarea').disabled).toBe(true);
    expect(q<HTMLButtonElement>('.enviar').disabled).toBe(true);
    expect(q('[role="status"]').textContent).toBe('Pensando…');
    fim(ok);
    await pronto();
    expect(w.raiz.querySelector('[role="status"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('textarea').disabled).toBe(false);
  });

  it('a resposta fica dentro da região aria-live polite', async () => {
    montarCom(vi.fn().mockResolvedValue(ok));
    digitar('Oi');
    clicarEnviar();
    await pronto();
    expect(q('[aria-live="polite"]').textContent).toContain('Resp');
  });

  it('clique numa sugestão envia o texto dela', async () => {
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    q<HTMLButtonElement>('.sugestoes button').click();
    await pronto();
    expect(env).toHaveBeenCalledWith('Quando são as inscrições?', []);
  });

  it('pergunta só com espaços não é enviada', () => {
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    digitar('   ');
    clicarEnviar();
    expect(env).not.toHaveBeenCalled();
  });

  it('erro mostra a mensagem, libera o campo e não entra no histórico', async () => {
    const env = montarCom(
      vi.fn().mockRejectedValueOnce({ mensagem: 'Muitas perguntas' }).mockResolvedValue(ok),
    );
    digitar('A');
    clicarEnviar();
    await pronto();
    expect(q('.msgs').textContent).toContain('Muitas perguntas');
    expect(q<HTMLTextAreaElement>('textarea').disabled).toBe(false);
    digitar('B');
    clicarEnviar();
    await pronto();
    expect(env).toHaveBeenLastCalledWith('B', []);
  });

  it('a segunda pergunta envia o histórico da primeira troca', async () => {
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    digitar('A');
    clicarEnviar();
    await pronto();
    digitar('B');
    clicarEnviar();
    await pronto();
    expect(env).toHaveBeenLastCalledWith('B', [
      { papel: 'usuario', texto: 'A' },
      { papel: 'modelo', texto: 'Resp [1]' },
    ]);
  });

  it('salva e restaura conversa e estado aberto no sessionStorage', async () => {
    montarCom(vi.fn().mockResolvedValue(ok));
    digitar('A');
    clicarEnviar();
    await pronto();
    expect(sessionStorage.getItem('chatbot-coperse')).toContain('Resp');
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    expect(q<HTMLElement>('.painel').hidden).toBe(false);
    expect(q('.msg.usu').textContent).toBe('A');
    expect(q('.msgs a').getAttribute('href')).toBe(fonte.url);
    w.fechar();
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    expect(q<HTMLElement>('.painel').hidden).toBe(true);
  });

  it('sessionStorage que lança não quebra o widget', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('x');
    });
    try {
      const env = montarCom(vi.fn().mockResolvedValue(ok));
      digitar('A');
      clicarEnviar();
      await pronto();
      expect(env).toHaveBeenCalled();
      expect(q('.msgs').textContent).toContain('Resp');
    } finally {
      spy.mockRestore();
      spy2.mockRestore();
    }
  });

  it('Tab e Shift+Tab passam pelos links das fontes', async () => {
    montarCom(vi.fn().mockResolvedValue(ok));
    digitar('A');
    clicarEnviar();
    await pronto();
    const link = q<HTMLElement>('.msgs a');
    link.focus();
    tecla(link, 'Tab');
    expect(w.raiz.activeElement).toBe(q('textarea'));
    link.focus();
    tecla(link, 'Tab', true);
    expect(w.raiz.activeElement).toBe(q('.fechar'));
    q<HTMLElement>('textarea').focus();
    tecla(q('textarea'), 'Tab', true);
    expect(w.raiz.activeElement).toBe(link);
  });

  it('erro remove a bolha da pergunta que falhou', async () => {
    montarCom(vi.fn().mockRejectedValue({ mensagem: 'Falhou' }));
    digitar('A');
    clicarEnviar();
    await pronto();
    expect(w.raiz.querySelector('.msg.usu')).toBeNull();
    expect(q('.msgs').textContent).toContain('Falhou');
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('A');
  });

  it('formas corrompidas no sessionStorage não impedem a montagem', () => {
    const formas = [
      { aberto: true, itens: [{ papel: 'modelo', texto: 'x', fontes: [null] }] },
      { aberto: true, itens: [{ papel: 'modelo', texto: 'x', fontes: { length: 1 } }] },
      [1, 2],
      'texto',
      { aberto: true, itens: [{ papel: 'outro', texto: 'x' }, null, 5] },
      { aberto: true, itens: [{ papel: 'modelo', texto: 'x', fontes: [{ titulo: 1 }] }] },
    ];
    for (const f of formas) {
      sessionStorage.setItem('chatbot-coperse', JSON.stringify(f));
      document.body.replaceChildren();
      expect(() => (w = montar(config, { enviar: vi.fn() }))).not.toThrow();
      expect(q('.msgs a')).toBeNull();
    }
  });

  it('guarda e restaura só as últimas 20 mensagens', async () => {
    const itens = Array.from({ length: 30 }, (_, i) => ({
      papel: i % 2 ? 'modelo' : 'usuario',
      texto: `m${i}`,
    }));
    sessionStorage.setItem('chatbot-coperse', JSON.stringify({ aberto: true, itens }));
    montarCom(vi.fn().mockResolvedValue(ok));
    expect(w.raiz.querySelectorAll('.msgs .msg:not(:first-child)')).toHaveLength(20);
    digitar('N');
    clicarEnviar();
    await pronto();
    const salvo = JSON.parse(sessionStorage.getItem('chatbot-coperse')!);
    expect(salvo.itens).toHaveLength(20);
    expect(salvo.itens[19].papel).toBe('modelo');
  });

  it('restaurado aberto rola até a mensagem mais recente após montar', () => {
    const itens = [
      { papel: 'usuario', texto: 'A' },
      { papel: 'modelo', texto: 'B' },
    ];
    sessionStorage.setItem('chatbot-coperse', JSON.stringify({ aberto: true, itens }));
    const spy = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(777);
    try {
      document.body.replaceChildren();
      w = montar(config, { enviar: vi.fn() });
      expect(q<HTMLElement>('.msgs').scrollTop).toBe(777);
    } finally {
      spy.mockRestore();
    }
  });

  it('falha ao desenhar a resposta não grava nada no estado', async () => {
    const env = montarCom(
      vi.fn().mockResolvedValueOnce({ resposta: 'R', fontes: [null, fonte] }).mockResolvedValue(ok),
    );
    digitar('A');
    clicarEnviar();
    await pronto();
    expect(q('.msgs').textContent).toContain('Não consegui falar');
    expect(sessionStorage.getItem('chatbot-coperse') ?? '').not.toContain('"R"');
    digitar('B');
    clicarEnviar();
    await pronto();
    expect(env).toHaveBeenLastCalledWith('B', []);
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
