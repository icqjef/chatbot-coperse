export function criarBuscarHtml(fetchFn: typeof fetch = fetch): (url: string) => Promise<string> {
  return async (url) => {
    const resp = await fetchFn(url, {
      headers: { 'User-Agent': 'ChatbotCOPERSE-Indexador/0.1' },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${url}`);
    return resp.text();
  };
}
