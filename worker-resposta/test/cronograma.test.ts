import { describe, expect, it, vi } from 'vitest';
import { lerEdicoes, perguntaDeData, proximasEtapas, tratarProximas, trechosDoCronograma } from '../src/cronograma';
import { responderPergunta } from '../src/perguntar';
import { montarSistema } from '../src/regras';
import type { Trecho } from '../src/busca';

const RET = 'https://coperse.furg.br/Cronograma_retificado.pdf';
const EDITAL = 'https://coperse.furg.br/EDITAL_VESTIBULAR.pdf';
const linha = (url: string, etapa: string, quando: string, inicio: string | null, fim: string | null, data: string, ano = 2027, processo = 'vestibular') => ({
  url, etapa, quando, inicio, fim, titulo: url.split('/').pop(), site: 'coperse', data_publicacao: data, processo, ano,
});
// Edital original com 9 etapas; retificado também completo e mais novo, com outra data de inscrição.
const etapas = (url: string, data: string, inscricao: [string, string]) => [
  linha(url, 'Período de inscrições', `13/08 a ${inscricao[0]}`, '2026-08-13', inscricao[1], data),
  linha(url, 'Aplicação da prova', '22/11/2026', '2026-11-22', '2026-11-22', data),
  linha(url, 'Divulgação da lista de classificação geral', 'até 21/12/2026', null, '2026-12-21', data),
  ...Array.from({ length: 6 }, (_, i) => linha(url, `Etapa ${i}`, `0${i + 1}/01/2027`, `2027-01-0${i + 1}`, `2027-01-0${i + 1}`, data)),
];
const LINHAS = [
  ...etapas(EDITAL, '2026-08-07', ['30/09/2026', '2026-09-30']),
  ...etapas(RET, '2026-10-01', ['07/10/2026', '2026-10-07']),
  linha('https://sisu.furg.br/c', 'Chamada regular', '28/01/2025', '2025-01-28', '2025-01-28', '2025-01-10', 2025, 'sisu'),
];

function dbFalso(linhas = LINHAS) {
  const binds: unknown[][] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...p: unknown[]) => {
        binds.push(p);
        return {
          all: async () => ({
            results: linhas.filter((l) => l.ano >= (p[0] as number) && (!sql.includes('p.processo = ?') || l.processo === p[1])),
          }),
        };
      },
    }),
  } as unknown as D1Database;
  return { db, binds };
}

const agora = new Date('2026-11-16T15:00:00Z');

describe('cronograma no Worker', () => {
  it('lê a edição atual, junta as versões (retificado vence) e ignora edição passada', async () => {
    const ed = await lerEdicoes(dbFalso().db, agora);
    expect(ed.map((e) => `${e.processo} ${e.ano}`)).toEqual(['vestibular 2027']);
    const inscricao = ed[0]!.itens.find((x) => x.linha.etapa === 'Período de inscrições')!;
    expect(inscricao.linha.quando).toBe('13/08 a 07/10/2026');
    expect(inscricao.fonte.url).toBe(RET);
  });

  it('vira trecho tipo cronograma, uma etapa por linha, e o prompt marca o tipo', async () => {
    const [e] = await lerEdicoes(dbFalso().db, agora, 'vestibular');
    const ts = trechosDoCronograma(e!);
    expect(ts).toHaveLength(1);
    expect(ts[0]!.texto).toContain('- Divulgação da lista de classificação geral: até 21/12/2026');
    expect(montarSistema(ts, agora)).toContain('tipo="cronograma"');
  });

  it('próximas datas: só de hoje em diante, em andamento primeiro, até 4', async () => {
    const ed = await lerEdicoes(dbFalso().db, agora);
    const [p] = proximasEtapas(ed, '2026-11-16');
    expect(p!.nome).toBe('Vestibular');
    expect(p!.etapas.map((x) => x.etapa)).toEqual(['Aplicação da prova', 'Divulgação da lista de classificação geral', 'Etapa 0', 'Etapa 1']);
    expect(p!.etapas[0]!.fonte.url).toBe(RET);
  });

  it('Vestibular e SiSU vêm antes dos específicos, até 4 processos', () => {
    const ed = (processo: string, fim: string) => ({
      processo, ano: 2027,
      itens: [{ linha: { etapa: 'x', quando: fim, inicio: fim, fim }, fonte: { url: 'u', titulo: 't', site: 's', data: 'd', linhas: [] } }],
    });
    const r = proximasEtapas([ed('quilombolas', '2026-11-16'), ed('indigenas', '2026-11-16'), ed('transgeneros', '2026-11-17'), ed('ead', '2026-11-18'), ed('vestibular', '2026-11-22')], '2026-11-16');
    expect(r.map((p) => p.processo)).toEqual(['vestibular', 'quilombolas', 'indigenas', 'transgeneros']);
  });

  it('perguntaDeData', () => {
    expect(perguntaDeData('Até quando posso me inscrever no Vestibular?')).toBe(true);
    expect(perguntaDeData('Qual o período de isenção?')).toBe(true);
    expect(perguntaDeData('Quais documentos levar na prova?')).toBe(false);
  });
});

