-- Páginas citadas na resposta avaliada (JSON com as URLs; só URLs que existem em `paginas`).
ALTER TABLE avaliacoes ADD COLUMN fontes TEXT;
-- Quantas perguntas por dia e por desfecho, sem o texto delas (registro de perguntas segue desligado).
-- tipo: respondida | sem_base (não achou nas páginas) | recusa (fora do tema ou caso individual) | conversa (saudação etc.)
CREATE TABLE contagem_perguntas (dia TEXT NOT NULL, tipo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, tipo));
