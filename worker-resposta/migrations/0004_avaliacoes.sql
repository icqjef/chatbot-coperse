-- Avaliação anônima das respostas (👍/👎 no widget): dia, voto e começo da resposta do bot.
-- Sem a pergunta do candidato, sem IP, sem identificador do visitante.
CREATE TABLE avaliacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, dia TEXT NOT NULL, util INTEGER NOT NULL,
  resposta TEXT NOT NULL);
CREATE INDEX avaliacoes_dia ON avaliacoes(dia);
