import { describe, it, expect } from 'vitest';
import { respostaSocial, intencoesSociais, dataPorExtenso, horaBr, APRESENTACAO, ENCERRAMENTO, limparDatas } from '../src/conversa';

// sábado, 14/11/2026, 16h05 em Brasília (UTC-3)
const AGORA = new Date('2026-11-14T19:05:00Z');

describe('respostaSocial', () => {
  it.each(['oi', 'Olá!', 'olaaa', 'e aí', 'Oi, tudo bem?', 'Boa tarde', 'bom dia!!', 'Opa, beleza?'])('saudação "%s"', (m) => {
    const r = respostaSocial(m, AGORA)!;
    expect(r).toMatch(/^(Olá|Bom dia|Boa tarde)!/);
    expect(r).toContain('assistente virtual da COPERSE');
  });

  it('ecoa bom dia / boa noite e responde ao "tudo bem"', () => {
    expect(respostaSocial('Bom dia', AGORA)).toMatch(/^Bom dia!/);
    expect(respostaSocial('boa noite, tudo bem?', AGORA)).toMatch(/^Boa noite! Tudo bem, obrigado por perguntar!/);
  });

  it.each(['Quem é você?', 'qual é o seu nome', 'Você é um robô?', 'vc é humano?', 'O que você faz?', 'Se apresente', 'pode se apresentar?', 'como você funciona'])(
    'apresentação "%s"', (m) => {
      expect(respostaSocial(m, AGORA)).toContain(APRESENTACAO);
    },
  );

  it.each(['obrigado', 'Muito obrigada!', 'valeu', 'obg', 'Obrigado pela ajuda!', 'ok, entendi'])('agradecimento "%s"', (m) => {
    expect(respostaSocial(m, AGORA)).toMatch(/^Por nada!|^Por nada/);
  });

  it('agradecimento com despedida', () => {
    expect(respostaSocial('valeu, tchau', AGORA)).toBe('Por nada! Até mais e boa sorte no processo seletivo.');
    expect(respostaSocial('Até logo', AGORA)).toBe('Até mais! Boa sorte no processo seletivo.');
  });

  it.each(['Que dia é hoje?', 'qual a data de hoje', 'Hoje é que dia da semana?', 'que dia do mês é hoje?', 'qual o dia da semana', 'em que dia estamos'])(
    'data "%s": dia da semana, dia do mês e ano no fuso de Brasília', (m) => {
      expect(respostaSocial(m, AGORA)).toBe('Hoje é sábado, 14 de novembro de 2026.');
    },
  );

  it.each(['Que horas são?', 'qual a hora atual', 'que horas são agora?', 'me diga as horas'])('hora "%s"', (m) => {
    expect(respostaSocial(m, AGORA)).toBe('Agora são 16h05 (horário de Brasília).');
  });

  it('data e hora juntas, com saudação', () => {
    expect(respostaSocial('oi, que dia é hoje e que horas são?', AGORA)).toBe(
      'Olá! Sou o assistente virtual da COPERSE e respondo dúvidas sobre o Vestibular, o SiSU, os outros processos seletivos e os cursos de graduação da FURG. Hoje é sábado, 14 de novembro de 2026, e agora são 16h05 (horário de Brasília).',
    );
  });

  it('virada do dia segue Brasília, não UTC', () => {
    const t = new Date('2026-11-15T02:30:00Z'); // 23h30 de sábado em Brasília
    expect(respostaSocial('que dia é hoje?', t)).toBe('Hoje é sábado, 14 de novembro de 2026.');
    expect(respostaSocial('que horas são', t)).toBe('Agora são 23h30 (horário de Brasília).');
  });

  it.each([
    'é só isso',
    'É só isso.',
    'era só isso, obrigado',
    'só isso mesmo',
    'por enquanto é só',
    'não',
    'Não, obrigado!',
    'não preciso de mais nada',
    'nenhuma outra dúvida',
    'sem mais dúvidas',
    'já entendi',
    'tá ótimo',
    'tudo resolvido',
    'fiquei satisfeito',
    'esclareceu minha dúvida',
    'tirou minhas dúvidas',
    'vou olhar o edital',
    'pode encerrar',
    'beleza, era isso',
    'maravilha',
    'Já está resolvido, valeu',
  ])('encerramento: "%s"', (m) => {
    expect(respostaSocial(m, AGORA)).toContain(ENCERRAMENTO);
  });
  it('encerramento com agradecimento ou despedida', () => {
    expect(respostaSocial('é só isso, obrigado', AGORA)).toBe(`Por nada! ${ENCERRAMENTO}`);
    expect(respostaSocial('era só isso, tchau', AGORA)).toBe(`${ENCERRAMENTO} Até mais!`);
  });
  it.each([
    'É só isso?',
    'não entendi',
    'não ficou claro',
    'não sei qual curso escolher',
    'ainda tenho dúvida',
    'tudo sobre o SiSU',
    'já saiu o resultado?',
    'isso vale para o SiSU também?',
    'boa sorte',
  ])('não é encerramento (vai para a busca): "%s"', (m) => {
    expect(respostaSocial(m, AGORA)).toBeNull();
  });
  it.each([
    'Qual a data da prova?',
    'Que dia é a prova do Vestibular?',
    'Que horas começa a prova?',
    'oi, quando é a prova?',
    'Obrigado, e quantas vagas tem Medicina?',
    'o que é o SiSU?',
    'ajuda com a inscrição',
    'Qual a previsão do tempo para Rio Grande amanhã?',
    'Meu CPF é 123.456.789-09',
    'e de Medicina?',
  ])('pergunta real segue para a busca: "%s"', (m) => {
    expect(respostaSocial(m, AGORA)).toBeNull();
    expect(intencoesSociais(m)).toBeNull();
  });
});

describe('limparDatas', () => {
  it('tira o ordinal colado em data numérica', () => {
    expect(limparDatas('O início das aulas será em 01º/03/2027 [1].')).toBe('O início das aulas será em 01/03/2027 [1].');
    expect(limparDatas('em 1º/03/2027 e 2°/04/2027')).toBe('em 01/03/2027 e 02/04/2027');
  });
  it('não mexe em ordinal fora de data nem em data normal', () => {
    expect(limparDatas('1º de março de 2027; 22/11/2026; 3º lugar')).toBe('1º de março de 2027; 22/11/2026; 3º lugar');
  });
});

describe('formatos', () => {
  it('data por extenso e hora no fuso de Brasília', () => {
    expect(dataPorExtenso(AGORA)).toBe('sábado, 14 de novembro de 2026');
    expect(horaBr(new Date('2026-11-14T12:07:00Z'))).toBe('09h07');
  });
});
