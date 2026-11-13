// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const gerado = join(raiz, '..', 'worker-resposta', 'src', 'widget-gerado.ts');

function construir(): string {
  execFileSync(process.execPath, ['build.mjs'], { cwd: raiz });
  return readFileSync(gerado, 'utf8');
}

describe('build do widget', () => {
  it('gera o módulo com cabeçalho e tamanho dentro do limite', () => {
    const texto = construir();
    expect(texto.startsWith('// Gerado por widget/build.mjs. Não editar.\n')).toBe(true);
    expect(texto).not.toContain('\r');
    // Lê a linha 2 em vez de importar: importar o módulo quebra o rootDir do typecheck entre projetos.
    const linha = texto.split(String.fromCharCode(10))[1]!;
    const WIDGET = JSON.parse(linha.slice(linha.indexOf('= ') + 2, -1)) as string;
    expect(typeof WIDGET).toBe('string');
    expect(Buffer.byteLength(WIDGET, 'utf8')).toBeLessThanOrEqual(15360);
  });
  it('é determinístico', () => {
    expect(construir()).toBe(construir());
  });
  it('nenhum arquivo de src usa innerHTML', () => {
    const dir = join(raiz, 'src');
    for (const f of readdirSync(dir)) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('innerHTML');
    }
  });
});
