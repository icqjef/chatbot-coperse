-- Respostas oficiais escritas pela COPERSE no painel (checklist, item 2). vetor: embedding da pergunta (JSON).
-- Desativar não apaga: fica o histórico do que foi respondido.
CREATE TABLE respostas_oficiais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  fonte_url TEXT NOT NULL,
  processo TEXT,
  vetor TEXT NOT NULL,
  criada TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1
);
