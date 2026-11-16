import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ErroAutenticacaoProvedor } from '@chatbot/comum/provedores/embeddings';
import { atualizarCronogramas, lerJson, NAO_CANDIDATOS, textoParaExtrair } from '../src/cronograma';
import type { ClienteCloudflare } from '../src/cloudflare';

const VESTIBULAR = readFileSync(new URL('../../comum/test/dados/cronograma-vestibular-2027.txt', import.meta.url), 'utf8');
const URL_V = 'https://coperse.furg.br/images/2026/Vestibular-2026/Cronograma_retificado.pdf';

/** D1 falso só com o que atualizarCronogramas usa. */
function cfFalso(paginas: { url: string; titulo: string; hash: string; textos: string[] }[], feitos: Record<string, string> = {}) {
  const cronograma: unknown[][] = [];
  const fontes = new Map(Object.entries(feitos));
  const sqls: string[] = [];
  const cf = {
    async d1(sql: string, params: unknown[] = []) {
      sqls.push(sql);
      if (sql.includes('FROM paginas p')) return paginas.map(({ url, titulo, hash }) => ({ url, titulo, hash }));
      if (sql.startsWith('SELECT url, hash FROM cronograma_fontes')) return [...fontes].map(([url, hash]) => ({ url, hash }));
      if (sql.startsWith('SELECT texto FROM trechos')) return (paginas.find((p) => p.url === params[0])?.textos ?? []).map((texto) => ({ texto }));
      if (sql.startsWith('DELETE FROM cronograma WHERE url = ?')) {
        for (let i = cronograma.length - 1; i >= 0; i--) if (cronograma[i]![0] === params[0]) cronograma.splice(i, 1);
      }
      if (sql.startsWith('INSERT OR REPLACE INTO cronograma_fontes')) fontes.set(String(params[0]), String(params[1]));
      return [];
    },
    async inserirLinhas(_t: string, _c: string[], linhas: unknown[][]) {
      cronograma.push(...linhas);
    },
  } as unknown as ClienteCloudflare;
  return { cf, cronograma, fontes, sqls };
}

const gerador = (resposta: string) => ({ gerar: vi.fn(async () => resposta) });
const agora = () => '2026-11-16T12:00:00Z';

describe('atualizarCronogramas', () => {
  const respostaBoa = JSON.stringify({
    linhas: [
      { etapa: 'Período de inscrições', quando: '13/08 a 07/10/2026' },
      { etapa: 'Divulgação da lista de classificação geral e do desempenho individual', quando: 'até 21/12/2026' },
      // trocada com a vizinha: a conferência tira
      { etapa: 'Aplicação da prova', quando: '23/11/2026' },
    ],
  });

  it('extrai, confere, grava as linhas com início e fim e marca a fonte', async () => {
    const { cf, cronograma, fontes } = cfFalso([{ url: URL_V, titulo: 'Cronograma retificado', hash: 'h1', textos: [VESTIBULAR] }]);
    const g = gerador('```json\n' + respostaBoa + '\n```');
    const r = await atualizarCronogramas({ cf, gerador: g, agora }, 2026);
    expect(r).toEqual({ lidos: 1, com_cronograma: 1, linhas: 2, falhas: 0 });
    expect(cronograma).toEqual([
      [URL_V, 0, 'Período de inscrições', '13/08 a 07/10/2026', '2026-08-13', '2026-10-07'],
      [URL_V, 1, 'Divulgação da lista de classificação geral e do desempenho individual', 'até 21/12/2026', null, '2026-12-21'],
    ]);
    expect(fontes.get(URL_V)).toBe('h1');
  });

  it('documento sem mudança não volta ao Gemini; edital de fiscais nem é lido', async () => {
    const { cf } = cfFalso(
      [
        { url: URL_V, titulo: 'Cronograma', hash: 'h1', textos: [VESTIBULAR] },
        { url: 'https://coperse.furg.br/EDITAL_FISCAIS_EXTERNOS.pdf', titulo: 'Edital fiscais', hash: 'h2', textos: [VESTIBULAR] },
      ],
      { [URL_V]: 'h1' },
    );
    const g = gerador(respostaBoa);
    const r = await atualizarCronogramas({ cf, gerador: g, agora }, 2026);
    expect(g.gerar).not.toHaveBeenCalled();
    expect(r.lidos).toBe(0);
  });

  it('falha do Gemini não marca a fonte (tenta de novo); chave recusada interrompe', async () => {
    const { cf, fontes } = cfFalso([{ url: URL_V, titulo: 'Cronograma', hash: 'h1', textos: [VESTIBULAR] }]);
    const r = await atualizarCronogramas({ cf, gerador: { gerar: async () => { throw new Error('HTTP 503'); } }, agora }, 2026);
    expect(r.falhas).toBe(1);
    expect(fontes.size).toBe(0);
    await expect(
      atualizarCronogramas({ cf, gerador: { gerar: async () => { throw new ErroAutenticacaoProvedor(); } }, agora }, 2026),
    ).rejects.toBeInstanceOf(ErroAutenticacaoProvedor);
  });

  it('sem trecho com datas não chama o Gemini e grava a fonte com zero linhas', async () => {
    const { cf, fontes } = cfFalso([{ url: URL_V, titulo: 'Notícia', hash: 'h9', textos: ['O cronograma sai em breve.'] }]);
    const g = gerador(respostaBoa);
    await atualizarCronogramas({ cf, gerador: g, agora }, 2026);
    expect(g.gerar).not.toHaveBeenCalled();
    expect(fontes.get(URL_V)).toBe('h9');
  });

  it('limpa cronograma de página que saiu do índice', async () => {
    const { cf, sqls } = cfFalso([]);
    await atualizarCronogramas({ cf, gerador: gerador('{}'), agora }, 2026);
    expect(sqls.some((s) => s.startsWith('DELETE FROM cronograma WHERE url NOT IN') && s.includes("tipo = 'pdf'"))).toBe(true);
    expect(sqls.some((s) => s.includes("p.tipo = 'pdf'"))).toBe(true);
    expect(sqls.some((s) => s.startsWith('DELETE FROM cronograma_fontes WHERE url NOT IN'))).toBe(true);
  });
});

describe('auxiliares', () => {
  it('lerJson aceita cerca de código e devolve vazio no lixo', () => {
    expect(lerJson('```json\n{"linhas":[{"etapa":"a","quando":"b"}]}\n```')).toEqual([{ etapa: 'a', quando: 'b' }]);
    expect(lerJson('não sei')).toEqual([]);
    expect(lerJson('{"linhas": 3}')).toEqual([]);
  });
  it('textoParaExtrair fica só com trechos que têm datas', () => {
    expect(textoParaExtrair(['sem data nenhuma', 'a 01/02 b 03/04 c 05/06/2026'])).toBe('a 01/02 b 03/04 c 05/06/2026');
  });
  it('NAO_CANDIDATOS', () => {
    expect(NAO_CANDIDATOS.test('EDITAL_FISCAIS_EXTERNOS_SAP.pdf')).toBe(true);
    expect(NAO_CANDIDATOS.test('EDITAL-AVALIADORES_Externo2027VF.pdf')).toBe(true);
    expect(NAO_CANDIDATOS.test('Cronograma_retificado.pdf')).toBe(false);
  });
});
