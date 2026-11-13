// Empacota widget/src/index.ts e grava o resultado como módulo do Worker.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));
const saida = fileURLToPath(new URL('../worker-resposta/src/widget-gerado.ts', import.meta.url));

const r = await build({
  entryPoints: [raiz + 'src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  legalComments: 'none',
  write: false,
});

const codigo = r.outputFiles[0].text;
// LF explícito: o arquivo precisa ser idêntico em qualquer sistema.
writeFileSync(
  saida,
  `// Gerado por widget/build.mjs. Não editar.\nexport const WIDGET: string = ${JSON.stringify(codigo)};\n`,
  { encoding: 'utf8' },
);
console.log(`widget.js: ${Buffer.byteLength(codigo, 'utf8')} bytes`);
