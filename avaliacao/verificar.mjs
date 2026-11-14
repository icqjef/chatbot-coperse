export function normalizar(t) {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Forma puramente numérica casa só em fronteira de dígito, fora de datas e horas ("30" não casa em "19h30" nem "30/11").
export function contemFato(texto, forma) {
  const f = normalizar(forma);
  if (!/^[\d.,]+$/.test(f)) return texto.includes(f);
  const sem = f.replace(/[.,]/g, "");
  const semMilhar = texto.replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1");
  return [...new Set([f, sem])].some((c) =>
    [texto, semMilhar].some((t) =>
      new RegExp(`(?<![\\d/.,:h])${esc(c)}(?!\\d|[/:h]|[.,](?!00(?!\\d))\\d)`).test(t),
    ),
  );
}

export function verificar(p, r) {
  if (r.erro !== undefined || (r.status !== undefined && r.status !== 200)) {
    return { ok: false, motivos: [`HTTP ${r.status}: ${r.erro ?? ""}`.trim()] };
  }
  const motivos = [];
  const texto = normalizar(r.resposta);
  const fontes = r.fontes ?? [];

  for (const formas of p.fatos ?? []) {
    if (!formas.some((f) => contemFato(texto, f))) {
      motivos.push(`fato ausente: ${formas.join(" | ")}`);
    }
  }
  if (p.fonte && !fontes.some((f) => String(f.url).toLowerCase().includes(p.fonte.toLowerCase()))) {
    motivos.push(`fonte ausente: ${p.fonte}`);
  }
  if (p.sem_fontes && fontes.length > 0) {
    motivos.push("fontes presentes, mas esperava nenhuma");
  }
  for (const x of p.proibidos ?? []) {
    if (texto.includes(normalizar(x))) motivos.push(`texto proibido presente: ${x}`);
  }
  if (p.deve_dizer_edicao_passada) {
    const ano = texto.includes(normalizar(p.deve_dizer_edicao_passada));
    const recusa = fontes.length === 0 && texto.includes("coperse@furg.br");
    if (!ano && !recusa) {
      motivos.push(`não indicou edição passada (${p.deve_dizer_edicao_passada}) nem orientou a COPERSE`);
    }
  }
  return { ok: motivos.length === 0, motivos };
}
