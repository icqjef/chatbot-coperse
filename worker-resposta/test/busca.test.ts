import { describe, it, expect } from 'vitest';
import { consultaFts, fundir, buscarTrechos } from '../src/busca';
import { d1Falso, vectorizeFalso, type LinhaTrechoFalsa } from './fakes';

const agora = new Date('2026-11-12T12:00:00Z');

function linha(id: string, extra: Partial<LinhaTrechoFalsa> = {}): LinhaTrechoFalsa {
  return {
    id,
    texto: `texto ${id}`,
    url: `https://coperse.furg.br/${id}`,
    titulo: `Título ${id}`,
    site: 'coperse',
    data_publicacao: '2026-10-01T00:00:00Z',
    processo: 'sisu',
    ano: 2026,
    ...extra,
  };
}

function match(id: string, score: number) {
  return {
    id,
    score,
    metadata: { site: 'coperse', url: `https://coperse.furg.br/${id}`, titulo: id, data: '2026-10-01T00:00:00Z', processo: 'sisu', ano: 2026, trecho_id: id },
  };
}

function embedderFalso() {
  const chamadas: { textos: string[]; tipo: string }[] = [];
  return {
    chamadas,
    embedder: {
      async embed(textos: string[], tipo: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') {
        chamadas.push({ textos, tipo });
        return textos.map(() => [0.1, 0.2]);
      },
    },
  };
}

describe('consultaFts', () => {
  it('limpa operadores, pontuação e termos curtos', () => {
    expect(consultaFts('Qual o "prazo" (de) inscrição* do -SiSU OR?')).toBe(
      '"qual" OR "prazo" OR "inscrição" OR "sisu"',
    );
  });
  it('mantém palavras inteiras em entrada NFD', () => {
    expect(consultaFts('inscrição'.normalize('NFD'))).toBe('"inscrição"');
  });
  it('null sem termos úteis', () => {
    expect(consultaFts('a e o')).toBeNull();
  });
  it('sem repetidos e até 12 termos', () => {
    expect(consultaFts('prazo prazo PRAZO')).toBe('"prazo"');
    const q = consultaFts('aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn')!;
    expect(q.split(' OR ')).toHaveLength(12);
  });
});

describe('fundir', () => {
  const meta = (ano: number, data = '2026-01-01T00:00:00Z') => ({ data, ano, processo: 'sisu' });
  it('1º nas duas listas vence 1º só no vetorial', () => {
    const m = new Map([
      ['a', meta(2026)],
      ['b', meta(2026)],
    ]);
    const r = fundir(
      [{ id: 'b', similaridade: 0.9 }, { id: 'a', similaridade: 0.8 }],
      [{ id: 'a' }],
      m,
      agora,
    );
    expect(r[0]!.id).toBe('a');
  });
  it('recência decide entre ano igual e datas diferentes', () => {
    const m = new Map([
      ['x26', meta(2026)],
      ['x27', meta(2027, '2026-11-01T00:00:00Z')],
    ]);
    const r = fundir(
      [{ id: 'x26', similaridade: 0.9 }, { id: 'x27', similaridade: 0.9 }],
      [{ id: 'x27' }, { id: 'x26' }],
      m,
      agora,
    );
    expect(r[0]!.id).toBe('x27');
  });
  it('ano decide com a mesma data', () => {
    const m = new Map([
      ['y25', meta(2025, '2026-01-01T00:00:00Z')],
      ['y27', meta(2027, '2026-01-01T00:00:00Z')],
    ]);
    const r = fundir(
      [{ id: 'y25', similaridade: 0.9 }, { id: 'y27', similaridade: 0.9 }],
      [{ id: 'y27' }, { id: 'y25' }],
      m,
      agora,
    );
    expect(r[0]!.id).toBe('y27');
  });
  it('processo citado dá +0.02 e desempata a favor do processo', () => {
    const m = new Map([
      ['q', { data: '2026-01-01T00:00:00Z', ano: 2026, processo: 'quilombolas' }],
      ['t', { data: '2026-01-01T00:00:00Z', ano: 2026, processo: 'transgeneros' }],
    ]);
    const vet = [{ id: 'q', similaridade: 0.9 }, { id: 't', similaridade: 0.9 }];
    expect(fundir(vet, [], m, agora)[0]!.id).toBe('q');
    expect(fundir(vet, [], m, agora, 'transgeneros')[0]!.id).toBe('t');
    expect(fundir(vet, [], m, agora, null)[0]!.id).toBe('q');
  });
  it('data futura não passa do bônus máximo', () => {
    const m = new Map([['f', meta(2020, '2030-01-01T00:00:00Z')]]);
    const m2 = new Map([['f', meta(2020, '2026-11-12T12:00:00Z')]]);
    const fut = fundir([{ id: 'f', similaridade: 1 }], [], m, agora)[0]!.pontuacao;
    const hoje = fundir([{ id: 'f', similaridade: 1 }], [], m2, agora)[0]!.pontuacao;
    expect(fut).toBeCloseTo(hoje, 10);
  });
});

