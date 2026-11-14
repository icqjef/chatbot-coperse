import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extrairPdf } from '../src/pdf.js';

describe('extrairPdf', () => {
  it('extrai o texto do edital real', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/edital-pequeno.pdf', import.meta.url)));
    const r = await extrairPdf(bytes);
    expect(r.texto).toContain('ESPECÍFICO PARA INGRESSO DE ESTUDANTES QUILOMBOLAS');
    expect(r.paginas).toBeGreaterThanOrEqual(1);
  });
  it('lança erro para bytes que não são PDF', async () => {
    await expect(extrairPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow('PDF inválido');
  });
});

describe('extrairPdf: limites (M3)', () => {
  const falso = (paginas: string[], atraso = 0) => async () => ({
    numPages: paginas.length,
    getPage: async (n: number) => {
      if (atraso) await new Promise((r) => setTimeout(r, atraso));
      return { getTextContent: async () => ({ items: [{ str: paginas[n - 1]!, hasEOL: true }] }) };
    },
  });
  const sem = new Uint8Array(0);

  it('lê só as primeiras páginas', async () => {
    const r = await extrairPdf(sem, { maxPaginas: 2 }, falso(['um', 'dois', 'três']));
    expect(r.texto).toBe('um\n\ndois');
    expect(r.paginas).toBe(3);
  });
  it('para de ler ao passar do limite de caracteres e corta o texto', async () => {
    const r = await extrairPdf(sem, { maxCaracteres: 5 }, falso(['abcdefgh', 'nunca lida']));
    expect(r.texto).toBe('abcde');
  });
  it('estoura o prazo com erro "PDF inválido"', async () => {
    await expect(extrairPdf(sem, { prazoMs: 20 }, falso(['a', 'b', 'c'], 50))).rejects.toThrow('PDF inválido: leitura passou');
  });
  it('o texto do edital real é o mesmo do extractText do unpdf (hash não muda)', async () => {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/edital-pequeno.pdf', import.meta.url)));
    const { text } = await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true });
    const antigo = text.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    expect((await extrairPdf(bytes)).texto).toBe(antigo);
  });
});
