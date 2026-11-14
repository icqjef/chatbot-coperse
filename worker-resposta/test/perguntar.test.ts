import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { responderPergunta, chaveLimite, consultaDeBusca } from '../src/perguntar';
import { SEM_BASE } from '../src/regras';
import type { Trecho } from '../src/busca';
import { d1Falso, vectorizeFalso } from './fakes';

const base = 'https://chatbot.example';
const ORIGEM = 'https://coperse.furg.br';
const CPF = '123.456.789-09';
const INDISPONIVEL =
  'O assistente está indisponível no momento. Tente de novo em instantes ou escreva para coperse@furg.br.';

function trecho(n: number): Trecho {
  return {
    id: `t${n}`,
    url: `https://vestibular.furg.br/p${n}`,
    titulo: `Página ${n}`,
    site: 'vestibular',
    data: '2026-10-01T00:00:00Z',
    processo: 'vestibular',
    ano: 2027,
    texto: `Texto ${n}`,
    similaridade: 0.8,
  };
}

interface Ctx {
  env: Env;
  chamadas: { url: string; corpo: string }[];
  limites: string[];
}

/** Gemini falso: batchEmbedContents devolve vetor; generateContent devolve `texto` ou falha com `status`. */
function montar(opcoes: { score?: number; texto?: string; status?: number; permitir?: boolean; chave?: string; fim?: string }): Ctx {
  const chamadas: Ctx['chamadas'] = [];
  const limites: string[] = [];
  const score = opcoes.score ?? 0.9;
  const { indice } = vectorizeFalso([{ id: 't1', score, metadata: {} }]);
  const { db } = d1Falso({
    fts: [],
    linhas: [
      {
        id: 't1',
        texto: 'O prazo é 10/12.',
        url: 'https://vestibular.furg.br/edital',
        titulo: 'Edital',
        site: 'vestibular',
        data_publicacao: '2026-10-01T00:00:00Z',
        processo: 'vestibular',
        ano: 2027,
      },
    ],
  });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const corpo = String(init.body);
    chamadas.push({ url: String(url), corpo });
    if (String(url).includes('batchEmbedContents')) {
      const n = (JSON.parse(corpo).requests as unknown[]).length;
      return Response.json({ embeddings: Array.from({ length: n }, () => ({ values: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)) })) });
    }
    if (opcoes.status) return Response.json({ error: { message: 'cota' } }, { status: opcoes.status });
    return Response.json({ candidates: [{ content: { parts: [{ text: opcoes.texto ?? 'O prazo é 10/12 [1].' }] }, finishReason: opcoes.fim }] });
  });
  const env = {
    DB: db,
    VECTORIZE: indice,
    LIMITADOR: {
      async limit({ key }: { key: string }) {
        limites.push(key);
        return { success: opcoes.permitir ?? true };
      },
    },
    AMBIENTE: 'teste',
    PROVEDOR_LLM: 'gemini',
    MODELO_RESPOSTA: 'gemini-3.5-flash-lite',
    MODELO_EMBEDDING: 'gemini-embedding-001',
    DIMENSAO_EMBEDDING: '768',
    LIMIAR_SIMILARIDADE: '0.5',
    GEMINI_API_KEY: opcoes.chave ?? 'CHAVE-SECRETA-123',
    GITHUB_REPO: 'x/y',
    GITHUB_WORKFLOW: 'indexar.yml',
  } as Env;
  return { env, chamadas, limites };
}

