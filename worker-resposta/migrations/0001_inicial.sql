CREATE TABLE paginas (url TEXT PRIMARY KEY, site TEXT NOT NULL, titulo TEXT, tipo TEXT NOT NULL DEFAULT 'html',
  processo TEXT NOT NULL DEFAULT 'geral', ano INTEGER, data_publicacao TEXT, data_vista TEXT NOT NULL,
  hash TEXT, status TEXT NOT NULL, falhas INTEGER NOT NULL DEFAULT 0, erro TEXT);
CREATE TABLE trechos (id TEXT PRIMARY KEY, url TEXT NOT NULL REFERENCES paginas(url), ordem INTEGER NOT NULL, texto TEXT NOT NULL);
CREATE INDEX trechos_url ON trechos(url);
CREATE VIRTUAL TABLE trechos_fts USING fts5(texto, trecho_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE fila (url TEXT PRIMARY KEY, site TEXT NOT NULL, profundidade INTEGER NOT NULL DEFAULT 0, origem TEXT,
  prioridade INTEGER NOT NULL DEFAULT 0, tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa TEXT);
CREATE TABLE execucoes (id INTEGER PRIMARY KEY AUTOINCREMENT, inicio TEXT NOT NULL, fim TEXT, paginas INTEGER DEFAULT 0, erros INTEGER DEFAULT 0);
