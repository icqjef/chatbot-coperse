export function cabecalhosCors(origem: string | null, permitidas: string[]): Record<string, string> {
  if (!origem || !permitidas.includes(origem)) return {};
  return {
    'Access-Control-Allow-Origin': origem,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
