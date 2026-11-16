/**
 * Cronograma como dados (checklist, item 1). Depois da indexação, cada PDF novo ou alterado das edições
 * atuais que fala em cronograma passa uma vez pelo Gemini (páginas HTML de notícia traziam prazos antigos e
 * datas sem ano: em 16/11, "inscrição até 01/10" de antes da prorrogação), que devolve as etapas e datas em JSON. Só ficam as
 * linhas conferidas contra o texto original (comum/src/cronograma.ts): data que não está logo depois do nome da
 * etapa no documento é descartada.
 */
import { conferirLinhas, interpretarQuando, type LinhaCronograma } from '@chatbot/comum/cronograma';
import { ErroAutenticacaoProvedor } from '@chatbot/comum/provedores/embeddings';
import type { Gerador } from '@chatbot/comum/provedores/geracao';
import type { ClienteCloudflare } from './cloudflare.js';

/** Editais de outro público (fiscais, avaliadores, servidores...) têm cronograma próprio e não entram. */
export const NAO_CANDIDATOS = /fiscal|fiscais|avaliador|servidor|bolsist|monitori|docente|professor|banca|estagi/i;
const DATA = /\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g;
const MIN_DATAS_TRECHO = 3;
const MAX_CARACTERES = 60_000;
/** Teto de chamadas ao Gemini por execução (a primeira execução lê todos os documentos de uma vez). */
const MAX_DOCUMENTOS = 40;

export const INSTRUCAO = `Você extrai cronogramas de processos seletivos de ingresso em cursos de graduação da FURG.
Você recebe o texto de um documento (edital, cronograma ou página). Se ele traz um cronograma (etapas com datas) do processo seletivo para as pessoas candidatas, devolva:
{"linhas": [{"etapa": "...", "quando": "..."}]}
- Uma linha por etapa, na ordem do documento.
- "etapa": o nome da etapa copiado exatamente como está no texto (só junte as quebras de linha com um espaço).
- "quando": só a data ou o período, copiado exatamente como está no texto (por exemplo "13/08 a 07/10/2026", "até 21/12/2026", "22/11/2026"), sem local, endereço, horário de site ou dia da semana.
- Não inclua etapas sem data (por exemplo "em data a ser designada").
- Não junte nem troque datas entre etapas: cada etapa leva a data escrita logo depois dela.
Se o documento não traz cronograma para as pessoas candidatas (por exemplo, edital de fiscais, avaliadores, servidores, bolsistas ou só uma notícia), devolva {"linhas": []}.
Responda somente com o JSON, sem comentários.`;

/** Só os trechos com datas (o cronograma), na ordem do documento e até 60 mil caracteres. */
export function textoParaExtrair(trechos: string[]): string {
  const comDatas = trechos.filter((t) => (t.match(DATA)?.length ?? 0) >= MIN_DATAS_TRECHO);
  return comDatas.join('\n').slice(0, MAX_CARACTERES);
}

/** JSON da resposta, com ou sem cerca de código; qualquer outra coisa vira lista vazia. */
export function lerJson(bruta: string): LinhaCronograma[] {
  const limpa = bruta.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    const obj = JSON.parse(limpa) as { linhas?: unknown };
    return Array.isArray(obj.linhas) ? (obj.linhas as LinhaCronograma[]) : [];
  } catch {
    return [];
  }
}

export interface DepsCronograma {
  cf: ClienteCloudflare;
  gerador: Gerador;
  agora(): string;
}

export interface ResumoCronograma {
  lidos: number;
  com_cronograma: number;
  linhas: number;
  falhas: number;
}

export async function atualizarCronogramas(deps: DepsCronograma, anoMinimo: number): Promise<ResumoCronograma> {
  const { cf } = deps;
  const resumo: ResumoCronograma = { lidos: 0, com_cronograma: 0, linhas: 0, falhas: 0 };
  const candidatos = await cf.d1(
    `SELECT p.url, p.titulo, p.hash FROM paginas p
     WHERE p.status = 'ok' AND p.tipo = 'pdf' AND p.ano >= ?
       AND EXISTS (SELECT 1 FROM trechos t WHERE t.url = p.url AND lower(t.texto) LIKE '%cronograma%')
     ORDER BY p.data_publicacao DESC`,
    [anoMinimo],
  );
  const feitos = new Map((await cf.d1('SELECT url, hash FROM cronograma_fontes')).map((r) => [r.url as string, r.hash as string | null]));

  for (const c of candidatos) {
    const url = String(c.url);
    const hash = (c.hash as string | null) ?? null;
    if (NAO_CANDIDATOS.test(`${c.titulo ?? ''} ${url}`)) continue;
    if (feitos.has(url) && feitos.get(url) === hash) continue;
    if (resumo.lidos >= MAX_DOCUMENTOS) break;
    resumo.lidos++;
    try {
      // Ordem dos trechos pelo número depois do hífen ("<sha1>-10" vem depois de "<sha1>-9").
      const trechos = (await cf.d1('SELECT texto FROM trechos WHERE url = ? ORDER BY CAST(substr(id, 42) AS INTEGER)', [url])).map((r) =>
        String(r.texto),
      );
      const texto = textoParaExtrair(trechos);
      const linhas = texto ? conferirLinhas(texto, lerJson(await deps.gerador.gerar(INSTRUCAO, [{ papel: 'usuario', texto }]))) : [];
      await cf.d1('DELETE FROM cronograma WHERE url = ?', [url]);
      if (linhas.length) {
        await cf.inserirLinhas(
          'cronograma',
          ['url', 'ordem', 'etapa', 'quando', 'inicio', 'fim'],
          linhas.map((l, i) => {
            const { inicio, fim } = interpretarQuando(l.quando);
            return [url, i, l.etapa, l.quando, inicio, fim];
          }),
        );
        resumo.com_cronograma++;
        resumo.linhas += linhas.length;
      }
      await cf.d1('INSERT OR REPLACE INTO cronograma_fontes (url, hash, linhas, atualizado) VALUES (?, ?, ?, ?)', [
        url, hash, linhas.length, deps.agora(),
      ]);
    } catch (e) {
      if (e instanceof ErroAutenticacaoProvedor) throw e;
      // Fica sem registro em cronograma_fontes: a próxima execução tenta de novo.
      resumo.falhas++;
      console.error(`Cronograma não lido (${url}): ${e instanceof Error ? e.message.split(' — ')[0] : String(e)}`);
    }
  }

  // Página que saiu do índice (ou que não é PDF) leva o cronograma junto.
  await cf.d1("DELETE FROM cronograma WHERE url NOT IN (SELECT url FROM paginas WHERE status = 'ok' AND tipo = 'pdf')");
  await cf.d1("DELETE FROM cronograma_fontes WHERE url NOT IN (SELECT url FROM paginas WHERE status = 'ok' AND tipo = 'pdf')");
  return resumo;
}
