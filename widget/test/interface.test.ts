import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESTILOS } from '../src/estilos';
import { mailtoContato, montar, textoParaGuardar, type Widget } from '../src/interface';
import type { Enviar } from '../src/tipos';

const config = { api: 'https://w.example', cor: '#8b0000' };
let w: Widget;

const q = <T extends Element>(s: string) => w.raiz.querySelector(s) as T;
const tecla = (alvo: Element, key: string, shiftKey = false) =>
  alvo.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true }));

beforeEach(() => {
  document.body.replaceChildren();
  w = montar(config);
});

describe('estilos móveis', () => {
  it('campo com 16px, fallback de inset, overscroll e safe-area', () => {
    const movel = ESTILOS.slice(ESTILOS.indexOf('@media (max-width: 600px)'));
    expect(movel).toContain('.entrada textarea { font-size: 16px; }');
    expect(movel).toContain('top: 0; right: 0; bottom: 0; left: 0; inset: 0;');
    expect(ESTILOS).toContain('overscroll-behavior: contain');
    expect(ESTILOS).toContain('padding-bottom: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom))');
  });
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
    expect(q('.cab p').textContent).toBe('Respostas automáticas (inteligência artificial) com base nas páginas oficiais da FURG');
    const priv = q<HTMLAnchorElement>('.aviso a.privacidade');
    expect(priv.href).toBe('https://w.example/privacidade');
    expect(priv.rel).toBe('noopener');
    expect(w.host.lang).toBe('pt-BR');
    expect(q('.aviso').textContent).toContain('Não digite CPF, nome ou outros dados pessoais.');
    expect(q('.aviso').textContent).toContain('As perguntas são guardadas sem identificação por 90 dias');
    expect(q('.msg.bot').textContent).toContain(
      'Olá! Tire dúvidas sobre o Vestibular, o SiSU, os processos seletivos específicos e os cursos de graduação da FURG. Eu respondo com base nas páginas oficiais e mostro de onde veio cada informação.',
    );
    expect([...w.raiz.querySelectorAll('.sugestoes button')].map((b) => b.textContent)).toEqual([
      'O que está com inscrição aberta agora?',
      'Quando são as inscrições do Vestibular?',
      'Como funciona o SiSU?',
      'Quais são as formas de ingresso?',
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
    w = montar(config, { enviar: enviar as unknown as Enviar });
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

  it('Próximas datas: lista as etapas com a fonte, sem usar o enviar', async () => {
    document.body.replaceChildren();
    const env = vi.fn();
    const proximas = vi.fn().mockResolvedValue({
      processos: [{ nome: 'Vestibular', ano: 2027, etapas: [{ etapa: 'Aplicação da prova', quando: '22/11/2026', fonte: { titulo: 'Cronograma', url: 'https://coperse.furg.br/c.pdf' } }] }],
    });
    w = montar(config, { enviar: env as unknown as Enviar, proximas });
    w.abrir();
    await pronto();
    q<HTMLButtonElement>('.datas').click();
    await pronto();
    expect(env).not.toHaveBeenCalled();
    const msgs = q('.msgs').textContent ?? '';
    expect(msgs).toContain('Vestibular 2027');
    expect(msgs).toContain('Aplicação da prova: 22/11/2026');
    expect(q<HTMLAnchorElement>('.msgs .fontes a').href).toBe('https://coperse.furg.br/c.pdf');
  });
  it('resposta com fonte tem Copiar e Baixar; Copiar usa a área de transferência', async () => {
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    montarCom(vi.fn().mockResolvedValue(ok));
    digitar('Quando é a prova?');
    clicarEnviar();
    await pronto();
    const [copiar, baixar] = [...w.raiz.querySelectorAll<HTMLButtonElement>('.acao-guardar')];
    expect(copiar!.textContent).toBe('Copiar');
    expect(baixar!.textContent).toBe('Baixar');
    copiar!.click();
    await pronto();
    expect(escrever).toHaveBeenCalledWith(expect.stringContaining('Pergunta: Quando é a prova?'));
    expect(q('.aviso-guardar').textContent).toBe('Resposta copiada.');
  });
  it('o link de contato leva a pergunta no e-mail', async () => {
    montarCom(vi.fn().mockResolvedValue({ resposta: 'Não encontrei. Escreva para coperse@furg.br.', fontes: [], contato: true }));
    digitar('Tem prova de redação?');
    clicarEnviar();
    await pronto();
    expect(decodeURIComponent(q<HTMLAnchorElement>('.acao .contato').href)).toContain('Tem prova de redação?');
  });
  it('aviso de retificação aparece depois do texto, com o link do documento', async () => {
    const aviso = { tipo: 'atencao', texto: 'Atenção: houve retificação em 05/11/2026.', url: 'https://coperse.furg.br/ret.pdf', titulo: 'Edital retificado' };
    montarCom(vi.fn().mockResolvedValue({ ...ok, aviso }));
    digitar('Quais documentos?');
    clicarEnviar();
    await pronto();
    const p = q('.msgs .retificacao.atencao');
    expect(p.previousElementSibling?.className).toBe('texto');
    expect(p.textContent).toContain('Atenção: houve retificação em 05/11/2026.');
    expect(q<HTMLAnchorElement>('.retificacao a').href).toBe('https://coperse.furg.br/ret.pdf');
  });
  it('resposta oficial mostra o selo da COPERSE', async () => {
    montarCom(vi.fn().mockResolvedValue({ ...ok, oficial: true }));
    digitar('Quando é a prova?');
    clicarEnviar();
    await pronto();
    expect(q('.msgs .oficial').textContent).toBe('✔ Resposta conferida pela COPERSE');
  });
  it('sugestões do uso real entram antes das fixas, até 4, ao abrir', async () => {
    document.body.replaceChildren();
    sessionStorage.clear();
    const sugestoes = vi.fn().mockResolvedValue(['Qual o valor da taxa?']);
    w = montar(config, { enviar: vi.fn() as unknown as Enviar, sugestoes });
    w.abrir();
    await pronto();
    const botoes = [...w.raiz.querySelectorAll('.sugestoes button')].map((b) => b.textContent);
    expect(botoes[0]).toBe('Qual o valor da taxa?');
    expect(botoes.length).toBe(4);
    w.abrir();
    expect(sugestoes).toHaveBeenCalledTimes(1);
  });
  describe('entrada por voz', () => {
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    });
    it('sem reconhecimento de fala no navegador, não há microfone', () => {
      document.body.replaceChildren();
      w = montar(config, {});
      expect(w.raiz.querySelector('.microfone')).toBeNull();
    });
    it('fala vira texto no campo, sem enviar; a pessoa confere e envia', () => {
      let rec: any;
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = class {
        lang = ''; interimResults = false; maxAlternatives = 0;
        onresult: any = null; onerror: any = null; onend: any = null;
        start = vi.fn(() => { rec = this; });
        stop = vi.fn(() => this.onend?.());
      };
      document.body.replaceChildren();
      const env = vi.fn();
      w = montar(config, { enviar: env as unknown as Enviar });
      w.abrir();
      const mic = q<HTMLButtonElement>('.microfone');
      mic.click();
      expect(rec.lang).toBe('pt-BR');
      expect(mic.getAttribute('aria-pressed')).toBe('true');
      expect(q('.aviso-voz').textContent).toContain('Ouvindo');
      rec.onresult({ results: [[{ transcript: 'quando é a prova' }], [{ transcript: ' do vestibular' }]] });
      expect(q<HTMLTextAreaElement>('textarea').value).toBe('quando é a prova do vestibular');
      mic.click();
      expect(rec.stop).toHaveBeenCalled();
      expect(mic.getAttribute('aria-pressed')).toBe('false');
      expect(q('.aviso-voz').textContent).toBe('Confira o texto e envie.');
      expect(env).not.toHaveBeenCalled();
    });
    it('microfone negado: mensagem clara', () => {
      let rec: any;
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = class {
        lang = ''; interimResults = false; maxAlternatives = 0;
        onresult: any = null; onerror: any = null; onend: any = null;
        start = vi.fn(() => { rec = this; });
        stop = vi.fn();
      };
      document.body.replaceChildren();
      w = montar(config, {});
      w.abrir();
      q<HTMLButtonElement>('.microfone').click();
      rec.onerror({ error: 'not-allowed' });
      expect(q('.aviso-voz').textContent).toContain('O microfone não foi liberado');
    });
  });
  it('sem datas futuras para o site, o botão não aparece (e o clique não consulta de novo)', async () => {
    document.body.replaceChildren();
    const proximas = vi.fn().mockResolvedValue({ processos: [] });
    w = montar(config, { enviar: vi.fn() as unknown as Enviar, proximas });
    w.abrir();
    await pronto();
    expect(w.raiz.querySelector('.datas')).toBeNull();
    w.abrir();
    expect(proximas).toHaveBeenCalledTimes(1);
  });
  it('sem proximas nas dependências, o botão não aparece', () => {
    document.body.replaceChildren();
    w = montar(config, {});
    expect(w.raiz.querySelector('.datas')).toBeNull();
  });

  it('prévia aparece só para quem vê a tela e some com a resposta final', async () => {
    let soltar: (v: unknown) => void = () => {};
    const env = vi.fn((_p: string, _h: unknown, aoParcial?: (t: string) => void) => {
      aoParcial?.('Parte [1].');
      return new Promise((r) => (soltar = r));
    });
    montarCom(env as unknown as ReturnType<typeof vi.fn>);
    digitar('Oi');
    clicarEnviar();
    await pronto();
    const previa = q('.previa');
    expect(previa.getAttribute('aria-hidden')).toBe('true');
    expect(previa.textContent).toContain('Parte');
    // "Pensando…" continua para o leitor de tela, mas sem a bolha visível.
    expect(q('[role=status]').className).toBe('so-leitor');
    expect(q('[role=status]').textContent).toContain('Pensando');
    soltar(ok);
    await pronto();
    expect(w.raiz.querySelector('.previa')).toBeNull();
    expect(w.raiz.querySelector('[role=status]')).toBeNull();
    expect(q('.msgs').textContent).toContain('Resp');
  });

  it('Enter envia, Shift+Enter não', async () => {
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    digitar('Oi');
    enter(true);
    expect(env).not.toHaveBeenCalled();
    enter();
    await pronto();
    expect(env).toHaveBeenCalledWith('Oi', [], expect.any(Function));
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
    const campo = q<HTMLTextAreaElement>('textarea');
    expect(campo.disabled).toBe(false);
    expect(campo.readOnly).toBe(true);
    expect(campo.getAttribute('aria-busy')).toBe('true');
    expect(q<HTMLButtonElement>('.enviar').disabled).toBe(true);
    expect(q('[role="status"]').textContent).toBe('Pensando…');
    fim(ok);
    await pronto();
    expect(w.raiz.querySelector('[role="status"]')).toBeNull();
    expect(q<HTMLTextAreaElement>('textarea').readOnly).toBe(false);
    expect(q<HTMLTextAreaElement>('textarea').hasAttribute('aria-busy')).toBe(false);
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
    expect(env).toHaveBeenCalledWith('O que está com inscrição aberta agora?', [], expect.any(Function));
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
    expect(q<HTMLTextAreaElement>('textarea').readOnly).toBe(false);
    digitar('B');
    clicarEnviar();
    await pronto();
    expect(env).toHaveBeenLastCalledWith('B', [], expect.any(Function));
  });

  it('falhas repetidas não empilham bolhas de erro', async () => {
    montarCom(vi.fn().mockRejectedValue({ mensagem: 'Falhou' }));
    for (const t of ['A', 'B']) {
      digitar(t);
      clicarEnviar();
      await pronto();
    }
    expect(w.raiz.querySelectorAll('.erro')).toHaveLength(1);
  });

  it('o foco permanece no campo durante o envio', async () => {
    let fim!: (v: unknown) => void;
    montarCom(vi.fn().mockReturnValue(new Promise((r) => (fim = r))));
    digitar('Oi');
    clicarEnviar();
    expect(w.raiz.activeElement).toBe(q('textarea'));
    fim(ok);
    await pronto();
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
    ], expect.any(Function));
  });

  it('M4: a assinatura da resposta volta no histórico, inclusive depois de recarregar a página', async () => {
    montarCom(vi.fn().mockResolvedValue({ ...ok, assinatura: 'SIG' }));
    digitar('A');
    clicarEnviar();
    await pronto();
    document.body.replaceChildren();
    const env = montarCom(vi.fn().mockResolvedValue(ok));
    digitar('B');
    clicarEnviar();
    await pronto();
    expect(env).toHaveBeenLastCalledWith('B', [
      { papel: 'usuario', texto: 'A' },
      { papel: 'modelo', texto: 'Resp [1]', assinatura: 'SIG' },
    ], expect.any(Function));
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

  it('Tab e Shift+Tab passam pelos links das fontes, pelos botões Copiar/Baixar e pelo link de privacidade', async () => {
    montarCom(vi.fn().mockResolvedValue(ok));
    digitar('A');
    clicarEnviar();
    await pronto();
    const link = q<HTMLElement>('.msgs a');
    link.focus();
    // ordem: fechar, link de privacidade do aviso, mensagens (fonte, Copiar, Baixar), campo
    const [copiar, baixar] = [...w.raiz.querySelectorAll<HTMLElement>('.acao-guardar')];
    tecla(link, 'Tab');
    expect(w.raiz.activeElement).toBe(copiar);
    link.focus();
    tecla(link, 'Tab', true);
    expect(w.raiz.activeElement).toBe(q('.privacidade'));
    q<HTMLElement>('textarea').focus();
    tecla(q('textarea'), 'Tab', true);
    expect(w.raiz.activeElement).toBe(baixar);
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
    expect(env).toHaveBeenLastCalledWith('B', [], expect.any(Function));
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
    delete window.__chatbotCoperse;
    document.body.replaceChildren();
  });
  afterEach(() => {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
  });

  it('carregar duas vezes monta um só host', async () => {
    await carregar('https://w.example/widget.js');
    await carregar('https://w.example/widget.js');
    expect(document.body.children).toHaveLength(1);
  });

  it('recoloca o host no body se a página o remover', async () => {
    await carregar('https://w.example/widget.js');
    const host = document.querySelector('#chatbot-coperse')!;
    host.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelectorAll('#chatbot-coperse')).toHaveLength(1);
    expect(document.querySelector('#chatbot-coperse')).toBe(host);
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

describe('copiar e baixar', () => {
  it('textoParaGuardar: pergunta, resposta, fontes numeradas e lembrete', () => {
    const t = textoParaGuardar('Quando é a prova?', 'Em 22/11/2026 [1].', [{ titulo: 'Edital', url: 'https://coperse.furg.br/e.pdf', site: 's', data: 'd' }], new Date('2026-11-16T12:00:00Z'));
    expect(t).toBe(
      ['Pergunta: Quando é a prova?', '', 'Resposta do Assistente COPERSE (16/11/2026):', 'Em 22/11/2026 [1].', '', 'Fontes:', '1. Edital - https://coperse.furg.br/e.pdf', '', 'Resposta automática. Confira sempre o edital oficial.'].join('\n'),
    );
  });
});

describe('e-mail já preenchido', () => {
  it('leva pergunta, resposta sem [n] e páginas citadas; sem pergunta, só o assunto', () => {
    const href = mailtoContato('Quando é a prova?', 'A prova será em 22/11/2026 [1].', [{ titulo: 'E', url: 'https://coperse.furg.br/e.pdf', site: 's', data: 'd' }]);
    expect(href.startsWith('mailto:coperse@furg.br?subject=')).toBe(true);
    const corpo = decodeURIComponent(href.split('&body=')[1]!);
    expect(corpo).toContain('Quando é a prova?');
    expect(corpo).toContain('A prova será em 22/11/2026.');
    expect(corpo).not.toContain('[1]');
    expect(corpo).toContain('https://coperse.furg.br/e.pdf');
    expect(corpo.endsWith('Minha dúvida:\n')).toBe(true);
    expect(mailtoContato()).not.toContain('body=');
  });
});
