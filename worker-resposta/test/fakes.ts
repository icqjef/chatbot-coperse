export interface MatchFalso {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface LinhaTrechoFalsa {
  id: string;
  texto: string;
  url: string;
  titulo: string;
  site: string;
  data_publicacao: string;
  processo: string;
  ano: number;
}

export interface VectorizeFalso {
  indice: VectorizeIndex;
  chamadas: { vetor: unknown; opcoes: Record<string, unknown> }[];
}

export function vectorizeFalso(matches: MatchFalso[]): VectorizeFalso {
  const chamadas: VectorizeFalso['chamadas'] = [];
  const indice = {
    async query(vetor: unknown, opcoes: Record<string, unknown>) {
      chamadas.push({ vetor, opcoes });
      return { matches, count: matches.length };
    },
  } as unknown as VectorizeIndex;
  return { indice, chamadas };
}

export interface D1Falso {
  db: D1Database;
  consultas: { sql: string; params: unknown[] }[];
}

/** `fts`: ids devolvidos pela consulta FTS (ou Error para simular erro de sintaxe). `linhas`: tabela trechos+paginas ok. */
export function d1Falso(opcoes: { fts?: string[] | Error; linhas: LinhaTrechoFalsa[] }): D1Falso {
  const consultas: D1Falso['consultas'] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() {
              consultas.push({ sql, params });
              if (sql.includes('trechos_fts')) {
                if (opcoes.fts instanceof Error) throw opcoes.fts;
                return { results: (opcoes.fts ?? []).map((trecho_id) => ({ trecho_id })) };
              }
              return { results: opcoes.linhas.filter((l) => params.includes(l.id)) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, consultas };
}
