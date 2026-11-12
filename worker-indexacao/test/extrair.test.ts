import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extrairPagina } from '../src/extrair.js';

const html = readFileSync(new URL('./fixtures/coperse-artigo.html', import.meta.url), 'utf8');
const tituloFeed = 'Divulgação das informações sobre o local de realização da prova pela pessoa candidata';

describe('extrairPagina', () => {
  it('extrai o corpo do artigo real sem menu nem marcação', () => {
    const { texto, titulo } = extrairPagina(html);
    expect(texto.length).toBeGreaterThan(200);
    expect(texto).not.toContain('Portal de Vagas Ociosas'); // item do menu
    expect(texto).not.toContain('<');
    expect(texto).toContain('divulga as informações sobre o local');
    expect(titulo.replace(/\s+/g, ' ').trim()).toContain(tituloFeed);
  });
  it('junta células de tabela com " | "', () => {
    const r = extrairPagina('<div itemprop="articleBody"><table><tr><td>Curso</td><td>Vagas</td></tr></table></div>');
    expect(r.texto).toContain('Curso | Vagas');
  });
  it('separa parágrafos por linha em branco', () => {
    const r = extrairPagina('<div itemprop="articleBody"><p>Um</p><p>Dois</p></div>');
    expect(r.texto).toBe('Um\n\nDois');
  });
  it('HTML sem corpo útil gera texto vazio', () => {
    expect(extrairPagina('<html><body><nav>x</nav></body></html>').texto).toBe('');
  });
});
