import { describe, expect, it, vi } from 'vitest';
import type { Trecho } from '../src/busca';
import { responderPergunta } from '../src/perguntar';
import { decidirAviso, edicaoCitada, ehRetificacaoDeEdital, ultimaRetificacao } from '../src/retificacao';

const t = (url: string, data: string, processo = 'quilombolas', ano: number | null = 2027): Trecho => ({
  id: url, url, titulo: url, site: 'coperse', data, processo, ano, texto: 'x', similaridade: 0.8,
});
const RET = { url: 'https://coperse.furg.br/Edital_PS_Quilombolas_2027_Ret.pdf', titulo: 'Edital retificado', data: '2026-11-05T00:00:00Z' };
const hoje = new Date('2026-11-16T12:00:00Z');

describe('retificação', () => {
  it('reconhece retificação de edital ou cronograma, não de lista', () => {
    expect(ehRetificacaoDeEdital('Edital retificado', 'https://x/Edital_PS_Quilombolas_2027_Ret.pdf')).toBe(true);
    expect(ehRetificacaoDeEdital('Consulte aqui a retificação do cronograma', 'https://x/Cronograma_retificado.pdf')).toBe(true);
    expect(ehRetificacaoDeEdital('RETIFICAÇÃO Nº 2 DO EDITAL DO PROCESSO SELETIVO', 'https://x/a.pdf')).toBe(true);
    expect(ehRetificacaoDeEdital('Retificação da lista de inscrições homologadas', 'https://x/LISTA.pdf')).toBe(false);
  });

  it('cita só documento anterior: alerta com o documento retificado', () => {
    const a = decidirAviso([t('https://x/Edital_original.pdf', '2026-10-23T00:00:00Z')], RET, hoje);
    expect(a).toEqual({
      tipo: 'atencao',
      texto: 'Atenção: houve retificação em 05/11/2026, depois de uma das páginas usadas nesta resposta. Confira o documento retificado:',
      url: RET.url,
      titulo: 'Edital retificado',
    });
  });

  it('cita a retificação (ou mais novo): nota, só até 60 dias', () => {
    expect(decidirAviso([t(RET.url, RET.data)], RET, hoje)?.tipo).toBe('info');
    expect(decidirAviso([t('https://x/antigo.pdf', '2026-10-01'), t('https://x/novo.html', '2026-11-10')], RET, hoje)?.tipo).toBe('info');
    expect(decidirAviso([t(RET.url, RET.data)], RET, new Date('2027-02-01T12:00:00Z'))).toBeNull();
    expect(decidirAviso([t(RET.url, RET.data)], null, hoje)).toBeNull();
  });

  it('edição da resposta: primeiro trecho citado de um processo', () => {
    expect(edicaoCitada([t('a', 'd', 'geral', 2027), t('b', 'd', 'quilombolas', 2027)])).toEqual({ processo: 'quilombolas', ano: 2027 });
    expect(edicaoCitada([t('a', 'd', 'geral', 2027)])).toBeNull();
  });

  it('ultimaRetificacao filtra pelo título e pula retificação de lista', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              { url: 'https://x/LISTA_RETIFICADA.pdf', titulo: 'Retificação da lista de espera', data_publicacao: '2026-11-10' },
              { url: RET.url, titulo: RET.titulo, data_publicacao: RET.data },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;
    expect(await ultimaRetificacao(db, 'quilombolas', 2027)).toEqual(RET);
  });

  it('no fluxo: a resposta leva o aviso quando cita documento anterior', async () => {
    const antigo = t('https://x/Edital_original.pdf', '2026-10-23T00:00:00Z');
    const retificacao = vi.fn(async () => RET);
    const r = await responderPergunta(
      { pergunta: 'Quais documentos o processo de quilombolas pede?', historico: [] },
      {
        buscar: async () => ({ trechos: [antigo], melhorSimilaridade: 0.8 }),
        gerador: { gerar: async () => 'Declaração da comunidade [1].' },
        agora: () => hoje,
        retificacao,
      },
    );
    expect(retificacao).toHaveBeenCalledWith('quilombolas', 2027);
    expect(r.aviso?.tipo).toBe('atencao');
  });
});
