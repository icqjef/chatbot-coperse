import { describe, expect, it } from 'vitest';
import { expandirTermos } from '../src/termos';

describe('expandirTermos', () => {
  it.each([
    ['quais os campos da furg?', 'quais os campos da furg? (campus)'],
    ['Quais são os campi?', 'Quais são os campi? (campus)'],
    ['Onde a formiga tem campos', 'Onde a FURG tem campos (campus)'],
    ['Formiga tem medicina?', 'FURG tem medicina?'],
    ['quando abre o vestibulat?', 'quando abre o vestibulat? (Vestibular)'],
    ['como faço a incrição', 'como faço a incrição (inscrição)'],
    ['pedido de insenção da taxa', 'pedido de insenção da taxa (isenção)'],
    ['nota do cisu', 'nota do cisu (SiSU)'],
    ['tem cotas?', 'tem cotas? (reserva de vagas, ações afirmativas)'],
    ['quero transferência para Direito', 'quero transferência para Direito (vagas complementares)'],
  ])('%s', (entrada, esperado) => expect(expandirTermos(entrada)).toBe(esperado));

  it.each([
    'Quais campos do formulário são obrigatórios?',
    'Quando é o Vestibular?',
    'Quais os campus da FURG?',
    'Saíram as inscrições homologadas dos vestibulares?',
    'Como editar a inscrição?',
    'Tem redução da taxa?',
    'Vagas para quilombola e indigena',
    'Quem foi convocada para a matrícula?',
    'Educação do Campo tem vagas?',
    'Quando é a lista de espera do SiSU?',
  ])('não mexe em: %s', (p) => expect(expandirTermos(p)).toBe(p));
});