describe('buscarTrechos', () => {
  it('consulta vetorial, lê D1 e limita a 8', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const v = vectorizeFalso(ids.map((id, i) => match(id, 0.9 - i * 0.01)));
    const d = d1Falso({ fts: ['h'], linhas: ids.map((id) => linha(id)) });
    const e = embedderFalso();
    const r = await buscarTrechos('prazo de inscrição', { embedder: e.embedder, vectorize: v.indice, db: d.db, agora: () => agora }, { limiar: 0.5 });
    expect(e.chamadas[0]!.tipo).toBe('RETRIEVAL_QUERY');
    expect(v.chamadas[0]!.opcoes).toMatchObject({ topK: 20, returnMetadata: 'all' });
    expect(r.trechos).toHaveLength(8);
    expect(r.melhorSimilaridade).toBeCloseTo(0.9);
    expect(r.trechos[0]!.texto).toBe('texto h');
    expect(d.consultas.every((c) => c.params.length < 100)).toBe(true);
    expect(d.consultas.some((c) => c.sql.includes("status = 'ok'"))).toBe(true);
  });
  it('descarta ids sem linha no D1 (página não ok)', async () => {
    const v = vectorizeFalso([match('a', 0.9), match('b', 0.8)]);
    const d = d1Falso({ linhas: [linha('b')] });
    const r = await buscarTrechos('prazo', { embedder: embedderFalso().embedder, vectorize: v.indice, db: d.db, agora: () => agora }, { limiar: 0.5 });
    expect(r.trechos.map((t) => t.id)).toEqual(['b']);
    expect(r.melhorSimilaridade).toBeCloseTo(0.9);
  });
  it('abaixo do limiar devolve vazio', async () => {
    const v = vectorizeFalso([match('a', 0.3)]);
    const d = d1Falso({ fts: ['a'], linhas: [linha('a')] });
    const r = await buscarTrechos('prazo', { embedder: embedderFalso().embedder, vectorize: v.indice, db: d.db, agora: () => agora }, { limiar: 0.5 });
    expect(r.trechos).toEqual([]);
    expect(r.melhorSimilaridade).toBeCloseTo(0.3);
  });
  it('erro no FTS não derruba', async () => {
    const v = vectorizeFalso([match('a', 0.9)]);
    const d = d1Falso({ fts: new Error('fts5: syntax error'), linhas: [linha('a')] });
    const r = await buscarTrechos('prazo', { embedder: embedderFalso().embedder, vectorize: v.indice, db: d.db, agora: () => agora }, { limiar: 0.5 });
    expect(r.trechos.map((t) => t.id)).toEqual(['a']);
    expect(r.trechos[0]!.similaridade).toBeCloseTo(0.9);
  });
  it('hits só do FTS não superam o vetorial forte; vetorial abaixo do limiar some', async () => {
    const fts = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const v = vectorizeFalso([match('forte', 0.9), match('fraco', 0.3)]);
    const d = d1Falso({ fts, linhas: [linha('forte'), linha('fraco'), ...fts.map((id) => linha(id))] });
    const r = await buscarTrechos('prazo', { embedder: embedderFalso().embedder, vectorize: v.indice, db: d.db, agora: () => agora }, { limiar: 0.5 });
    expect(r.trechos[0]!.id).toBe('forte');
    expect(r.trechos.map((t) => t.id)).not.toContain('fraco');
  });
});
