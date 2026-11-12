ALTER TABLE fila ADD COLUMN titulo TEXT;
ALTER TABLE fila ADD COLUMN processo TEXT;
ALTER TABLE fila ADD COLUMN ano INTEGER;
ALTER TABLE fila ADD COLUMN data TEXT;
CREATE INDEX fila_ordem ON fila(prioridade DESC, profundidade ASC);
