import { describe, expect, it } from 'vitest';
import { corrigirTempo, correcaoDeTempo, problemasDeTempo, semAvisoVencido } from '../src/tempo';

const HOJE = '2026-11-15';

describe('problemasDeTempo', () => {
  it('passado com data futura e futuro com data passada', () => {
    expect(problemasDeTempo('No Vestibular 2027, a prova foi realizada em 22/11/2026, das 14h às 19h30 [1].', HOJE)).toMatchObject([
      { data: '22/11/2026', verbo: 'foi', esperado: 'futuro' },
    ]);
    expect(problemasDeTempo('O prazo de recurso será até 15/10/2026 [1].', HOJE)).toMatchObject([
      { data: '15/10/2026', verbo: 'será', esperado: 'passado' },
    ]);
  });
  it('tempo certo, presente e mudança de prazo não são erro', () => {
    for (const t of [
      'A prova será realizada em 22/11/2026 [1].',
      'As inscrições foram de 13/08/2026 a 07/10/2026 [1].',
      'A prova é em 22/11/2026 [1].',
      'As inscrições foram prorrogadas até 20/12/2026 [1].',
      'A retificação foi publicada alterando a prova para 20/12/2026 [1].',
      'O edital foi publicado em 07/08/2026 e a prova será em 22/11/2026 [1].',
      'A matrícula ocorre em 05/02/2027 [2].',
      'Sem data nenhuma aqui.',
    ]) {
      expect(problemasDeTempo(t, HOJE), t).toEqual([]);
    }
  });
  it('cada data olha só o verbo depois da data anterior', () => {
    expect(problemasDeTempo('O resultado saiu em 10/11/2026 e a prova foi em 22/11/2026 [1].', HOJE)).toMatchObject([
      { data: '22/11/2026', verbo: 'foi', esperado: 'futuro' },
    ]);
  });
  it('"foi divulgada em" e "foi publicada até" com data futura são erro', () => {
    expect(problemasDeTempo('A lista foi publicada até 02/12/2026 e a definitiva foi divulgada em 08/12/2026 [1].', HOJE)).toMatchObject([
      { data: '02/12/2026', verbo: 'foi', esperado: 'futuro' },
      { data: '08/12/2026', verbo: 'foi', esperado: 'futuro' },
    ]);
  });
  it('a posição aponta para o verbo no texto, também depois da primeira frase', () => {
    const t = 'Primeira frase [1].\n\nAs provas foram realizadas em 13/12/2026 [1].';
    const [p] = problemasDeTempo(t, HOJE);
    expect(t.slice(p!.posicao, p!.posicao + 5)).toBe('foram');
  });
  it('a data de hoje não é conferida', () => {
    expect(problemasDeTempo('O prazo terminou em 15/11/2026.', HOJE)).toEqual([]);
  });
});

describe('semAvisoVencido', () => {
  it('tira "Fique atento" só com datas passadas; mantém o com data futura ou de hoje', () => {
    const t = 'Para saber, acesse o sistema [1].\n\nFique atento: o prazo de recurso foi até 15/10/2026 [1].';
    expect(semAvisoVencido(t, HOJE)).toBe('Para saber, acesse o sistema [1].');
    const futuro = 'A prova é em 22/11/2026 [1].\n\nFique atento: a prova será em 22/11/2026 [1].';
    expect(semAvisoVencido(futuro, HOJE)).toBe(futuro);
    const misto = 'X [1].\nFique atento: resultado em 10/11/2026 e recurso até 20/11/2026 [1].';
    expect(semAvisoVencido(misto, HOJE)).toBe(misto);
  });
});

describe('correcaoDeTempo', () => {
  it('diz hoje e o tempo esperado', () => {
    const c = correcaoDeTempo([{ data: '22/11/2026', verbo: 'foi', esperado: 'futuro', posicao: 0 }], HOJE);
    expect(c).toContain('Hoje é 15/11/2026');
    expect(c).toContain('22/11/2026 é depois de hoje');
  });
});

describe('corrigirTempo', () => {
  it('troca o verbo pelo par no tempo certo, mantendo a maiúscula', () => {
    expect(
      corrigirTempo('Fique atento: As provas foram realizadas em 13/12/2026 [1]. Foi aplicada em 22/11/2026 [2].', HOJE),
    ).toBe('Fique atento: As provas serão realizadas em 13/12/2026 [1]. Será aplicada em 22/11/2026 [2].');
    expect(corrigirTempo('A lista foi publicada até 02/12/2026 e foi divulgada em 08/12/2026 [1].', HOJE)).toBe(
      'A lista será publicada até 02/12/2026 e será divulgada em 08/12/2026 [1].',
    );
    expect(corrigirTempo('O recurso será até 15/10/2026 [1].', HOJE)).toBe('O recurso foi até 15/10/2026 [1].');
  });
  it('sem erro, o texto não muda; "vai" fica como está', () => {
    const certo = 'A prova será em 22/11/2026 e as inscrições foram até 07/10/2026 [1].';
    expect(corrigirTempo(certo, HOJE)).toBe(certo);
    expect(corrigirTempo('A prova vai ser em 10/10/2026 [1].', HOJE)).toBe('A prova vai ser em 10/10/2026 [1].');
  });
});
