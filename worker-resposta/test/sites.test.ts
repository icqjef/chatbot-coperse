import { describe, expect, it, vi } from 'vitest';
import { carregarRegras } from '@chatbot/comum/classificar';
import listas from '../../config/listas.json';
import processos from '../../config/processos.json';
import { chaveCache } from '../src/cache';
import { responderPergunta } from '../src/perguntar';
import { processoDaPagina, processoDoSite } from '../src/sites';

const REGRAS = carregarRegras(processos, listas);

describe('página atual como contexto', () => {
  it('processo do site', () => {
    expect(processoDoSite('https://vestibular.furg.br')).toBe('vestibular');
    expect(processoDoSite('https://sisu3.furg.br')).toBe('sisu');
    expect(processoDoSite('https://coperse.furg.br')).toBeUndefined();
  });

  it('processo pelo caminho ou título da página; senão o do site; página de outro endereço não vale', () => {
    const c = 'https://coperse.furg.br';
    expect(processoDaPagina({ url: 'https://coperse.furg.br/indigenas-ingresso-2027-1', titulo: 'COPERSE' }, c, REGRAS)).toBe('indigenas');
    expect(processoDaPagina({ url: 'https://coperse.furg.br/', titulo: 'Vestibular FURG 2027 - COPERSE' }, c, REGRAS)).toBe('vestibular');
    expect(processoDaPagina({ url: 'https://coperse.furg.br/', titulo: 'COPERSE' }, c, REGRAS)).toBeNull();
    expect(processoDaPagina({ url: 'https://outro.com/sisu', titulo: 'SiSU' }, c, REGRAS)).toBeNull();
    expect(processoDaPagina(undefined, 'https://sisu.furg.br', REGRAS)).toBe('sisu');
    expect(processoDaPagina({ url: 'x'.repeat(400) }, 'https://sisu.furg.br', REGRAS)).toBe('sisu');
  });

  it('pergunta sem processo usa o da página (busca, prompt); pergunta com processo vence', async () => {
    const rodar = async (pergunta: string) => {
      let sistema = '';
      const buscar = vi.fn(async () => ({
        trechos: [{ id: 'a', url: 'https://u', titulo: 't', site: 's', data: '2026-10-01', processo: 'sisu', ano: 2026, texto: 'x', similaridade: 0.9 }],
        melhorSimilaridade: 0.9,
      }));
      await responderPergunta(
        { pergunta, historico: [], processoPagina: 'sisu' },
        { buscar, gerador: { gerar: async (s: string) => ((sistema = s), 'Resposta [1].') }, agora: () => new Date('2026-11-16T12:00:00Z') },
      );
      return { processo: (buscar.mock.calls[0] as unknown[])[1], sistema };
    };
    const semProcesso = await rodar('Quando sai o resultado?');
    expect(semProcesso.processo).toBe('sisu');
    expect(semProcesso.sistema).toContain('A pessoa está numa página sobre o SiSU.');
    const comProcesso = await rodar('Quando sai o resultado do Vestibular?');
    expect(comProcesso.processo).toBe('vestibular');
    expect(comProcesso.sistema).not.toContain('A pessoa está numa página');
  });

  it('a chave do cache muda com o processo da página', async () => {
    const d = new Date('2026-11-16T12:00:00Z');
    expect(await chaveCache('quando sai o resultado', d, 'sisu')).not.toBe(await chaveCache('quando sai o resultado', d, 'vestibular'));
  });
});
