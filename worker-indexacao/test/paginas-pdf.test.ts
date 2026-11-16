import { describe, expect, it, vi } from 'vitest';
import { dividirEmTrechos } from '@chatbot/comum/trechos';
import type { Site } from '@chatbot/comum/tipos';
import { completarPaginas, gravarPaginas } from '../src/paginas-pdf.js';
import type { ClienteCloudflare } from '../src/cloudflare.js';

const site: Site = { id: 'coperse', nome: 'C', base: 'https://coperse.furg.br', paginas_chave: [], profundidade: 1, dominios_permitidos: ['coperse.furg.br'] };
const texto = Array.from({ length: 4 }, (_, i) => `Seção ${i} ` + Array.from({ length: 400 }, (_, j) => `s${i}p${j}`).join(' ')).join('\n\n');
const trechos = dividirEmTrechos(texto);
const meio = texto.indexOf('Seção 2');

function cfFalso(textosNoBanco: string[]) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const cf = {
    async d1(sql: string, params: unknown[] = []) {
      sqls.push({ sql, params });
      if (sql.includes('SELECT DISTINCT t.url')) return [{ url: 'https://coperse.furg.br/e.pdf', site: 'coperse' }];
      if (sql.startsWith('SELECT texto FROM trechos')) return textosNoBanco.map((t) => ({ texto: t }));
      return [];
    },
  } as unknown as ClienteCloudflare;
  return { cf, sqls };
}
const deps = (cf: ClienteCloudflare) => ({
  cf,
  buscar: vi.fn(async () => ({ tipo: 'pdf' as const, bytes: new Uint8Array([1]) })),
  extrairPdf: vi.fn(async () => ({ texto, inicioPaginas: [0, meio] })),
  esperar: async () => {},
});

describe('completarPaginas', () => {
  it('PDF com os mesmos trechos: grava a página de cada um numa chamada só', async () => {
    const { cf, sqls } = cfFalso(trechos);
    const r = await completarPaginas(deps(cf), [site]);
    expect(r).toEqual({ lidos: 1, completados: 1, mudaram: 0, falhas: 0 });
    const upd = sqls.find((s) => s.sql.startsWith('UPDATE trechos SET pagina = CASE ordem'))!;
    expect(upd.params.at(-1)).toBe('https://coperse.furg.br/e.pdf');
    expect(upd.params[1]).toBe(1);
    expect(upd.params.at(-2)).toBe(2);
  });

  it('PDF que mudou: página 0 (a revisita normal reindexa); falha de rede: tenta de novo depois', async () => {
    const mudou = cfFalso(['texto antigo']);
    expect((await completarPaginas(deps(mudou.cf), [site])).mudaram).toBe(1);
    expect(mudou.sqls.find((s) => s.sql.startsWith('UPDATE'))!.params).toEqual([0, 0, 'https://coperse.furg.br/e.pdf']);
    const rede = cfFalso(trechos);
    const d = deps(rede.cf);
    d.buscar.mockRejectedValueOnce(new Error('HTTP 500'));
    expect((await completarPaginas(d, [site])).falhas).toBe(1);
    expect(rede.sqls.some((s) => s.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('gravarPaginas sem trechos não chama o banco', async () => {
    const { cf, sqls } = cfFalso([]);
    await gravarPaginas(cf, 'u', []);
    expect(sqls).toHaveLength(0);
  });
});
