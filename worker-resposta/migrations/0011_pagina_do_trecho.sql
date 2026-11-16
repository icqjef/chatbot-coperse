-- Página do PDF onde o trecho começa (checklist, item 7): o link da fonte abre o PDF nela. NULL em HTML.
ALTER TABLE trechos ADD COLUMN pagina INTEGER;
