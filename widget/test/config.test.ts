import { describe, expect, it } from 'vitest';
import { contraste, lerConfig } from '../src/config';

function script(src: string, cor?: string): HTMLScriptElement {
  const s = document.createElement('script');
  s.src = src;
  if (cor !== undefined) s.setAttribute('data-cor', cor);
  return s;
}

describe('lerConfig', () => {
  it('usa a origem do src e a cor padrão', () => {
    expect(lerConfig(script('https://w.example/widget.js'))).toEqual({
      api: 'https://w.example',
      cor: '#1f5fbf',
    });
  });
  it('aceita data-cor com contraste suficiente', () => {
    expect(lerConfig(script('https://w.example/widget.js', '#8b0000')).cor).toBe('#8b0000');
  });
  it.each(['#ffff00', 'red', '#12345', 'javascript:x'])('rejeita data-cor %s', (cor) => {
    expect(lerConfig(script('https://w.example/widget.js', cor)).cor).toBe('#1f5fbf');
  });
  it('sem script, api vazio', () => {
    expect(lerConfig(null).api).toBe('');
  });
});

describe('contraste', () => {
  it('azul padrão cumpre AA e branco é 1', () => {
    expect(contraste('#1f5fbf')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff')).toBeCloseTo(1, 5);
  });
});
