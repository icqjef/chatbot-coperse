import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';
import { DIAS_REGISTRO } from '../src/contagem';
import { DIAS_AVALIACAO } from '../src/avaliar';

const pedir = (metodo = 'GET') => worker.fetch(new Request('https://chatbot.example/privacidade', { method: metodo }), {} as Env);

describe('GET /privacidade', () => {
  it('página estática, sem script, com CSP e cabeçalhos de segurança', async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const html = await r.text();
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).not.toContain('<script');
  });
  it('identifica controladora, encarregada, canais de direitos, compartilhamento e IA', async () => {
    const html = await (await pedir()).text();
    for (const t of [
      'Universidade Federal do Rio Grande (FURG)',
      'https://lgpd.furg.br/encarregada',
      'https://lgpd.furg.br/contato',
      'https://falabr.cgu.gov.br/',
      'art. 18',
      'art. 23',
      'art. 33',
      'Cloudflare',
      'Google (API Gemini)',
      'inteligência artificial',
      'não usa cookies',
    ]) {
      expect(html, t).toContain(t);
    }
  });
  it('os prazos do aviso batem com os do código (mude os dois juntos)', async () => {
    const html = await (await pedir()).text();
    expect(DIAS_REGISTRO).toBe(90);
    expect(html).toContain('apagadas automaticamente depois de 90 dias');
    expect(DIAS_AVALIACAO).toBe(365);
    expect(html).toContain('Apagada depois de 1 ano');
  });
  it('outros métodos não servem a página', async () => {
    expect((await pedir('POST')).status).not.toBe(200);
  });
});
