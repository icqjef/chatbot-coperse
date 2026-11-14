export interface Site {
  id: string;
  nome: string;
  base: string;
  feed?: string;
  processo_padrao?: string;
  paginas_chave: string[];
  profundidade: number;
  dominios_permitidos: string[];
  /** expressões regulares aplicadas à URL completa: o que casar não é indexado (edições antigas) */
  excluir?: string[];
  /** hosts de onde o site se mudou (ex.: sisu3.furg.br): o que estiver indexado ou na fila neles migra para o host de `base` */
  hosts_antigos?: string[];
}

export interface ItemFeed {
  titulo: string;
  url: string;
  /** ISO 8601 */
  data: string;
  guid: string;
}

export interface LinkEncontrado {
  url: string;
  titulo: string;
}

export interface PaginaExtraida {
  titulo: string;
  texto: string;
  /** ISO 8601, quando a página informa a data de publicação */
  data?: string;
  links: LinkEncontrado[];
  /** Perguntas frequentes do JSON-LD (FAQPage), cada uma "Pergunta: …\nResposta: …"; viram trechos próprios. */
  perguntas?: string[];
}

export type TipoEmbedding = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface Embedder {
  embed(textos: string[], tipo: TipoEmbedding): Promise<number[][]>;
}

export interface MetadadosTrecho {
  site: string;
  url: string;
  titulo: string;
  data: string;
  processo: string;
  ano: number;
  trecho_id: string;
}

export interface VetorTrecho {
  id: string;
  values: number[];
  metadata: MetadadosTrecho;
}

export type TipoDocumento = 'html' | 'pdf' | 'lista';

/** Texto já extraído de uma página ou PDF, pronto para indexar. */
export interface Documento {
  site: Site;
  url: string;
  tipo: TipoDocumento;
  titulo: string;
  /** ISO 8601 */
  data: string;
  /**
   * `data` é só herdada ou "agora" (lista em PDF sem Last-Modified): serve para ordenar, mas não entra
   * no resumo da lista, que precisa ser igual de uma revisita para outra.
   */
  dataDesconhecida?: boolean;
  processo: string;
  ano: number;
  texto: string;
  /** Trechos prontos que entram depois da divisão do texto (perguntas frequentes da página). */
  secoes?: string[];
}
