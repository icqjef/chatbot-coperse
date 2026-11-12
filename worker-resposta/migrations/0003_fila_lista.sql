-- 1 = linkado por uma página classificada como lista: se for PDF, é tratado como lista (nunca baixado).
ALTER TABLE fila ADD COLUMN lista INTEGER NOT NULL DEFAULT 0;
