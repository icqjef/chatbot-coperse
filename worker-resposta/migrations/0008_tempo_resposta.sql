-- Tempo até a resposta completa, por dia e faixa (só números, sem texto nem identificação).
-- faixa: ate1 | ate2 | ate3 | ate5 | ate10 | mais10 (segundos). Só perguntas dos sites da FURG, sem saudações.
CREATE TABLE tempo_resposta (dia TEXT NOT NULL, faixa TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, faixa));
