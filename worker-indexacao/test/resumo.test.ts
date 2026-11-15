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
  atual: { inicio: '2026-11-09', fim: '2026-11-15', perguntas: { respondida: 80, sem_base: 15, recusa: 5, conversa: 30 }, ajudou: 30, nao: 10 },
  anterior: { inicio: '2026-11-02', fim: '2026-11-08', perguntas: { respondida: 60 }, ajudou: 20, nao: 0 },
  paginas: [{ url: 'https://sisu.furg.br/x', titulo: 'Lista [de] espera', n: 3 }],
};

describe('montarResumo', () => {
  it('números, comparação, páginas e link do painel; sem texto de resposta', () => {
    const t = montarResumo(dados);
    expect(tituloResumo(dados)).toBe('Resumo semanal do assistente: 09/11/2026 a 15/11/2026');
    expect(t).toContain('Perguntas sobre os processos seletivos: **100** (+40 sobre a semana anterior)');
    expect(t).toContain('Sem resposta: **20** (20%), das quais 15 não encontradas nas páginas e 5 recusadas');
    expect(t).toContain('Avaliações: **40** (👍 30 · 👎 10)');
    expect(t).toContain('Taxa de aprovação: **75%** (−25 pontos sobre a semana anterior)');
    expect(t).toContain('- 3× [Lista de espera](https://sisu.furg.br/x)');
    expect(t).toContain('/painel');
  });
  it('semana sem votos nem páginas', () => {
    const t = montarResumo({ ...dados, atual: { ...dados.atual, ajudou: 0, nao: 0 }, paginas: [] });
    expect(t).toContain('Nenhuma avaliação na semana.');
    expect(t).toContain('## Páginas nas respostas que não ajudaram\n\n- Nenhuma.');
  });
});

describe('lerDados', () => {
  it('soma por tipo, conta cada página uma vez por avaliação e busca os títulos', async () => {
    const cf = {
      async d1(sql: string, params: unknown[] = []) {
        if (sql.includes('contagem_perguntas')) return params[0] === '2026-11-09' ? [{ tipo: 'respondida', n: 5 }] : [];
        if (sql.includes('COUNT(*)')) return [{ ajudou: 2, nao: 1 }];
        if (sql.startsWith('SELECT fontes')) return [{ fontes: '["https://a/x","https://a/x","https://a/y"]' }, { fontes: '["https://a/x"]' }, { fontes: 'lixo' }];
        return [{ url: 'https://a/x', titulo: 'X' }];
      },
    } as unknown as ClienteCloudflare;
    const d = await lerDados(cf, agora);
    expect(d.atual.perguntas).toEqual({ respondida: 5 });
    expect(d.anterior.perguntas).toEqual({});
    expect(d.paginas).toEqual([
      { url: 'https://a/x', titulo: 'X', n: 2 },
      { url: 'https://a/y', titulo: 'https://a/y', n: 1 },
    ]);
  });
});
