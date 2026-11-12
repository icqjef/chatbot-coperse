export interface Site {
  id: string;
  nome: string;
  base: string;
  feed?: string;
  paginas_chave: string[];
  profundidade: number;
  dominios_permitidos: string[];
}

export interface ItemFeed {
  titulo: string;
  url: string;
  /** ISO 8601 */
  data: string;
  guid: string;
}

export interface PaginaExtraida {
  titulo: string;
  texto: string;
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
