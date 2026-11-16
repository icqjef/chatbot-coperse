-- Cronograma como dados (checklist, item 1). Etapas e datas extraídas uma vez por documento e conferidas
-- contra o texto original. inicio/fim: AAAA-MM-DD (inicio NULL em "até dd/mm/aaaa").
CREATE TABLE cronograma (
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  etapa TEXT NOT NULL,
  quando TEXT NOT NULL,
  inicio TEXT,
  fim TEXT,
  PRIMARY KEY (url, ordem)
);
-- Documentos já lidos e o hash do conteúdo naquele momento: só documento novo ou alterado volta ao Gemini.
CREATE TABLE cronograma_fontes (url TEXT PRIMARY KEY, hash TEXT, linhas INTEGER NOT NULL, atualizado TEXT NOT NULL);
