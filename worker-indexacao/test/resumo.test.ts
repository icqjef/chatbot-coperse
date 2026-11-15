import { describe, expect, it } from 'vitest';
import { lerDados, montarResumo, periodos, tituloResumo, type DadosResumo } from '../src/resumo';
import type { ClienteCloudflare } from '../src/cloudflare';

const agora = new Date('2026-11-16T11:00:00Z'); // segunda, 08h em Brasília

describe('periodos', () => {
  it('7 dias completos até ontem e os 7 anteriores, em Brasília', () => {
    expect(periodos(agora)).toEqual({ atual: ['2026-11-09', '2026-11-15'], anterior: ['2026-11-02', '2026-11-08'] });
  });
});

const dados: DadosResumo = {
  atual: {
    inicio: '2026-11-09',
    fim: '2026-11-15',
    perguntas: { respondida: 80, sem_base: 15, recusa: 5, conversa: 30 },
    ajudou: 30,
    nao: 10,
    pico: { dia: '2026-11-12', n: 40 },
  },
  anterior: { inicio: '2026-11-02', fim: '2026-11-08', perguntas: { respondida: 60 }, ajudou: 20, nao: 0, pico: { dia: '', n: 0 } },
  paginas: [{ url: 'https://sisu.furg.br/x', titulo: 'Lista [de] espera', n: 3 }],
  saude: {
    ultimaIndexacao: { inicio: '2026-11-16T09:00:00Z', fim: '2026-11-16T09:03:00Z', paginas: 57, erros: 1 },
    paginasOk: 1073,
    errosPorSite: [{ site: 'coperse', n: 18 }],
  },
  edicoesNovas: [],
  cota: 1000,
  agora: agora.toISOString(),
};

describe('montarResumo', () => {
  it('números, comparação, cota, leitura dos sites, páginas e link do painel; sem texto de resposta', () => {
    const t = montarResumo(dados);
    expect(tituloResumo(dados)).toBe('Resumo semanal do assistente: 09/11/2026 a 15/11/2026');
    expect(t).toContain('Perguntas sobre os processos seletivos: **100** (+40 sobre a semana anterior)');
    expect(t).toContain('Sem resposta: **20** (20%), das quais 15 não encontradas nas páginas e 5 recusadas');
    expect(t).toContain('Avaliações: **40** (👍 30 · 👎 10)');
    expect(t).toContain('Taxa de aprovação: **75%** (−25 pontos sobre a semana anterior)');
    expect(t).toContain('Dia com mais perguntas: **40** em 12/11/2026, 4% da cota de 1000 por dia');
    expect(t).not.toContain('perto do limite');
    expect(t).toContain('Última leitura: 16/11/2026, 06:03 (57 páginas lidas, 1 com erro)');
    expect(t).not.toContain('não são lidos');
    expect(t).toContain('Páginas que deram erro na última tentativa: coperse 18');
    expect(t).not.toContain('Edição nova');
    expect(t).toContain('- 3× [Lista de espera](https://sisu.furg.br/x)');
    expect(t).toContain('/painel');
  });
  it('alertas: cota perto do fim, perguntas barradas, sites sem leitura e edição nova', () => {
    const t = montarResumo({
      ...dados,
      atual: { ...dados.atual, perguntas: { ...dados.atual.perguntas, limite: 7 }, pico: { dia: '2026-11-12', n: 850 } },
      saude: { ...dados.saude, ultimaIndexacao: { inicio: '2026-11-15T09:00:00Z', fim: '2026-11-15T09:03:00Z', paginas: 1, erros: 0 }, errosPorSite: [] },
      edicoesNovas: [{ processo: 'sisu', conferida: 2026, nova: 2027, paginas: 40 }],
    });
    expect(t).toContain('85% da cota');
    expect(t).toContain('**7** perguntas barradas');
    expect(t).toContain('perto do limite');
    expect(t).toContain('Os sites não são lidos há 25 horas');
    expect(t).toContain('Nenhuma página com erro.');
    expect(t).toContain('**sisu**: 40 páginas da edição 2027; as perguntas de referência conferem a 2026.');
  });
  it('semana sem votos nem páginas', () => {
    const t = montarResumo({ ...dados, atual: { ...dados.atual, ajudou: 0, nao: 0 }, paginas: [] });
    expect(t).toContain('Nenhuma avaliação na semana.');
    expect(t).toContain('## Páginas nas respostas que não ajudaram\n\n- Nenhuma.');
  });
});

describe('lerDados', () => {
  it('soma por tipo, conta páginas, lê a saúde e detecta edição nova a partir de 3 páginas', async () => {
    const cf = {
      async d1(sql: string, params: unknown[] = []) {
        if (sql.includes('GROUP BY tipo')) return params[0] === '2026-11-09' ? [{ tipo: 'respondida', n: 5 }] : [];
        if (sql.includes('GROUP BY dia')) return [{ dia: '2026-11-10', n: 5 }];
        if (sql.includes('COUNT(*) AS nao')) return [{ ajudou: 2, nao: 1 }];
        if (sql.startsWith('SELECT fontes')) return [{ fontes: '["https://a/x","https://a/x","https://a/y"]' }, { fontes: '["https://a/x"]' }, { fontes: 'lixo' }];
        if (sql.includes('FROM execucoes')) return [{ inicio: '2026-11-16T09:00:00Z', fim: null, paginas: 3, erros: 0 }];
        if (sql.includes("status = 'ok'\"") || sql === "SELECT COUNT(*) AS n FROM paginas WHERE status = 'ok'") return [{ n: 10 }];
        if (sql.includes('GROUP BY site')) return [{ site: 'coperse', n: 2 }];
        if (sql.includes('MAX(ano)')) return params[0] === 'sisu' ? [{ ano: 2027, n: 3 }] : [{ ano: 2028, n: 2 }];
        return [{ url: 'https://a/x', titulo: 'X' }];
      },
    } as unknown as ClienteCloudflare;
    const d = await lerDados(cf, agora, { edicoes: { sisu: 2026, vestibular: 2027 }, cota: 500 });
    expect(d.atual.perguntas).toEqual({ respondida: 5 });
    expect(d.atual.pico).toEqual({ dia: '2026-11-10', n: 5 });
    expect(d.paginas).toEqual([
      { url: 'https://a/x', titulo: 'X', n: 2 },
      { url: 'https://a/y', titulo: 'https://a/y', n: 1 },
    ]);
    expect(d.saude).toEqual({ ultimaIndexacao: { inicio: '2026-11-16T09:00:00Z', fim: null, paginas: 3, erros: 0 }, paginasOk: 10, errosPorSite: [{ site: 'coperse', n: 2 }] });
    expect(d.edicoesNovas).toEqual([{ processo: 'sisu', conferida: 2026, nova: 2027, paginas: 3 }]);
    expect(d.cota).toBe(500);
  });
});
