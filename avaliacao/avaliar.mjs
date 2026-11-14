import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verificar } from "./verificar.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = (opcao("--url") ?? "https://chatbot-coperse.coperse-furg.workers.dev").replace(/\/$/, "");
const so = opcao("--so")?.split(",");
const ESPERA_MS = 11000;

const conjunto = JSON.parse(readFileSync(join(aqui, "perguntas.json"), "utf8"));
const perguntas = conjunto.perguntas.filter((p) => !so || so.includes(p.id));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function perguntar(p) {
  try {
    const res = await fetch(`${url}/perguntar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://chatbot-coperse.coperse-furg.workers.dev",
      },
      body: JSON.stringify({ pergunta: p.pergunta, historico: [] }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (res.status !== 200) return { erro: corpo.erro ?? "", status: res.status };
    return { resposta: corpo.resposta ?? "", fontes: corpo.fontes ?? [] };
  } catch (e) {
    return { erro: String(e), status: 0 };
  }
}

const resultados = [];
for (let i = 0; i < perguntas.length; i++) {
  if (i > 0) await dormir(ESPERA_MS);
  const p = perguntas[i];
  const r = await perguntar(p);
  const v = verificar(p, r);
  resultados.push({ id: p.id, categoria: p.categoria, ...v, retorno: r });
  console.log(`${v.ok ? "OK    " : "FALHOU"} ${p.id}${v.ok ? "" : " - " + v.motivos.join("; ")}`);
}

const porCategoria = {};
for (const r of resultados) {
  const c = (porCategoria[r.categoria] ??= { ok: 0, total: 0 });
  c.total++;
  if (r.ok) c.ok++;
}
console.log("\nPlacar por categoria:");
for (const [c, { ok, total }] of Object.entries(porCategoria)) console.log(`  ${c}: ${ok}/${total}`);

const pasta = join(aqui, "resultados");
mkdirSync(pasta, { recursive: true });
const arquivo = join(pasta, `${new Date().toISOString().replace(/:/g, "-")}.json`);
writeFileSync(arquivo, JSON.stringify({ url, porCategoria, resultados }, null, 2));
console.log(`\nResultados gravados em ${arquivo}`);

let codigo = 0;
const g = porCategoria["datas-vagas-prazos"];
if (g && g.ok < g.total) {
  console.error("PORTÃO: perguntas de datas, vagas e prazos falharam. Não publicar.");
  codigo = 1;
}
if (conjunto.conferido_por_jeferson === false) {
  console.error("AVISO: as perguntas ainda não foram conferidas pelo Jeferson.");
  codigo = 1;
}
process.exit(codigo);
