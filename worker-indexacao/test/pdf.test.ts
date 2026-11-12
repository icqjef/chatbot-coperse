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