describe('GET /proximas', () => {
  const ORIGENS = ['https://coperse.furg.br', 'https://vestibular.furg.br'];
  const pedir = (origem: string | null) =>
    new Request('https://w/proximas', { headers: origem ? { Origin: origem, 'CF-Connecting-IP': '203.0.113.9' } : {} });
  const env = (permitir = true) => ({ DB: dbFalso().db, LIMITADOR: { limit: async () => ({ success: permitir }) } });

  it('origem da FURG: datas com CORS; site de processo filtra o processo', async () => {
    const proc = vi.fn((o: string) => (o.includes('vestibular') ? 'vestibular' : undefined));
    const r = await tratarProximas(pedir('https://vestibular.furg.br'), env(), ORIGENS, proc, agora);
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://vestibular.furg.br');
    const j = (await r.json()) as { hoje: string; processos: { processo: string }[] };
    expect(j.hoje).toBe('2026-11-16');
    expect(j.processos.map((p) => p.processo)).toEqual(['vestibular']);
  });

  it('origem de fora: 403; sem limite por visitante, com cache de 10 minutos no navegador', async () => {
    expect((await tratarProximas(pedir('https://outro.com'), env(), ORIGENS, () => undefined, agora)).status).toBe(403);
    const r = await tratarProximas(pedir('https://coperse.furg.br'), env(false), ORIGENS, () => undefined, agora);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=600');
  });
});

describe('pergunta sobre data usa o cronograma conferido', () => {
  const pagina: Trecho = { id: 'x', url: RET, titulo: 'cru', site: 'coperse', data: '2026-10-01', processo: 'vestibular', ano: 2027, texto: 'texto cru do PDF', similaridade: 0.8 };
  const outra: Trecho = { ...pagina, id: 'y', url: 'https://vestibular.furg.br/', texto: 'outra página' };
  const conferido: Trecho = { ...pagina, id: 'cronograma:x', tipo: 'cronograma', texto: '- Aplicação da prova: 22/11/2026' };

  async function rodar(pergunta: string) {
    let sistema = '';
    const cronograma = vi.fn(async () => [conferido]);
    await responderPergunta(
      { pergunta, historico: [] },
      {
        buscar: async () => ({ trechos: [pagina, outra], melhorSimilaridade: 0.8 }),
        gerador: { gerar: async (s: string) => ((sistema = s), 'A prova será em 22/11/2026 [1].') },
        agora: () => agora,
        cronograma,
      },
    );
    return { sistema, cronograma };
  }

  it('entra primeiro e tira o texto cru do mesmo documento', async () => {
    const { sistema, cronograma } = await rodar('Quando é a prova do Vestibular?');
    expect(cronograma).toHaveBeenCalledWith('vestibular');
    expect(sistema).toMatch(/<trecho n="1" tipo="cronograma"[^>]*>- Aplicação da prova: 22\/11\/2026/);
    expect(sistema).not.toContain('texto cru do PDF');
    expect(sistema).toContain('outra página');
  });

  it('pergunta que não é de data ou sem processo: não consulta o cronograma', async () => {
    expect((await rodar('Quais documentos levar na prova do Vestibular?')).cronograma).not.toHaveBeenCalled();
    expect((await rodar('Quando sai o resultado?')).cronograma).not.toHaveBeenCalled();
  });
});
