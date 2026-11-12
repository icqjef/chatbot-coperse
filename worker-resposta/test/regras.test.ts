import { describe, expect, it } from 'vitest';
import { SEM_BASE, extrairFontes, mascararDadosPessoais, montarSistema } from '../src/regras';
import type { Trecho } from '../src/busca';

function trecho(n: number, extra: Partial<Trecho> = {}): Trecho {
  return {
    id: `t${n}`,
    url: `https://vestibular.furg.br/p${n}`,
    titulo: `Página ${n}`,
    site: 'vestibular',
    data: '2026-10-01T00:00:00Z',
    processo: 'vestibular',
    ano: 2027,
    texto: `Texto ${n}`,
    similaridade: 0.8,
    ...extra,
  };
}

describe('SEM_BASE', () => {
  it('tem o texto fixo', () => {
    expect(SEM_BASE).toBe(
      'Não encontrei essa informação nas páginas da COPERSE. Consulte o edital oficial do processo seletivo ou escreva para coperse@furg.br.',
    );
  });
});

describe('mascararDadosPessoais', () => {
  it('remove CPF, e-mail e telefone', () => {
    const r = mascararDadosPessoais('meu CPF é 123.456.789-09 e o e-mail fulano@x.com, fone (53) 99999-1234');
    expect(r).not.toContain('123.456.789-09');
    expect(r).not.toContain('fulano@x.com');
    expect(r).not.toContain('99999-1234');
    expect(r.match(/\[removido\]/g)).toHaveLength(3);
  });
  it('remove CPF sem pontuação', () => {
    expect(mascararDadosPessoais('12345678909')).toBe('[removido]');
  });
  it('remove telefones em outros formatos', () => {
    expect(mascararDadosPessoais('53999991234')).toBe('[removido]');
    expect(mascararDadosPessoais('(53) 3233-8000')).toBe('[removido]');
  });
  it('preserva números comuns', () => {
    for (const t of [
      'Vestibular 2027 tem 1063 vagas',
      'Prazo até 10/12/2026',
      'Inscrição 123456789 confirmada',
      'Edital 12/2026, 2027/1',
    ]) {
      expect(mascararDadosPessoais(t)).toBe(t);
    }
  });
});

describe('montarSistema', () => {
  const s = montarSistema([trecho(1), trecho(2)], new Date('2026-11-12T15:00:00Z'));
  it('traz regras e data', () => {
    expect(s).toContain('Você é o assistente virtual da COPERSE');
    expect(s).toContain('Hoje é 12/11/2026');
  });
  it('numera os trechos com metadados', () => {
    expect(s).toContain('[1] Página 1 — vestibular — vestibular 2027 — publicado em 01/10/2026');
    expect(s).toContain('[2] Página 2');
    expect(s).toContain('Texto 2');
  });
});

describe('extrairFontes', () => {
  const ts = [1, 2, 3, 4, 5].map((n) => trecho(n));
  it('remove números inexistentes e monta fontes na ordem de citação', () => {
    const r = extrairFontes('Prazo até 10/12 [2]. Veja [7] e https://malicioso.example [2][3].', ts);
    expect(r.resposta).not.toContain('[7]');
    expect(r.resposta).toContain('[2]');
    expect(r.resposta).toContain('[3]');
    expect(r.fontes.map((f) => f.url)).toEqual([ts[1]!.url, ts[2]!.url]);
    expect(JSON.stringify(r.fontes)).not.toContain('malicioso');
    expect(r.fontes[0]).toEqual({ titulo: 'Página 2', url: ts[1]!.url, site: 'vestibular', data: ts[1]!.data });
  });
  it('junta trechos da mesma URL', () => {
    const dup = [trecho(1), trecho(2, { url: trecho(1).url })];
    expect(extrairFontes('a [1] b [2]', dup).fontes).toHaveLength(1);
  });
  it('sem citação válida, sem fontes', () => {
    expect(extrairFontes('nada [9]', ts).fontes).toEqual([]);
    expect(extrairFontes('nada', ts).fontes).toEqual([]);
  });
});
