import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarAvaliar, criarEnviar } from '../src/conversa';
import { ESPERA_CONVITE_MS, montar, type Widget } from '../src/interface';
import { perfilDoSite } from '../src/perfil';
import type { Avaliar, Enviar } from '../src/tipos';

const config = { api: 'https://w.example', cor: '#8b0000' };
let w: Widget;
const q = <T extends Element>(s: string) => w.raiz.querySelector(s) as T;
const todos = (s: string) => [...w.raiz.querySelectorAll(s)];
const pronto = () => new Promise((r) => setTimeout(r, 0));
const fonte = { titulo: 'Edital', url: 'https://coperse.furg.br/e', site: 'coperse', data: '2026-11-12T00:00:00Z' };

function abrirCom(enviar: Enviar, extra: { avaliar?: Avaliar; host?: string } = {}) {
  document.body.replaceChildren();
  w = montar(config, { enviar, ...extra });
  w.abrir();
}
async function perguntar(t: string) {
  q<HTMLTextAreaElement>('textarea').value = t;
  q<HTMLButtonElement>('.enviar').click();
  await pronto();
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('perfil por site', () => {
  it('sisu e vestibular têm boas-vindas e assuntos próprios; outros usam o geral', () => {
    expect(perfilDoSite('sisu.furg.br').sugestoes[0]).toBe('Como funciona o SiSU na FURG?');
    expect(perfilDoSite('sisu3.furg.br')).toBe(perfilDoSite('sisu.furg.br'));
    expect(perfilDoSite('www.vestibular.furg.br').convite).toContain('Vestibular');
    expect(perfilDoSite('coperse.furg.br')).toBe(perfilDoSite('exemplo.com'));
  });
  it('o widget no sisu mostra os assuntos do SiSU', () => {
    abrirCom(vi.fn(), { host: 'sisu.furg.br' });
    expect(q('.msg.bot').textContent).toContain('SiSU na FURG');
    expect(todos('.sugestoes button')[0]!.textContent).toBe('Como funciona o SiSU na FURG?');
  });
});

describe('depois da resposta', () => {
  it('sugestões do servidor viram botões que perguntam; somem na próxima pergunta', async () => {
    const enviar = vi
      .fn()
      .mockResolvedValue({ resposta: 'R [1]', fontes: [fonte], assinatura: 's', sugestoes: ['Qual o valor?', 'Tem cotas?'] });
    abrirCom(enviar);
    await perguntar('Quando é a prova?');
    expect(todos('.sugestoes button').map((b) => b.textContent)).toEqual(['Qual o valor?', 'Tem cotas?']);
    expect(q('.sugestoes').getAttribute('aria-label')).toBe('Você também pode perguntar');
    (todos('.sugestoes button')[0] as HTMLButtonElement).click();
    await pronto();
    expect(enviar).toHaveBeenLastCalledWith('Qual o valor?', expect.any(Array));
    expect(todos('.sugestoes')).toHaveLength(1);
  });
  it('sem base: botão de contato e assuntos frequentes, sem avaliação', async () => {
    abrirCom(vi.fn().mockResolvedValue({ resposta: 'Não encontrei.', fontes: [], assinatura: 's', contato: true }));
    await perguntar('receita de bolo');
    const a = q<HTMLAnchorElement>('.acao a');
    expect(a.textContent).toBe('Escrever para a COPERSE');
    expect(a.href).toMatch(/^mailto:coperse@furg\.br\?subject=/);
    expect(q('.sugestoes').getAttribute('aria-label')).toBe('Assuntos frequentes');
    expect(q('.avaliacao')).toBeNull();
  });
  it('👎 envia a avaliação assinada, agradece, oferece contato e não volta depois de recarregar', async () => {
    const avaliar = vi.fn().mockResolvedValue(undefined);
    abrirCom(vi.fn().mockResolvedValue({ resposta: 'R [1]', fontes: [fonte], assinatura: 'sig' }), { avaliar });
    await perguntar('Quando é a prova?');
    (todos('.voto')[1] as HTMLButtonElement).click();
    expect(avaliar).toHaveBeenCalledWith({ util: false, resposta: 'R [1]', assinatura: 'sig', fontes: ['https://coperse.furg.br/e'] });
    expect(q('.avaliacao').textContent).toContain('Obrigado pela avaliação!');
    expect(q('.avaliacao a')).not.toBeNull();
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    expect(todos('.voto')).toHaveLength(0);
  });
  it('resposta sem assinatura não pede avaliação', async () => {
    abrirCom(vi.fn().mockResolvedValue({ resposta: 'R [1]', fontes: [fonte] }));
    await perguntar('x?');
    expect(q('.avaliacao')).toBeNull();
  });
  it('indicador de digitação tem os pontos escondidos do leitor de tela', async () => {
    let soltar: (v: unknown) => void = () => {};
    abrirCom(vi.fn().mockReturnValue(new Promise((r) => (soltar = r))));
    q<HTMLTextAreaElement>('textarea').value = 'x';
    q<HTMLButtonElement>('.enviar').click();
    expect(q('.digitando .pontos').getAttribute('aria-hidden')).toBe('true');
    expect(q('[role="status"]').textContent).toBe('Pensando…');
    soltar({ resposta: 'ok', fontes: [] });
    await pronto();
  });
});

describe('nova conversa', () => {
  it('limpa as mensagens e o estado e mostra os assuntos de novo', async () => {
    abrirCom(vi.fn().mockResolvedValue({ resposta: 'R [1]', fontes: [fonte] }));
    await perguntar('x?');
    q<HTMLButtonElement>('.nova').click();
    expect(todos('.msg')).toHaveLength(1);
    expect(todos('.sugestoes button')).toHaveLength(4);
    expect(JSON.parse(sessionStorage.getItem('chatbot-coperse')!).itens).toEqual([]);
    expect(w.raiz.activeElement).toBe(q('textarea'));
  });
});

describe('convite proativo', () => {
  it('aparece uma vez, depois da espera, sem tirar o foco; clicar abre o painel', () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
    vi.advanceTimersByTime(ESPERA_CONVITE_MS);
    expect(q<HTMLElement>('.convite').hidden).toBe(false);
    expect(w.raiz.activeElement).toBeNull();
    q<HTMLButtonElement>('.convite-texto').click();
    expect(q<HTMLElement>('.painel').hidden).toBe(false);
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
    w.fechar();
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    vi.advanceTimersByTime(ESPERA_CONVITE_MS * 2);
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
  });
  it('dispensar fecha o convite e devolve o foco ao botão', () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    w = montar(config, { enviar: vi.fn() });
    vi.advanceTimersByTime(ESPERA_CONVITE_MS);
    q<HTMLButtonElement>('.convite-fechar').click();
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
    expect(w.raiz.activeElement).toBe(q('.botao'));
  });
  it('desligado por configuração ou se a pessoa abriu antes', () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    w = montar({ ...config, convite: false }, { enviar: vi.fn() });
    vi.advanceTimersByTime(ESPERA_CONVITE_MS);
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
    document.body.replaceChildren();
    sessionStorage.clear();
    w = montar(config, { enviar: vi.fn() });
    w.abrir();
    vi.advanceTimersByTime(ESPERA_CONVITE_MS);
    expect(q<HTMLElement>('.convite').hidden).toBe(true);
  });
});

describe('rede', () => {
  it('criarEnviar lê sugestões (até 3, curtas) e contato', async () => {
    const f = vi.fn().mockResolvedValue(
      Response.json({ resposta: 'r', fontes: [], sugestoes: ['a?', 7, 'x'.repeat(81), 'b?', 'c?', 'd?'], contato: true }),
    );
    expect(await criarEnviar('https://w', f)('p', [])).toEqual({ resposta: 'r', fontes: [], sugestoes: ['a?', 'b?', 'c?'], contato: true });
  });
  it('criarAvaliar posta em /avaliar e engole falha de rede', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('rede'));
    await expect(criarAvaliar('https://w', f)({ util: true, resposta: 'r', assinatura: 's', fontes: [] })).resolves.toBeUndefined();
    expect(f.mock.calls[0]![0]).toBe('https://w/avaliar');
  });
});
