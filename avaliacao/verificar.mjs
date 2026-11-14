export function normalizar(t) {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function verificar(p, r) {
  if (r.erro !== undefined || (r.status !== undefined && r.status !== 200)) {
    return { ok: false, motivos: [`HTTP ${r.status}: ${r.erro ?? ""}`.trim()] };
  }
  const motivos = [];
  const texto = normalizar(r.resposta);
  const fontes = r.fontes ?? [];

  for (const formas of p.fatos ?? []) {
    if (!formas.some((f) => texto.includes(normalizar(f)))) {
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
