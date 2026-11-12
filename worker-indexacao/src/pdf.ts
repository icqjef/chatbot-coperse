import { getDocumentProxy, extractText } from 'unpdf';

export async function extrairPdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }> {
  try {
    const doc = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    const texto = text
      .split('\n')
      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { texto, paginas: totalPages };
  } catch (e) {
    throw new Error(`PDF inválido: ${(e as Error).message}`);
  }
}
