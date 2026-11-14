import { describe, it, expect } from "vitest";
import { verificar } from "../verificar.mjs";

const ok = (resposta, fontes = [{ url: "https://vestibular.furg.br/x" }]) => ({ resposta, fontes });

describe("verificar", () => {
  it("aceita data por forma alternativa", () => {
    const p = { fatos: [["22/11/2026", "22 de novembro"]], fonte: "vestibular.furg.br" };
    expect(verificar(p, ok("A prova será em 22 de novembro.")).ok).toBe(true);
  });
  it("ignora acento e maiúscula", () => {
    const p = { fatos: [["Papéis Avulsos"]], fonte: "" };
    expect(verificar(p, ok("Veja PAPEIS avulsos")).ok).toBe(true);
  });
  it("falha com fato ausente", () => {
    const p = { fatos: [["85"]], fonte: "" };
    const r = verificar(p, ok("sem valor"));
    expect(r.ok).toBe(false);
    expect(r.motivos.join()).toContain("fato");
  });
  it("falha quando a fonte falta", () => {
    const p = { fatos: [], fonte: "Cronograma_retificado" };
    const r = verificar(p, ok("x"));
    expect(r.ok).toBe(false);
    expect(r.motivos.join()).toContain("fonte");
  });
  it("sem_fontes com uma fonte falha", () => {
    const r = verificar({ fatos: [], fonte: "", sem_fontes: true }, ok("x"));
    expect(r.ok).toBe(false);
    expect(verificar({ fatos: [], fonte: "", sem_fontes: true }, ok("x", [])).ok).toBe(true);
  });
  it("proibido presente falha", () => {
    const r = verificar({ fatos: [], fonte: "", proibidos: ["10/10/2026"] }, ok("até 10/10/2026"));
    expect(r.ok).toBe(false);
  });
  it("resposta 429 falha com HTTP 429", () => {
    const r = verificar({ fatos: [], fonte: "" }, { erro: "limite", status: 429 });
    expect(r.ok).toBe(false);
    expect(r.motivos.join()).toContain("HTTP 429");
  });
  it("edição passada com 2022 passa; sem fontes com e-mail passa; senão falha", () => {
    const p = { fatos: [], fonte: "", deve_dizer_edicao_passada: "2022" };
    expect(verificar(p, ok("Isso foi no SiSU 2022")).ok).toBe(true);
    expect(verificar(p, ok("escreva para coperse@furg.br", [])).ok).toBe(true);
    expect(verificar(p, ok("o período é 10 a 20/03")).ok).toBe(false);
  });
  describe("fatos numéricos", () => {
    const casa = (forma, texto) => verificar({ fatos: [[forma]], fonte: "" }, ok(texto)).ok;
    it("não casa dentro de horas e datas", () => {
      expect(casa("30", "A prova começa às 19h30.")).toBe(false);
      expect(casa("30", "Prazo até 30/11.")).toBe(false);
      expect(casa("10", "Edital 10/2026.")).toBe(false);
    });
    it("casa em contexto limpo", () => {
      expect(casa("34", "São 34 vagas.")).toBe(true);
      expect(casa("85", "A taxa é R$ 85,00.")).toBe(true);
      expect(casa("1063", "Há 1.063 vagas.")).toBe(true);
      expect(casa("1.063", "Há 1063 vagas.")).toBe(true);
      expect(casa("85", "R$ 85,50")).toBe(false);
    });
  });
});

import { comDatasNumericas } from "../verificar.mjs";

describe("datas por extenso", () => {
  it("convertem para dd/mm", () => {
    expect(comDatasNumericas("de 13 de agosto a 07 de outubro de 2026")).toContain("13/08 a 07/10/2026");
    expect(comDatasNumericas("de 13 a 31 de agosto de 2026")).toContain("13/08");
    expect(comDatasNumericas("de 13 a 31 de agosto de 2026")).toContain("31/08");
    expect(comDatasNumericas("em 1º de marco de 2027")).toContain("01/03/2027");
  });
  it("verificar aceita data por extenso para fato dd/mm", () => {
    const p = { categoria: "datas-vagas-prazos", fatos: [["31/08"]], fonte: "" };
    expect(verificar(p, { resposta: "Foi de 13 a 31 de agosto de 2026.", fontes: [] }).ok).toBe(true);
  });
});

describe("armadilha de edição passada", () => {
  const p = { categoria: "armadilha", fatos: [], fonte: "", deve_dizer_edicao_passada: "2022", datas_antigas: ["10/03", "20/03"] };
  it("falha se repete as datas antigas sem o ano", () => {
    expect(verificar(p, { resposta: "A habilitação vai de 10/03 a 20/03 [1].", fontes: [{ url: "x" }] }).ok).toBe(false);
  });
  it("passa se não repete as datas antigas", () => {
    expect(verificar(p, { resposta: "No SiSU 2026, a habilitação segue a lista de espera [1].", fontes: [{ url: "x" }] }).ok).toBe(true);
  });
});
