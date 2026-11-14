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

/** Processo citado seguido, em até 60 caracteres, de um ano: "Vestibular FURG 2027". */
const PROCESSO_ANO = /(?<![a-z])(?:vestibular|sisu|processo seletivo|ps)(?![a-z])[\s\S]{0,60}?(?<!\d)(20[0-3]\d)(?!\d)/i;
const INICIO_TEXTO = 3000;

/** Ordem: ano no título; ano citado junto ao nome do processo no início do texto; último ano do caminho da URL. */
export function inferirAno(titulo: string, url: string, texto?: string): number | null {
  const noTitulo = titulo.match(ANO);
  if (noTitulo?.[0]) return Number(noTitulo[0]);
  const noTexto = texto?.slice(0, INICIO_TEXTO).match(PROCESSO_ANO);
  if (noTexto?.[1]) return Number(noTexto[1]);
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

const ultimoSegmento = (s: string) => s.split('/').filter(Boolean).pop() ?? '';

/**
 * Nome do arquivo de um link, decodificado. Se houver o parâmetro `arquivo` (vestibular:
 * /api/documentos/publico?arquivo=pasta%2FNome.pdf), vale o último segmento do valor dele; senão o do caminho.
 */
export function nomeDoArquivo(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return ultimoSegmento(url);
  }
  const arquivo = u.searchParams.get('arquivo');
  if (arquivo) return ultimoSegmento(arquivo);
  const nome = ultimoSegmento(u.pathname);
  try {
    return decodeURIComponent(nome);
  } catch {
    return nome;
  }
}

/** número + 2 ou mais palavras de nome (inicial maiúscula, só letras); colunas à direita são ignoradas */
const LINHA_DE_NOME = /^\d{1,6}\s+(?![–\-.):])\p{Lu}\p{L}+\s+\p{Lu}\p{L}+(?:\s|$)/u;

function ehCabecalhoDeNomes(linha: string): boolean {
  const n = normalizar(linha);
  const i = n.indexOf('inscricao');
  const m = /\bnome\b/.exec(n);
  return i >= 0 && !!m && Math.abs(m.index - i) <= 40;
}

/**
 * Lista nominal detectada pelo conteúdo do PDF (primeiros 4000 caracteres): 8+ linhas "número Nome Sobrenome", ou
 * cabeçalho "inscrição ... nome" seguido de 3+ dessas linhas nas 10 linhas seguintes.
 */
export function pareceListaDeNomes(texto: string): boolean {
  const linhas = texto.slice(0, 4000).split(/\r?\n/).map((l) => l.trim());
  const ehNome = linhas.map((l) => LINHA_DE_NOME.test(l));
  if (ehNome.filter(Boolean).length >= 8) return true;
  return linhas.some((l, i) => ehCabecalhoDeNomes(l) && ehNome.slice(i + 1, i + 11).filter(Boolean).length >= 3);
}

export function ehListaDeCandidatos(titulo: string, url: string, regras: RegrasClassificacao): boolean {
  const t = normalizar(titulo);
  const arquivo = normalizar(nomeDoArquivo(url));
  const casa = regras.lista.padroes.some((p) => p.test(t) || p.test(arquivo));
  return casa && !regras.lista.excecoes.some((e) => e.test(t));
}
