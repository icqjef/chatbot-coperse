// Monitor do assistente: confere /saude e, se pedido, faz uma pergunta real.
// Uso: node avaliacao/monitor.mjs [--pergunta] [--url URL] [--saida arquivo.md]
// Sai com código 1 e grava o motivo em --saida quando algo está errado.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = (opcao('--url') ?? 'https://chatbot-coperse.coperse-furg.workers.dev').replace(/\/$/, '');
const saida = opcao('--saida');
const comPergunta = args.includes('--pergunta');
const ORIGEM = 'https://chatbot-coperse.coperse-furg.workers.dev';

// A indexação está agendada a cada 2 h, mas o GitHub atrasa ou pula agendamentos (houve intervalos de 8 h
// em 15/11). Mais de 12 h sem terminar uma execução indica falha de verdade.
const MAX_HORAS_SEM_INDEXAR = 12;
const MIN_PAGINAS_OK = 500;
const TEMPO_MS = 35_000;
const PERGUNTA = 'Quando é a prova do Vestibular FURG?';

async function pedir(caminho, init = {}) {
  const inicio = Date.now();
  const r = await fetch(url + caminho, { ...init, signal: AbortSignal.timeout(TEMPO_MS) });
  const corpo = await r.json().catch(() => null);
  return { status: r.status, corpo, ms: Date.now() - inicio };
}

export async function conferir({ pergunta }) {
  const problemas = [];
  const notas = [];
  try {
    const s = await pedir('/saude');
    if (s.status !== 200 || !s.corpo?.ok) problemas.push(`/saude respondeu HTTP ${s.status}`);
    else {
      const { paginas_ok, ultima_indexacao: ult, fila } = s.corpo;
      notas.push(`páginas ok: ${paginas_ok}; fila: ${fila}; última indexação: ${ult?.fim ?? ult?.inicio ?? 'nenhuma'}`);
      if (paginas_ok < MIN_PAGINAS_OK) problemas.push(`só ${paginas_ok} páginas no índice (mínimo ${MIN_PAGINAS_OK})`);
      const fim = ult?.fim ? Date.parse(ult.fim) : NaN;
      const horas = (Date.now() - fim) / 3_600_000;
      if (!Number.isFinite(horas) || horas > MAX_HORAS_SEM_INDEXAR)
        problemas.push(`indexação sem terminar há mais de ${MAX_HORAS_SEM_INDEXAR} h (última: ${ult?.fim ?? 'nenhuma'})`);
    }
  } catch (e) {
    problemas.push(`/saude não respondeu: ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.message}`);
  }
  if (pergunta) {
    try {
      const p = await pedir('/perguntar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGEM },
        body: JSON.stringify({ pergunta: PERGUNTA, historico: [] }),
      });
      notas.push(`pergunta de teste: HTTP ${p.status} em ${(p.ms / 1000).toFixed(1)} s`);
      if (p.status === 429) notas.push('limite de perguntas atingido; não conta como falha');
      else if (p.status !== 200) problemas.push(`pergunta de teste: HTTP ${p.status} (${p.corpo?.erro ?? 'sem mensagem'})`);
      else if (!p.corpo?.fontes?.length) problemas.push('pergunta de teste respondeu sem fonte (o índice ou a busca pode ter falhado)');
    } catch (e) {
      problemas.push(`pergunta de teste não respondeu: ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.message}`);
    }
  }
  return { problemas, notas };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  const { problemas, notas } = await conferir({ pergunta: comPergunta });
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const texto = [
    `Verificação de ${quando} (Brasília).`,
    '',
    ...(problemas.length ? ['**Problemas:**', ...problemas.map((p) => `- ${p}`), ''] : ['Tudo certo.', '']),
    ...notas.map((n) => `- ${n}`),
  ].join('\n');
  console.log(texto);
  if (saida) writeFileSync(saida, texto + '\n');
  process.exit(problemas.length ? 1 : 0);
}
