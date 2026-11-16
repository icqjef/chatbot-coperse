/**
 * Completa a página dos trechos de PDFs indexados antes do item 7 da checklist (link para a página do PDF).
 * PDF sem mudança só volta à fila a cada 30 dias; este passo baixa até 30 por execução, confere que os trechos
 * continuam iguais e grava só a página, sem novo embedding. Trechos que mudaram ficam com página 0
 * (desconhecida): a revisita normal reindexa o PDF e grava a página certa.
 */
import type { Site } from '@chatbot/comum/tipos';
import { dividirEmTrechos, paginasDosTrechos } from '@chatbot/comum/trechos';
import type { ClienteCloudflare } from './cloudflare.js';
import type { Resposta } from './http.js';

export interface DepsPaginas {
  cf: ClienteCloudflare;
  buscar: (url: string, dominiosPermitidos?: string[]) => Promise<Resposta>;
  extrairPdf: (b: Uint8Array) => Promise<{ texto: string; inicioPaginas?: number[] }>;
  esperar: (ms: number) => Promise<void>;
}

const PAUSA_MS = 1000;

/** Uma chamada só: UPDATE ... SET pagina = CASE ordem WHEN 0 THEN ? ... END. */
export async function gravarPaginas(cf: ClienteCloudflare, url: string, paginas: (number | null)[]): Promise<void> {
  if (!paginas.length) return;
  const casos = paginas.map(() => 'WHEN ? THEN ?').join(' ');
  const params = paginas.flatMap((p, i) => [i, p ?? 0]);
  await cf.d1(`UPDATE trechos SET pagina = CASE ordem ${casos} ELSE 0 END WHERE url = ?`, [...params, url]);
}

export async function completarPaginas(
  deps: DepsPaginas,
  sites: Site[],
  limite = 30,
): Promise<{ lidos: number; completados: number; mudaram: number; falhas: number }> {
  const r = { lidos: 0, completados: 0, mudaram: 0, falhas: 0 };
  const pendentes = await deps.cf.d1(
    `SELECT DISTINCT t.url, p.site FROM trechos t JOIN paginas p ON p.url = t.url
     WHERE p.tipo = 'pdf' AND p.status = 'ok' AND t.pagina IS NULL LIMIT ?`,
    [limite],
  );
  for (const { url, site: id } of pendentes) {
    const site = sites.find((s) => s.id === id);
    if (!site) continue;
    r.lidos++;
    try {
      await deps.esperar(PAUSA_MS);
      const resp = await deps.buscar(String(url), site.dominios_permitidos);
      if (resp.tipo !== 'pdf' || !resp.bytes) throw new Error('não veio PDF');
      const lido = await deps.extrairPdf(resp.bytes);
      const novos = dividirEmTrechos(lido.texto.trim());
      const antigos = (await deps.cf.d1('SELECT texto FROM trechos WHERE url = ? ORDER BY ordem', [url])).map((l) => String(l.texto));
      const iguais = novos.length === antigos.length && novos.every((t, i) => t === antigos[i]);
      if (iguais && lido.inicioPaginas?.length) {
        await gravarPaginas(deps.cf, String(url), paginasDosTrechos(lido.texto.trim(), novos, lido.inicioPaginas));
        r.completados++;
      } else {
        await gravarPaginas(deps.cf, String(url), antigos.map(() => 0));
        r.mudaram++;
      }
    } catch (e) {
      // Fica sem página: a próxima execução tenta de novo.
      r.falhas++;
      console.error(`Página do PDF não completada (${String(url)}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}