function pedir(env: Env, corpo: unknown, cab: Record<string, string> = {}, bruto?: string) {
  return worker.fetch(
    new Request(`${base}/perguntar`, {
      method: 'POST',
      headers: { Origin: ORIGEM, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...cab },
      body: bruto ?? JSON.stringify(corpo),
    }),
    env,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /perguntar', () => {
  it('origem não permitida -> 403 só com Vary', async () => {
    const { env } = montar({});
    const r = await pedir(env, { pergunta: 'oi' }, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(r.headers.get('Vary')).toBe('Origin');
  });

  it('sem Origin -> 403', async () => {
    const { env } = montar({});
    const r = await worker.fetch(
      new Request(`${base}/perguntar`, { method: 'POST', body: JSON.stringify({ pergunta: 'oi' }) }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('entradas inválidas -> 400 com CORS', async () => {
    const { env } = montar({});
    const u = (t: string) => ({ papel: 'usuario', texto: t });
    const m = (t: string) => ({ papel: 'modelo', texto: t });
    const alternado = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? u('x') : m('x')));
    const casos: unknown[] = [
      { pergunta: '' },
      { pergunta: '   ' },
      { pergunta: 'a'.repeat(501) },
      { pergunta: 5 },
      { pergunta: 'oi', historico: alternado(10) },
      { pergunta: 'oi', historico: [u('a'.repeat(2001)), m('x')] },
      { pergunta: 'oi', historico: [m('x'), u('x')] },
      { pergunta: 'oi', historico: [u('x')] },
      { pergunta: 'oi', historico: [u('x'), u('y'), m('z'), m('w')] },
      { pergunta: 'oi', historico: [{ papel: 'sistema', texto: 'x' }] },
      { pergunta: 'oi', historico: 'x' },
    ];
    for (const c of casos) {
      const r = await pedir(env, c);
      expect(r.status).toBe(400);
      expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
      expect(r.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(typeof ((await r.json()) as { erro: string }).erro).toBe('string');
    }
    const r = await pedir(env, null, {}, '{nao json');
    expect(r.status).toBe(400);
  });

  it('limitador negando -> 429 com CORS e Vary', async () => {
    const { env, chamadas } = montar({ permitir: false });
    const r = await pedir(env, { pergunta: 'quando é a prova?' });
    expect(r.status).toBe(429);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(await r.json()).toEqual({ erro: 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.' });
    expect(chamadas).toHaveLength(0);
  });

  it('CPF não chega ao Gemini (embedding e geração)', async () => {
    const { env, chamadas } = montar({});
    const r = await pedir(env, {
      pergunta: `Meu CPF é ${CPF}, qual o prazo?`,
      historico: [
        { papel: 'usuario', texto: `CPF ${CPF}` },
        { papel: 'modelo', texto: 'ok' },
      ],
    });
    expect(r.status).toBe(200);
    expect(chamadas.length).toBeGreaterThanOrEqual(2);
    for (const c of chamadas) {
      expect(c.corpo).not.toContain(CPF);
      expect(c.corpo).not.toContain('12345678909');
    }
  });

  it('sem base: não chama o gerador e devolve SEM_BASE', async () => {
    const { env, chamadas } = montar({ score: 0.1 });
    const r = await pedir(env, { pergunta: 'receita de bolo' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resposta: SEM_BASE, fontes: [] });
    expect(chamadas.some((c) => c.url.includes('generateContent'))).toBe(false);
  });

  it('com base: resposta e fontes', async () => {
    const { env } = montar({});
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    const j = (await r.json()) as { resposta: string; fontes: { url: string }[] };
    expect(j.resposta).toContain('10/12');
    expect(j.fontes.map((f) => f.url)).toEqual(['https://vestibular.furg.br/edital']);
  });

  it('modelo sem citar -> SEM_BASE', async () => {
    const { env } = montar({ texto: 'O prazo é 10/12.' });
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(await r.json()).toEqual({ resposta: SEM_BASE, fontes: [] });
  });

  it('erro do provedor -> 503 amigável, sem chave, com CORS', async () => {
    const { env } = montar({ status: 429 });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(503);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ erro: INDISPONIVEL });
    expect(texto).not.toContain('CHAVE-SECRETA-123');
    const logado = JSON.stringify(erro.mock.calls);
    expect(logado).toContain('HTTP 429');
    expect(logado).not.toContain('CHAVE-SECRETA-123');
    expect(logado).not.toContain('qual o prazo');
    expect(logado).not.toContain('203.0.113.7');
  });

  it('sem GEMINI_API_KEY -> 503 sem chamar provedores', async () => {
    const { env, chamadas } = montar({ chave: '' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(503);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(chamadas).toHaveLength(0);
  });
});

describe('endurecimento', () => {
  const LIMITE = 48 * 1024;

  it('Content-Length declarado acima de 48 KiB -> 413 com CORS', async () => {
    const { env, chamadas } = montar({});
    const r = await pedir(env, { pergunta: 'oi' }, { 'Content-Length': String(LIMITE + 1) });
    expect(r.status).toBe(413);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(chamadas).toHaveLength(0);
  });

  it('corpo grande sem Content-Length (stream) -> 413 abortando a leitura', async () => {
    const { env } = montar({});
    let lidos = 0;
    const bloco = new Uint8Array(8 * 1024).fill(97);
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        lidos++;
        if (lidos > 100) c.close();
        else c.enqueue(bloco);
      },
    });
    const req = new Request(`${base}/perguntar`, {
      method: 'POST',
      headers: { Origin: ORIGEM, 'Content-Type': 'application/json' },
      body: corpo,
      duplex: 'half',
    } as RequestInit);
    const r = await worker.fetch(req, env);
    expect(r.status).toBe(413);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(lidos).toBeLessThan(20);
  });

  it('limitador que barra pelo limite diário -> 429 com a mensagem do dia', async () => {
    const { env } = montar({});
    env.LIMITADOR = { limit: async () => ({ success: false, motivo: 'dia' as const }) };
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ erro: 'Você atingiu o limite de perguntas de hoje. Tente amanhã ou escreva para coperse@furg.br.' });
  });

  it('limitador que lança -> 503 amigável com CORS, log sem IP', async () => {
    const { env } = montar({});
    env.LIMITADOR = {
      async limit() {
        throw new Error('binding indisponível');
      },
    };
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(503);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(await r.json()).toEqual({ erro: INDISPONIVEL });
    expect(JSON.stringify(erro.mock.calls)).not.toContain('203.0.113.7');
  });

  it('resposta bloqueada (RECITATION/SAFETY) -> 200 com SEM_BASE', async () => {
    for (const fim of ['RECITATION', 'SAFETY']) {
      const { env } = montar({ fim });
      const r = await pedir(env, { pergunta: 'qual o prazo?' });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ resposta: SEM_BASE, fontes: [] });
    }
  });

  it('corpo legítimo máximo com acentos (8x2000 + 500) cabe no limite', async () => {
    const { env } = montar({});
    const historico = Array.from({ length: 8 }, (_, i) => ({ papel: i % 2 ? 'modelo' : 'usuario', texto: 'ã'.repeat(2000) }));
    const r = await pedir(env, { pergunta: 'é'.repeat(500), historico });
    expect(r.status).not.toBe(413);
    expect(r.status).toBe(200);
  });

  it('outros métodos em /perguntar -> 405 com Allow e Vary', async () => {
    const { env } = montar({});
    const r = await worker.fetch(new Request(`${base}/perguntar`, { method: 'GET', headers: { Origin: ORIGEM } }), env);
    expect(r.status).toBe(405);
    expect(r.headers.get('Allow')).toBe('POST, OPTIONS');
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    const r2 = await worker.fetch(new Request(`${base}/perguntar`, { method: 'PUT' }), env);
    expect(r2.status).toBe(405);
    expect(r2.headers.get('Allow')).toBe('POST, OPTIONS');
    expect(r2.headers.get('Vary')).toBe('Origin');
    expect(r2.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('log do erro do provedor só traz a classe/HTTP, sem o texto do provedor', async () => {
    const { env } = montar({ status: 429 });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    await pedir(env, { pergunta: 'qual o prazo?' });
    const logado = JSON.stringify(erro.mock.calls);
    expect(logado).toContain('HTTP 429');
    expect(logado).not.toContain('cota');
  });
});

describe('chave do limite', () => {
  const t = new Date('2026-11-12T10:00:00Z');
  it('IPv6 do mesmo /64 divide a chave; /64 diferente não; IPv4 inalterado', async () => {
    const a = await chaveLimite('2001:db8:1:2:aaaa:bbbb:cccc:dddd', t);
    const b = await chaveLimite('2001:0db8:0001:0002::1', t);
    const c = await chaveLimite('2001:db8:1:3::1', t);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(await chaveLimite('203.0.113.7', t)).toBe(await chaveLimite('203.0.113.7', t));
    const bruto = new TextEncoder().encode('203.0.113.7' + '2026-11-12');
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bruto))].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(await chaveLimite('203.0.113.7', t)).toBe(h);
  });
  it('formas comprimidas expandem certo (::1, ::, 2001:db8::, :: no meio)', async () => {
    expect(await chaveLimite('::1', t)).toBe(await chaveLimite('0:0:0:0:0:0:0:1', t));
    expect(await chaveLimite('::', t)).toBe(await chaveLimite('0:0:0:0::', t));
    expect(await chaveLimite('2001:db8::5', t)).toBe(await chaveLimite('2001:db8:0:0:9:9:9:9', t));
    expect(await chaveLimite('2001:db8:0:0:1::', t)).toBe(await chaveLimite('2001:db8::7', t));
    expect(await chaveLimite('1:2:3:4::5', t)).toBe(await chaveLimite('1:2:3:4:0:0:0:0', t));
    expect(await chaveLimite('1::2:3:4', t)).not.toBe(await chaveLimite('1:2:3:4::', t));
  });
  it('IPv6 com escopo ou IPv4 embutido não quebra', async () => {
    expect(await chaveLimite('fe80::1%eth0', t)).toMatch(/^[0-9a-f]{64}$/);
    expect(await chaveLimite('::ffff:203.0.113.7', t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mesmo IP no mesmo dia -> mesma chave; não contém o IP', async () => {
    const a = await chaveLimite('203.0.113.7', new Date('2026-11-12T10:00:00Z'));
    const b = await chaveLimite('203.0.113.7', new Date('2026-11-12T23:59:00Z'));
    const c = await chaveLimite('203.0.113.7', new Date('2026-11-13T00:01:00Z'));
    const d = await chaveLimite('203.0.113.8', new Date('2026-11-12T10:00:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('203');
  });

  it('a rota usa a chave derivada de CF-Connecting-IP', async () => {
    const { env, limites } = montar({});
    await pedir(env, { pergunta: 'qual o prazo?' });
    expect(limites).toHaveLength(1);
    expect(limites[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(limites[0]).not.toContain('203.0.113.7');
  });
});

describe('responderPergunta', () => {
  it('monta histórico + pergunta e extrai fontes', async () => {
    const mensagens: unknown[] = [];
    const r = await responderPergunta(
      {
        pergunta: 'e a data?',
        historico: [
          { papel: 'usuario', texto: 'oi' },
          { papel: 'modelo', texto: 'olá' },
        ],
      },
      {
        buscar: async () => ({ trechos: [trecho(1)], melhorSimilaridade: 0.9 }),
        gerador: {
          async gerar(_s, m) {
            mensagens.push(...m);
            return 'Dia 10 [1]';
          },
        },
        agora: () => new Date('2026-11-12T12:00:00Z'),
      },
    );
    expect(mensagens).toHaveLength(3);
    expect(r.fontes).toHaveLength(1);
  });
});

describe('cota diária', () => {
  it('cota esgotada -> 429 sem chamar o Gemini', async () => {
    const { env, chamadas } = montar({});
    env.COTA = { consumir: async () => false };
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(429);
    expect(((await r.json()) as { erro: string }).erro).toContain('limite de perguntas de hoje');
    expect(chamadas).toHaveLength(0);
  });
  it('falha na cota -> 503 sem chamar o Gemini', async () => {
    const { env, chamadas } = montar({});
    env.COTA = { consumir: async () => { throw new Error('x'); } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(503);
    expect(chamadas).toHaveLength(0);
  });
  it('visitante barrado não gasta cota', async () => {
    const { env } = montar({ permitir: false });
    let consumiu = 0;
    env.COTA = { consumir: async () => (consumiu++, true) };
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(r.status).toBe(429);
    expect(consumiu).toBe(0);
  });
  it('em produção (LIMITES) o 7º pedido do mesmo visitante é barrado', async () => {
    const { Limites } = await import('../src/limites');
    const mapa = new Map<string, unknown>();
    const obj = new Limites({
      storage: { get: async (k: string) => mapa.get(k), put: async (k: string, v: unknown) => void mapa.set(k, v) },
    } as unknown as DurableObjectState);
    const { env } = montar({});
    env.LIMITES = {
      idFromName: (n: string) => n,
      get: () => ({ fetch: (url: string, init: RequestInit) => obj.fetch(new Request(url, init)) }),
    } as unknown as DurableObjectNamespace;
    const status: number[] = [];
    for (let i = 0; i < 7; i++) status.push((await pedir(env, { pergunta: 'qual o prazo?' })).status);
    expect(status).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(mapa.get('cota')).toMatchObject({ n: 6 });
  });
});

describe('recusas sem fontes', () => {
  it('encaminhamento curto, sem citação e com coperse@furg.br passa sem fontes', async () => {
    const texto = 'Não posso verificar a sua situação individual. Consulte o sistema de inscrição ou escreva para coperse@furg.br.';
    const { env } = montar({ texto });
    const r = await pedir(env, { pergunta: 'fui homologado?' });
    expect(await r.json()).toEqual({ resposta: texto, fontes: [] });
  });
  it('resposta longa sem citação, mesmo com o e-mail -> SEM_BASE', async () => {
    const { env } = montar({ texto: 'O prazo é 10/12. '.repeat(30) + 'coperse@furg.br' });
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(await r.json()).toEqual({ resposta: SEM_BASE, fontes: [] });
  });
  it('citação de número inexistente não vale como recusa -> SEM_BASE', async () => {
    const { env } = montar({ texto: 'O prazo é 10/12 [7]. Dúvidas: coperse@furg.br.' });
    const r = await pedir(env, { pergunta: 'qual o prazo?' });
    expect(await r.json()).toEqual({ resposta: SEM_BASE, fontes: [] });
  });
});

describe('consultaDeBusca', () => {
  const hist = [
    { papel: 'usuario' as const, texto: 'Quantas vagas de Direito tem no Vestibular 2027?' },
    { papel: 'modelo' as const, texto: '22 vagas [1]' },
  ];

  it('junta a última pergunta do usuário a um seguimento curto', () => {
    expect(consultaDeBusca('e de Medicina?', hist)).toBe(
      'Quantas vagas de Direito tem no Vestibular 2027?\ne de Medicina?',
    );
  });

  it('não junta pergunta nova que cita o processo', () => {
    const h = [{ papel: 'usuario' as const, texto: 'Qual a nota de corte do SiSU?' }];
    expect(consultaDeBusca('Quando é a prova do Vestibular?', h)).toBe('Quando é a prova do Vestibular?');
  });

  it('junta pergunta curta sem palavra de processo', () => {
    expect(consultaDeBusca('Quantas vagas tem?', hist)).toBe(
      'Quantas vagas de Direito tem no Vestibular 2027?\nQuantas vagas tem?',
    );
  });

  it('junta elo "e ..." mesmo citando o processo', () => {
    expect(consultaDeBusca('e no SiSU?', hist)).toBe('Quantas vagas de Direito tem no Vestibular 2027?\ne no SiSU?');
  });

  it('mantém a pergunta com 60 ou mais caracteres ou sem histórico', () => {
    const longa = 'x'.repeat(60);
    expect(consultaDeBusca(longa, hist)).toBe(longa);
    expect(consultaDeBusca('e de Medicina?', [])).toBe('e de Medicina?');
  });

  it('responderPergunta busca com a consulta combinada', async () => {
    const buscar = vi.fn(async () => ({ trechos: [] as Trecho[], melhorSimilaridade: 0 }));
    await responderPergunta(
      { pergunta: 'e de Medicina?', historico: hist },
      { buscar, gerador: { gerar: async () => '' }, agora: () => new Date() },
    );
    expect(buscar).toHaveBeenCalledWith('Quantas vagas de Direito tem no Vestibular 2027?\ne de Medicina?', 'vestibular');
  });

  it.each([
    ['Quando é a prova de redação do processo seletivo para estudantes transgêneros?', 'transgeneros'],
    ['Como funciona a seleção pelo SiSU na FURG?', 'sisu'],
    ['Quando começam as aulas?', null],
  ])('responderPergunta passa o processo inferido: %s', async (pergunta, esperado) => {
    const buscar = vi.fn(async () => ({ trechos: [] as Trecho[], melhorSimilaridade: 0 }));
    await responderPergunta({ pergunta, historico: [] }, { buscar, gerador: { gerar: async () => '' }, agora: () => new Date() });
    expect(buscar).toHaveBeenCalledWith(pergunta, esperado);
  });
});
