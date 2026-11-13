/**
 * Gera o plano do dia e os planos de correção com o agente, antes do build.
 * Assim quem abre o link vê o trabalho do agente na hora, sem gastar cota.
 *  - Sem GROQ_API_KEY: gera a versão por regras (o app funciona igual, sinalizando).
 *  - Com a chave: usa o agente; o que falhar cai nas regras, grupo a grupo.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { carregarBase } from "../src/core";
import { agruparFilaDoDia, ClienteGroq, criarContexto, gerarPlanoDoDia, gerarPlanosCorrecao, modelosDoAmbiente } from "../src/agente";

const raiz = join(__dirname, "..");
const ler = (f: string) => readFileSync(join(raiz, "public", "dados", f), "utf8");
const csvs = { excecoes: ler("pedidos_excecao.csv"), clientes: ler("clientes.csv"), transportadoras: ler("transportadoras.csv") };

const destinoDir = join(raiz, "public", "agente");
const destino = join(destinoDir, "plano.json");

async function main() {
  const chave = process.env.GROQ_API_KEY;
  const ctx = criarContexto(carregarBase(csvs));
  // A impressão digital cobre os dados e a estrutura do plano (grupos e causas):
  // se o código mudar a forma de agrupar, o plano é refeito.
  const hashDados = createHash("sha256")
    .update(csvs.excecoes + csvs.clientes + csvs.transportadoras)
    .update(JSON.stringify(agruparFilaDoDia(ctx).map((g) => g.chave)))
    .update(JSON.stringify(ctx.causas.map((c) => c.id)))
    .digest("hex")
    .slice(0, 16);
  if (existsSync(destino) && !process.env.FORCAR_PLANO) {
    const atual = JSON.parse(readFileSync(destino, "utf8"));
    if (atual.hashDados === hashDados && (atual.fonte === "agente" || !chave)) {
      console.log(`[plano] já existe (${atual.fonte}), mantendo. Use FORCAR_PLANO=1 para regenerar.`);
      return;
    }
  }
  const llm = chave ? new ClienteGroq({ chave, modelos: modelosDoAmbiente(process.env.GROQ_MODELOS) }) : null;
  console.log(`[plano] gerando com ${llm ? "o agente" : "regras (sem GROQ_API_KEY)"}...`);
  const inicio = Date.now();
  const planoDoDia = await gerarPlanoDoDia(ctx, llm, { casosEspeciais: 5, aoProgredir: (m) => console.log("  ", m) });
  const planosCorrecao = await gerarPlanosCorrecao(ctx, llm);
  const fonte = planoDoDia.grupos.some((g) => g.fonte === "agente") ? "agente" : "regras";
  mkdirSync(destinoDir, { recursive: true });
  writeFileSync(destino, JSON.stringify({ hashDados, fonte, planoDoDia, planosCorrecao }, null, 1));
  console.log(`[plano] pronto em ${((Date.now() - inicio) / 1000).toFixed(0)}s: ${fonte}, ${planoDoDia.tokens} tokens`);
}

main().catch((e) => {
  // O build nunca deve quebrar por causa da IA.
  console.error("[plano] falhou, o app usará regras:", e);
});
