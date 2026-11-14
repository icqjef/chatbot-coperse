import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  carregarRegras, ehListaDeCandidatos, inferirAno, inferirProcesso, nomeDoArquivo, normalizar, pareceListaDeNomes,
} from '../src/classificar';

const lerJson = (c: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../config/${c}`, import.meta.url), 'utf8'));
const regras = carregarRegras(lerJson('processos.json'), lerJson('listas.json'));
const X = 'https://coperse.furg.br/x';
const VEST_RESULTADO = 'https://vestibular.furg.br/api/documentos/publico?arquivo=docs.publicacoes%2FResultado_Final_2026.pdf';

describe('pareceListaDeNomes', () => {
  it('cabeçalho de tabela com inscrição e nome', () => {
    expect(pareceListaDeNomes('Nº INSCRIÇÃO NOME\n329 ALINE DAIANE SCHEIBLER\n300 ANA CARLA PEREIRA')).toBe(true);
    expect(pareceListaDeNomes('Resultado\nINSCRIÇÃO | NOME | NOTA')).toBe(true);
    expect(pareceListaDeNomes('Nome do candidato ........ Inscricao')).toBe(true);
  });
  it('8 linhas número + nome em maiúsculas, sem cabeçalho', () => {
    const l = Array.from({ length: 8 }, (_, i) => `${100 + i} NOME SOBRENOME`);
    expect(pareceListaDeNomes(l.join('\n'))).toBe(true);
    expect(pareceListaDeNomes(l.slice(0, 7).join('\n'))).toBe(false);
  });
  it('edital e tabela de vagas não são lista', () => {
    expect(pareceListaDeNomes('3.4. A pessoa candidata poderá se inscrever no Vestibular 2027 e informar seu nome social no ato da inscrição, conforme as regras deste edital e da legislação vigente.')).toBe(false);
    expect(pareceListaDeNomes('Medicina 34 vagas\nDireito 40 vagas\nOceanologia 25 vagas')).toBe(false);
  });
  it('só olha os primeiros 4000 caracteres', () => {
    expect(pareceListaDeNomes(`${'x '.repeat(2100)}\nNº INSCRIÇÃO NOME`)).toBe(false);
  });
});

describe('normalizar', () => {
  it('decodifica, remove acentos e separadores', () => {
    expect(normalizar('Homologa%C3%A7%C3%A3o_Final-2017.pdf')).toBe('homologacao final 2017 pdf');
  });
  it('decodifica as sequências válidas mesmo com uma inválida', () => {
    expect(normalizar('Homologa%C3%A7%C3%A3o_100%.pdf')).toContain('homologacao');
  });
  it('não lança com sequência % inválida', () => {
    expect(() => normalizar('%E0%A4%A')).not.toThrow();
  });
});

describe('ehListaDeCandidatos', () => {
  it.each([
    ['Lista dos Convocados (Aprovados)', 'https://coperse.furg.br/images/aprovados_quilombolas_2026-1.pdf'],
    ['Clique aqui para visualizar', 'https://coperse.furg.br/images/PS_QUILOMBOLAS_2026_-_RESULTADO_RECURSOS_NOTAS.pdf'],
    ['clique aqui', 'https://coperse.furg.br/images/2Homologa%C3%A7%C3%A3o_Preliminar_PS_Quilombolas_2026docx_-_Google_Docs.pdf'],
    ['Locais de provas do PS 2016 - Quilombolas', 'https://coperse.furg.br/images/000724.pdf'],
    ['Divulgação dos/as fiscais selecionados/as para atuar no Vestibular 2027', X],
    ['Homologação das inscrições dos Avaliadores das Questões Analítico-Discursivas de Língua Portuguesa do Vestibular FURG 2027', X],
    ['Lista de complementação documental deferidas e indeferidas', X],
    ['Relação de inscritos no PS Indígenas 2026', X],
    ['Relação nominal dos candidatos', X],
    ['Ensalamento do Vestibular 2027', X],
    ['Clique aqui', VEST_RESULTADO],
  ])('verdadeiro: %s', (t, u) => {
    expect(ehListaDeCandidatos(t, u, regras)).toBe(true);
  });
  it.each([
    ['Edital PS EaD 2026', 'https://coperse.furg.br/images/Edital_EaD_20261_FINAL_OK.pdf'],
    ['RETIFICAÇÃO Nº 1 DO EDITAL DO PROCESSO SELETIVO 2026 ...', 'https://coperse.furg.br/images/Retificao_n_1_PS_Quilombolas.pdf'],
    ['Gabarito Final', 'https://coperse.furg.br/images/000675.pdf'],
    ['Anexo I - Documento de Autodeclaração Quilombola', X],
    ['Prorrogação das inscrições do PS Específico para Estudantes Transgêneros', X],
    ['Relação de cursos e vagas', X],
  ])('falso: %s', (t, u) => {
    expect(ehListaDeCandidatos(t, u, regras)).toBe(false);
  });
});

describe('nomeDoArquivo', () => {
  it('usa o parâmetro arquivo quando existe (último segmento do valor)', () => {
    expect(nomeDoArquivo(VEST_RESULTADO)).toBe('Resultado_Final_2026.pdf');
  });
  it('senão, o último segmento do caminho, decodificado', () => {
    expect(nomeDoArquivo('https://coperse.furg.br/images/Homologa%C3%A7%C3%A3o_2026.pdf')).toBe('Homologação_2026.pdf');
    expect(nomeDoArquivo('https://coperse.furg.br/a/b/')).toBe('b');
  });
});

describe('ehListaDeCandidatos exceções', () => {
  it('edital de homologação, convocação e locais de prova são listas', () => {
    // Sem exceção para "Edital": edital de homologação ou de convocação traz nomes (achado na carga real de 2026-11-12).
    expect(ehListaDeCandidatos('Edital de Homologação das Inscrições', 'https://coperse.furg.br/x/edital.pdf', regras)).toBe(true);
    expect(ehListaDeCandidatos('Edital de Convocação dos Aprovados', 'https://coperse.furg.br/images/Edital_1_Convocacao_Quilombolas_2025.pdf', regras)).toBe(true);
    expect(ehListaDeCandidatos('Santa Vitória do Palmar', 'https://coperse.furg.br/images/2026/Vestibular-2026/locais_prova_SVP.pdf', regras)).toBe(true);
    expect(ehListaDeCandidatos('Local de prova', 'https://x/a.pdf', regras)).toBe(true);
    expect(ehListaDeCandidatos('Gabarito da prova de Língua Portuguesa', 'https://x/gab.pdf', regras)).toBe(false);
  });
});

describe('inferirProcesso', () => {
  it('casos reais', () => {
    expect(inferirProcesso(['Edital PS Índigenas 2026'], regras)).toBe('indigenas');
    expect(inferirProcesso(['PS Específico para Estudantes Transgêneros'], regras)).toBe('transgeneros');
    expect(inferirProcesso(['Edital', 'https://coperse.furg.br/anos-anteriores/ead-furg/ps-2017-ead-furg'], regras)).toBe('ead');
    expect(inferirProcesso(['Vestibular FURG 2027'], regras)).toBe('vestibular');
    expect(inferirProcesso(['Calendário'], regras)).toBeNull();
  });
});

describe('inferirAno', () => {
  it('título tem prioridade, depois último ano do caminho', () => {
    expect(inferirAno('Vestibular 2027', 'https://x/2026/a')).toBe(2027);
    expect(inferirAno('Edital', 'https://coperse.furg.br/anos-anteriores/2024-3/ps-2013-quilombolas')).toBe(2013);
  });
  it('sem ano no título, o ano citado no texto vence o do caminho', () => {
    const url = 'https://coperse.furg.br/images/2026/Vestibular-2026/Cronograma_retificado.pdf';
    expect(inferirAno('Consulte aqui a retificação do cronograma', url,
      '10.1. O cronograma do Vestibular FURG 2027 está apresentado na Tabela 5')).toBe(2027);
    // sem texto, ou texto sem processo seguido de ano, vale o caminho
    expect(inferirAno('Consulte aqui a retificação do cronograma', url)).toBe(2026);
    expect(inferirAno('Consulte aqui', url, 'Tabela de datas de 2027 sem o nome do processo')).toBe(2026);
    // ano a mais de 60 caracteres da palavra-chave não conta
    expect(inferirAno('Consulte aqui', url, `Vestibular ${'x'.repeat(70)} 2027`)).toBe(2026);
    // só os primeiros 3000 caracteres
    expect(inferirAno('Consulte aqui', url, `${'x'.repeat(3000)} Vestibular FURG 2027`)).toBe(2026);
  });
  it('o ano do título continua prioritário sobre o do texto', () => {
    expect(inferirAno('EDITAL Nº 21/2026', 'https://coperse.furg.br/images/2026/Vestibular-2026/e.pdf',
      '... Processo Seletivo Específico para Ingresso de Estudantes Transgêneros no primeiro semestre de 2027')).toBe(2026);
  });
  it('null sem ano isolado', () => {
    expect(inferirAno('Edital', 'https://coperse.furg.br/images/Edital_EaD_20261_FINAL_OK.pdf')).toBeNull();
    expect(inferirAno('Edital', 'https://x/a')).toBeNull();
  });
});

describe('carregarRegras', () => {
  it('lança citando padrão inválido', () => {
    expect(() => carregarRegras([{ processo: 'a', padroes: ['(abc'] }], { padroes: [], excecoes: [] })).toThrow(/\(abc/);
    expect(() => carregarRegras([], { padroes: ['[x'], excecoes: [] })).toThrow(/\[x/);
  });
  it('rejeita padrão vazio', () => {
    expect(() => carregarRegras([{ processo: 'a', padroes: [''] }], { padroes: [], excecoes: [] })).toThrow(/"a".*vazio/);
    expect(() => carregarRegras([], { padroes: [''], excecoes: [] })).toThrow(/padroes.*vazio/);
  });
});
