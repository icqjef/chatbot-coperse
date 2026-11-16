import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chaveEtapa, conferirLinhas, interpretarQuando, juntarVersoes, type FonteCronograma, type LinhaDatada } from '../src/cronograma';

// Texto real do cronograma retificado do Vestibular FURG 2027 (como está nos trechos indexados).
const VESTIBULAR = readFileSync(new URL('./dados/cronograma-vestibular-2027.txt', import.meta.url), 'utf8');

describe('interpretarQuando', () => {
  it.each([
    ['13/08 a 07/10/2026', '2026-08-13', '2026-10-07'],
    ['16/09/2026', '2026-09-16', '2026-09-16'],
    ['até 21/12/2026', null, '2026-12-21'],
    ['Até 22/12/2026', null, '2026-12-22'],
    ['14/01 e 15/01/2027', '2027-01-14', '2027-01-15'],
    ['22/11/2026, domingo', '2026-11-22', '2026-11-22'],
    ['14/01/2027 às 00h', '2027-01-14', '2027-01-14'],
    ['01º de Março de 2027', '2027-03-01', '2027-03-01'],
    ['28/12 a 05/01/2027', '2026-12-28', '2027-01-05'],
    ['em data a ser designada', null, null],
  ])('%s', (quando, inicio, fim) => {
    expect(interpretarQuando(quando)).toEqual({ inicio, fim });
  });
});

describe('conferirLinhas com o cronograma real', () => {
  it('aceita etapa e data certas, inclusive com quebra de linha e ligadura do PDF', () => {
    const ok = conferirLinhas(VESTIBULAR, [
      { etapa: 'Divulgação da lista de classificação geral e do desempenho individual', quando: 'até 21/12/2026' },
      { etapa: 'Chamada geral da pessoa candidata classificada dentro do número de vagas, com indicação da necessidade de aferição e validação da vaga reservada, quando aplicável', quando: 'Até 22/12/2026' },
      { etapa: 'Período de inscrições', quando: '13/08 a 07/10/2026' },
      { etapa: 'Aplicação da prova', quando: '22/11/2026' },
    ]);
    expect(ok.map((l) => l.quando)).toEqual(['até 21/12/2026', 'Até 22/12/2026', '13/08 a 07/10/2026', '22/11/2026']);
  });

  it('recusa a data da etapa vizinha (o erro 21/12 x 22/12)', () => {
    const ok = conferirLinhas(VESTIBULAR, [
      { etapa: 'Divulgação da lista de classificação geral e do desempenho individual', quando: 'Até 22/12/2026' },
    ]);
    expect(ok).toEqual([]);
    // Vizinha a menos de 200 caracteres: a prova (22/11) e o gabarito (23/11).
    expect(conferirLinhas(VESTIBULAR, [{ etapa: 'Aplicação da prova', quando: '23/11/2026' }])).toEqual([]);
  });

  it('recusa data inventada, etapa inventada e linha sem data', () => {
    expect(
      conferirLinhas(VESTIBULAR, [
        { etapa: 'Período de inscrições', quando: '13/08 a 30/12/2026' },
        { etapa: 'Festa de boas-vindas aos calouros', quando: '01/03/2027' },
        { etapa: 'Sorteio público, se necessário', quando: 'em data a ser designada' },
        { etapa: 'x', quando: '22/11/2026' },
      ]),
    ).toEqual([]);
  });

  it('tira repetidas e ignora lixo', () => {
    const l = { etapa: 'Aplicação da prova', quando: '22/11/2026' };
    expect(conferirLinhas(VESTIBULAR, [l, l, null as never, { etapa: 1, quando: 2 } as never])).toHaveLength(1);
  });
});

describe('juntarVersoes', () => {
  const linha = (etapa: string, quando: string): LinhaDatada => ({ etapa, quando, inicio: null, fim: null });
  const completo = (data: string, url: string, quando: string): FonteCronograma => ({
    url, titulo: url, site: 'coperse', data,
    linhas: [linha('Período de inscrições', quando), ...Array.from({ length: 8 }, (_, i) => linha(`Etapa ${i}`, `0${i + 1}/12/2026`))],
  });

  it('usa o completo mais recente e põe por cima as retificações mais novas', () => {
    const original = completo('2026-08-07', 'edital', '13/08 a 30/09/2026');
    const retificado = completo('2026-10-01', 'retificado', '13/08 a 07/10/2026');
    const parcial: FonteCronograma = { url: 'parcial', titulo: 'p', site: 'coperse', data: '2026-11-01', linhas: [linha('Etapa 3', '20/12/2026'), linha('Nova etapa', '21/12/2026')] };
    const antiga: FonteCronograma = { url: 'antiga', titulo: 'a', site: 'coperse', data: '2026-09-01', linhas: [linha('Etapa 4', '31/12/2026')] };
    const r = juntarVersoes([original, parcial, antiga, retificado]);
    const por = new Map(r.map((x) => [chaveEtapa(x.linha.etapa), x]));
    expect(por.get('periodo de inscricoes')!.linha.quando).toBe('13/08 a 07/10/2026');
    expect(por.get('etapa 3')!.fonte.url).toBe('parcial');
    expect(por.get('etapa 4')!.fonte.url).toBe('retificado');
    expect(por.get('nova etapa')!.fonte.url).toBe('parcial');
    expect(r).toHaveLength(10);
  });

  it('sem fontes, nada', () => {
    expect(juntarVersoes([])).toEqual([]);
  });
});
