import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Enviar } from '../src/tipos';
import { montar, type Widget } from '../src/interface';

let w: Widget;
beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = 'pt-BR';
  document.title = 'Teste';
  w = montar({ api: 'https://w.example', cor: '#8b0000' });
});

async function violacoes() {
  const r = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' > ')).join(', ')})`);
}

describe('acessibilidade (axe-core, WCAG 2.2 A/AA)', () => {
  it('fechado: sem violações', async () => {
    expect(await violacoes()).toEqual([]);
  });
  it('aberto: sem violações', async () => {
    (w.raiz.querySelector('.botao') as HTMLButtonElement).click();
    expect(await violacoes()).toEqual([]);
  });
  it('com resposta, fontes, sugestões, avaliação e contato: sem violações', async () => {
    document.body.replaceChildren();
    const enviar = vi.fn().mockResolvedValue({
      resposta: 'A prova será em 22/11/2026 [1].',
      fontes: [{ titulo: 'Edital', url: 'https://vestibular.furg.br/edital', site: 'vestibular', data: '2026-08-07' }],
      sugestoes: ['Qual o valor da inscrição?'],
      contato: true,
      assinatura: 'x',
    });
    w = montar({ api: 'https://w.example', cor: '#8b0000' }, { enviar: enviar as unknown as Enviar, avaliar: vi.fn() });
    w.abrir();
    (w.raiz.querySelector('textarea') as HTMLTextAreaElement).value = 'Quando é a prova?';
    (w.raiz.querySelector('.enviar') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(w.raiz.querySelector('.fontes')).not.toBeNull());
    expect(await violacoes()).toEqual([]);
  });
});
