-- Texto das perguntas vindas dos sites da FURG (CPF, e-mail e telefone mascarados), sem IP nem
-- identificador. O Worker apaga as linhas com mais de 90 dias a cada gravação.
-- tipo: respondida | sem_base | recusa | limite (saudações e conversa não são gravadas)
CREATE TABLE perguntas_registro (id INTEGER PRIMARY KEY AUTOINCREMENT, dia TEXT NOT NULL, tipo TEXT NOT NULL, pergunta TEXT NOT NULL);
CREATE INDEX perguntas_registro_dia ON perguntas_registro(dia);
