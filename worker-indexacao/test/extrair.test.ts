import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extrairPagina } from '../src/extrair.js';

const html = readFileSync(new URL('./fixtures/coperse-artigo.html', import.meta.url), 'utf8');
const tituloFeed = 'Divulgação das informações sobre o local de realização da prova pela pessoa candidata';

describe('extrairPagina', () => {
  it('extrai o corpo do artigo real sem menu nem marcação', () => {
    const { texto, titulo } = extrairPagina(html, "https://coperse.furg.br/x");
    expect(texto.length).toBeGreaterThan(200);
    expect(texto).not.toContain('Portal de Vagas Ociosas'); // item do menu
    expect(texto).not.toContain('<');
    expect(texto).toContain('divulga as informações sobre o local');
    expect(titulo.replace(/\s+/g, ' ').trim()).toContain(tituloFeed);
  });
  it('junta células de tabela com " | "', () => {
    const r = extrairPagina('<div itemprop="articleBody"><table><tr><td>Curso</td><td>Vagas</td></tr></table></div>', 'https://x.furg.br/');
    expect(r.texto).toContain('Curso | Vagas');
  });
  it('separa parágrafos por linha em branco', () => {
    const r = extrairPagina('<div itemprop="articleBody"><p>Um</p><p>Dois</p></div>', 'https://x.furg.br/');
    expect(r.texto).toBe('Um\n\nDois');
  });
  it('HTML sem corpo útil gera texto vazio', () => {
    expect(extrairPagina('<html><body><nav>x</nav></body></html>', "https://x.furg.br/").texto).toBe('');
  });
});

const processo = readFileSync(new URL('./fixtures/coperse-processo.html', import.meta.url), 'utf8');
const vestibular = readFileSync(new URL('./fixtures/vestibular-inicio.html', import.meta.url), 'utf8');
const URL_PROCESSO = 'https://coperse.furg.br/processos-seletivos/quilombolas';

describe('extrairPagina: links', () => {
  it('coleta o link do edital com título, em URL absoluta', () => {
    const { links } = extrairPagina(processo, URL_PROCESSO);
    const edital = links.find((l) => l.url.endsWith('oficial_2026_-_Edital_PS_Quilombolasdocx.pdf'));
    expect(edital).toBeDefined();
    expect(edital!.url).toMatch(/^https:\/\/coperse\.furg\.br\//);
    expect(edital!.titulo).toContain('Edital PS Quilombolas 2026');
    expect(links.every((l) => !l.url.includes('#'))).toBe(true);
  });
  it('ignora mailto, tel, javascript, remove fragmento e deduplica', () => {
    const h = `<nav><a href="/a#x">Página A</a></nav><body><a href="mailto:a@b.c">m</a><a href="tel:123">t</a>
      <a href="javascript:void(0)">j</a><a href="/a">Página A de novo</a><a href="p/b">Página B</a></body>`;
    const { links } = extrairPagina(h, 'https://x.furg.br/dir/pag');
    expect(links.map((l) => l.url)).toEqual(['https://x.furg.br/a', 'https://x.furg.br/dir/p/b']);
  });
  it('título genérico usa o texto do bloco pai', () => {
    const { links } = extrairPagina('<ul><li>Resultado do recurso da inscrição: <a href="/a.pdf">clique aqui</a></li></ul>', 'https://x.furg.br/');
    expect(links[0]!.titulo).toBe('Resultado do recurso da inscrição: clique aqui');
  });
  it('título genérico sem texto no pai usa o nome do arquivo', () => {
    const { links } = extrairPagina('<a href="/x/Resultado_Final_2017.pdf">aqui</a>', 'https://x.furg.br/');
    expect(links[0]!.titulo).toBe('Resultado Final 2017');
  });
  it('vestibular: texto com vagas e links da API de documentos', () => {
    const r = extrairPagina(vestibular, 'https://vestibular.furg.br/');
    expect(r.texto).toContain('vagas');
    expect(r.links.some((l) => l.url.includes('/api/documentos/publico?arquivo='))).toBe(true);
  });
});

describe('extrairPagina: data', () => {
  it('lê <time datetime>', () => {
    const r = extrairPagina('<body><time datetime="2026-10-01T10:00:00-03:00">1 out</time><p>x</p></body>', 'https://x.furg.br/');
    expect(r.data).toBe('2026-10-01T13:00:00.000Z');
  });
  it('lê itemprop datePublished (content)', () => {
    const r = extrairPagina('<body><meta itemprop="datePublished" content="2026-03-02T08:00:00Z"><p>x</p></body>', 'https://x.furg.br/');
    expect(r.data).toBe('2026-03-02T08:00:00.000Z');
  });
  it('sem data devolve undefined', () => {
    expect(extrairPagina('<body><p>x</p></body>', 'https://x.furg.br/').data).toBeUndefined();
  });
});

describe('extrairPagina: ajustes de revisão', () => {
  const U = 'https://x.furg.br/';
  it('artigo Joomla curto não puxa a barra lateral', () => {
    const h = '<body><div class="sidebar"><p>Módulo lateral com bastante texto de outra coisa qualquer</p></div><div class="item-page"><p>Aviso curto.</p></div></body>';
    const r = extrairPagina(h, U);
    expect(r.texto).toBe('Aviso curto.');
  });
  it('"aqui" exige fronteira de palavra', () => {
    const { links } = extrairPagina('<a href="/a">Aquicultura</a><a href="/b">Vejamos o edital</a>', U);
    expect(links.map((l) => l.titulo)).toEqual(['Aquicultura', 'Vejamos o edital']);
  });
  it('script não entra no título vindo do bloco pai', () => {
    const { links } = extrairPagina('<li>Resultado final <script>var x=1;</script><a href="/a.pdf">aqui</a></li>', U);
    expect(links[0]!.titulo).toBe('Resultado final aqui');
  });
  it('duplicado mantém o melhor título', () => {
    const h = '<nav><a href="/e.pdf">aqui</a></nav><p><a href="/e.pdf">Edital de abertura 2026</a></p>';
    const { links } = extrairPagina(h, U);
    expect(links).toEqual([{ url: 'https://x.furg.br/e.pdf', titulo: 'Edital de abertura 2026' }]);
  });
  it('data do artigo vence a de outros módulos', () => {
    const h = '<body><time datetime="2020-01-01T00:00:00Z">x</time><div class="item-page"><time datetime="2026-05-05T00:00:00Z">y</time><p>t</p></div></body>';
    expect(extrairPagina(h, U).data).toBe('2026-05-05T00:00:00.000Z');
  });
});

describe('texto genérico "Baixar"', () => {
  it('troca "Baixar" pelo texto do bloco pai', () => {
    const html = '<body><main><ul><li>Resultado final da 1ª chamada <a href="/api/documentos/publico?arquivo=x.pdf">Baixar</a></li></ul></main></body>';
    const p = extrairPagina(html, 'https://vestibular.furg.br/');
    expect(p.links[0]!.titulo).toContain('Resultado final da 1ª chamada');
  });
});
