export interface RegrasClassificacao {
  processos: { processo: string; padroes: RegExp[] }[];
  lista: { padroes: RegExp[]; excecoes: RegExp[] };
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function compilar(fontes: unknown, onde: string): RegExp[] {
  if (!Array.isArray(fontes) || !fontes.every((x) => typeof x === 'string'))
    throw new Error(`${onde}: deve ser uma lista de textos.`);
  return fontes.map((f: string) => {
    if (f === '') throw new Error(`${onde}: padrão vazio não é permitido.`);
    try {
      return new RegExp(f);
    } catch {
      throw new Error(`${onde}: padrão inválido: ${f}`);
    }
  });
}

export function carregarRegras(processosJson: unknown, listasJson: unknown): RegrasClassificacao {
  if (!Array.isArray(processosJson)) throw new Error('processos.json deve ser uma lista.');
  const processos = processosJson.map((r, i) => {
    if (!ehObjeto(r) || typeof r.processo !== 'string' || r.processo === '')
      throw new Error(`processos.json #${i + 1}: campo "processo" obrigatório.`);
    return { processo: r.processo, padroes: compilar(r.padroes, `processos.json "${r.processo}"`) };
  });
  if (!ehObjeto(listasJson)) throw new Error('listas.json deve ser um objeto.');
  return {
    processos,
    lista: {
      padroes: compilar(listasJson.padroes, 'listas.json "padroes"'),
      excecoes: compilar(listasJson.excecoes, 'listas.json "excecoes"'),
    },
  };
}

export function normalizar(s: string): string {
  const t = s.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run; // sequência inválida: mantém o trecho original
    }
  });
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferirProcesso(textos: string[], regras: RegrasClassificacao): string | null {
  const norm = textos.map(normalizar);
  for (const { processo, padroes } of regras.processos)
    if (norm.some((t) => padroes.some((p) => p.test(t)))) return processo;
  return null;
}

const ANO = /(?<!\d)20[0-3]\d(?!\d)/g;

export function inferirAno(titulo: string, url: string): number | null {
  const noTitulo = titulo.match(ANO);
  if (noTitulo?.[0]) return Number(noTitulo[0]);
  let caminho = url;
  try {
    caminho = new URL(url).pathname;
  } catch {
    // url relativa ou malformada: usa o texto inteiro
  }
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    // mantém
  }
  const noCaminho = caminho.match(ANO);
  return noCaminho ? Number(noCaminho[noCaminho.length - 1]) : null;
}

function nomeDoArquivo(url: string): string {
  let caminho = url;
  try {
    caminho = new URL(url).pathname;
  } catch {
    // usa o texto inteiro
  }
  return caminho.split('/').pop() ?? '';
}

export function ehListaDeCandidatos(titulo: string, url: string, regras: RegrasClassificacao): boolean {
  const t = normalizar(titulo);
  const arquivo = normalizar(nomeDoArquivo(url));
  const casa = regras.lista.padroes.some((p) => p.test(t) || p.test(arquivo));
  return casa && !regras.lista.excecoes.some((e) => e.test(t));
}
