export const COR_PADRAO = '#1f5fbf';

export type Config = { api: string; cor: string };

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Razão de contraste WCAG entre a cor e o branco. */
export function contraste(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const lum = 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return 1.05 / (lum + 0.05);
}

export function lerConfig(script: HTMLScriptElement | null): Config {
  if (!script || !script.src) return { api: '', cor: COR_PADRAO };
  let api = '';
  try {
    api = new URL(script.src).origin;
  } catch {
    return { api: '', cor: COR_PADRAO };
  }
  const cor = script.getAttribute('data-cor') ?? '';
  const valida = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cor) && contraste(cor) >= 4.5;
  return { api, cor: valida ? cor : COR_PADRAO };
}
