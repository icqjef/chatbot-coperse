import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { carregarOrigens, carregarSites } from '../src/config';

const lerJson = (c: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../config/${c}`, import.meta.url), 'utf8'));

const site = (extra: Record<string, unknown> = {}) => ({
  id: 'a', nome: 'A', base: 'https://a.furg.br', paginas_chave: [],
  dominios_permitidos: ['a.furg.br'], ...extra,
});

describe('carregarSites', () => {
  it('aceita o sites.json real', () => {
    const sites = carregarSites(lerJson('sites.json'));
    expect(sites).toHaveLength(3);
    expect(sites[0]?.id).toBe('coperse');
  });
  it('rejeita site sem base', () => {
    expect(() => carregarSites([site({ base: undefined })])).toThrow(/base/);
  });
  it('rejeita base que não é https', () => {
    expect(() => carregarSites([site({ base: 'http://a.furg.br' })])).toThrow(/base/);
  });
  it('rejeita id repetido', () => {
    expect(() => carregarSites([site(), site()])).toThrow(/id/);
  });
  it('aplica profundidade 2 quando ausente', () => {
    expect(carregarSites([site()])[0]?.profundidade).toBe(2);
  });
  it('rejeita entrada que não é lista', () => {
    expect(() => carregarSites({})).toThrow(/lista/);
  });
  it('aceita processo_padrao texto e recusa não texto', () => {
    expect(carregarSites([site({ processo_padrao: 'sisu' })])[0]?.processo_padrao).toBe('sisu');
    expect(() => carregarSites([site({ processo_padrao: 3 })])).toThrow(/processo_padrao/);
  });
});

describe('carregarOrigens', () => {
  it('aceita o origens.json real', () => {
    expect(carregarOrigens(lerJson('origens.json'))).toHaveLength(6);
  });
  it('rejeita "*"', () => {
    expect(() => carregarOrigens(['*'])).toThrow(/origem/i);
  });
  it('rejeita origem com caminho ou sem https', () => {
    expect(() => carregarOrigens(['https://a.furg.br/x'])).toThrow(/origem/i);
    expect(() => carregarOrigens(['http://a.furg.br'])).toThrow(/origem/i);
  });
});
