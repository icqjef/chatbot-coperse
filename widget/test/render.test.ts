import { describe, expect, it } from 'vitest';
import { renderResposta } from '../src/render';

const fonte = {
  titulo: 'Edital',
  url: 'https://coperse.furg.br/e',
  site: 'coperse.furg.br',
  data: '2026-11-12T20:07:07.139Z',
};

describe('renderResposta', () => {
  it('marcador vira sup e a fonte vira link seguro', () => {
    const el = renderResposta('Prazo 10/12 [1].', [fonte]);
    expect(el.querySelector('sup')!.textContent).toBe('1');
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://coperse.furg.br/e');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
    expect(el.querySelector('.texto')!.textContent).toBe('Prazo 10/12 1.');
  });
  it('HTML na resposta vira texto', () => {
    const el = renderResposta('<img src=x onerror=alert(1)>', []);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x');
  });
  it('url não http(s) não vira link', () => {
    const el = renderResposta('x [1]', [{ ...fonte, url: 'javascript:alert(1)' }]);
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('ol li')!.textContent).toContain('Edital');
  });
  it('data ISO vira dd/mm/aaaa', () => {
    const el = renderResposta('x', [fonte]);
    expect(el.querySelector('.meta')!.textContent).toBe(
      'coperse.furg.br · atualizado em 12/11/2026',
    );
  });
  it('sem fontes não há lista', () => {
    expect(renderResposta('x', []).querySelector('ol')).toBeNull();
  });
});
