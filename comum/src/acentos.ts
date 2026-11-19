/**
 * Nomes de arquivo publicados no Joomla perdem as letras acentuadas: "Convocação" vira "Convocao", "Indígenas" vira
 * "Indgenas". O título de PDF tirado do nome do arquivo fica sem as palavras da pergunta e a busca não o acha.
 * Aqui a palavra volta a ter acento quando é exatamente uma destas sem as letras acentuadas.
 */
const PALAVRAS = (
  'convocação convocações inscrição inscrições isenção isenções homologação homologações classificação classificações ' +
  'documentação solicitação solicitações heteroidentificação retificação retificações divulgação seleção seleções edição situação relação relações ' +
  'análise matrícula matrículas indígena indígenas transgênero transgêneros público pública públicos específico ' +
  'específica específicos graduação educação prática práticas câmpus lourenço antônio vitória distância complementação ' +
  'atualização prorrogação alteração alterações avaliação admissão comissão habilitação técnico técnicos médio gênero ' +
  'período previsão língua química física música ciências políticas mecânica elétrica automação computação informação ' +
  'informações comunicação administração contábeis econômicas oceânica história matemática estatística nutrição ' +
  'aplicação instruções orientações resolução reunião convocatória notícia condições declaração declarações ' +
  'autodeclaração autodeclarações eletrônico eletrônica proficiência próprio própria confirmação adesão'
).split(' ');

// Chave com menos de 4 letras ("São" -> "so") confundiria palavras comuns.
const MAPA = new Map(
  PALAVRAS.map((p) => [p.replace(/[^a-z]/g, ''), p] as const).filter(([chave, p]) => chave.length >= 4 && chave !== p),
);

export function comAcentos(texto: string): string {
  return texto.replace(/\p{L}+/gu, (t) => {
    const p = /^[A-Za-z]+$/.test(t) ? MAPA.get(t.toLowerCase()) : undefined;
    if (!p) return t;
    if (t.length > 1 && t === t.toUpperCase()) return p.toUpperCase();
    return t[0] === t[0]!.toUpperCase() ? p[0]!.toUpperCase() + p.slice(1) : p;
  });
}
