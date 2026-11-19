import { describe, expect, it } from 'vitest';
import { comAcentos } from '../src/acentos';

describe('comAcentos', () => {
  it.each([
    ['Convocao entrevistas PS Quilombolas 2026docx', 'Convocação entrevistas PS Quilombolas 2026docx'],
    ['PS INDGENAS 2026 RESULTADO RECURSOS NOTASdocx', 'PS INDÍGENAS 2026 RESULTADO RECURSOS NOTASdocx'],
    ['Atendimento especializado PS Transgneros 2027', 'Atendimento especializado PS Transgêneros 2027'],
    ['resultado da homologao das inscries', 'resultado da homologação das inscrições'],
    ['SOLICITAO DE MATRCULAS', 'SOLICITAÇÃO DE MATRÍCULAS'],
    ['Campus So Loureno do Sul', 'Campus So Lourenço do Sul'],
    ['PS Prprio 2026 CONFIRMAO', 'PS Próprio 2026 CONFIRMAÇÃO'],
  ])('%s', (entrada, esperado) => expect(comAcentos(entrada)).toBe(esperado));

  it.each(['Convocação já acentuada', 'Edital Vestibular 2027', 'NOTAS ETAPAS I II e III', 'vagas'])('não mexe em: %s', (t) =>
    expect(comAcentos(t)).toBe(t),
  );

  it('é idempotente', () => {
    const uma = comAcentos('Convocao Indgenas');
    expect(comAcentos(uma)).toBe(uma);
  });
});
