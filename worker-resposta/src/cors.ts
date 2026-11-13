export function origemPermitida(origem: string | null, permitidas: string[]): origem is string {
  return !!origem && permitidas.includes(origem);
}

/** `Vary: Origin` sempre; os demais cabeçalhos só para origem permitida. */
export function cabecalhosCors(origem: string | null, permitidas: string[]): Record<string, string> {
  if (!origemPermitida(origem, permitidas)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origem,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
