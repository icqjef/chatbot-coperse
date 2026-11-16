-- Cache das respostas às perguntas repetidas (2 horas, mesmo dia). chave = SHA-256 do dia e do texto
-- normalizado da pergunta; a pergunta não é guardada. criado = milissegundos desde 1970.
CREATE TABLE respostas_cache (chave TEXT PRIMARY KEY, resultado TEXT NOT NULL, criado INTEGER NOT NULL);
CREATE INDEX respostas_cache_criado ON respostas_cache(criado);
