/**
 * Gera o plano do dia e os planos de correção com o agente, antes do build.
 * Assim quem abre o link vê o trabalho do agente na hora, sem gastar cota.
 *  - Sem GROQ_API_KEY: gera a versão por regras (o app funciona igual, sinalizando).
 *  - Com a chave: usa o agente; o que falhar cai nas regras, grupo a grupo.
 * O resultado vai para dados/gerado/plano.json (fora de public/, servido pela rota /api/dados).
 */
import "./env";
import { createHash } from "node:crypto";
import { carregarBase } from "../src/core";
import { agruparFilaDoDia, ClienteGroq, criarContexto, gerarBriefing, gerarPlanoDoDia, gerarPlanosCorrecao, modelosDoAmbiente } from "../src/agente";
import { gravarPlanoGerado, lerCsvsDoDisco, lerPlanoGerado, ARQUIVO_PLANO } from "../src/servidor/dados";

interface PlanoSalvo {
  hashDados: string;
  fonte: "agente" | "regras";
  briefing?: unknown;
}

async function main() {
  const chave = process.env.GROQ_API_KEY;
  const csvs = lerCsvsDoDisco();
  const ctx = criarContexto(carregarBase(csvs));
  // A impressão digital cobre os dados e a estrutura do plano (grupos e causas):
  // se o código mudar a forma de agrupar, o plano é refeito.
  const hashDados = createHash("sha256")
    .update(csvs.excecoes + csvs.clientes + csvs.transportadoras)
    .update(JSON.stringify(agruparFilaDoDia(ctx).map((g) => g.chave)))
    .update(JSON.stringify(ctx.causas.map((c) => c.id)))
    .digest("hex")
    .slice(0, 16);
  const atual = lerPlanoGerado<PlanoSalvo>();
  if (atual && !process.env.FORCAR_PLANO && atual.hashDados === hashDados && atual.briefing && (atual.fonte === "agente" || !chave)) {
    console.log(`[plano] já existe (${atual.fonte}), mantendo. Use FORCAR_PLANO=1 para regenerar.`);
    return;
  }
  const llm = chave ? new ClienteGroq({ chave, modelos: modelosDoAmbiente(process.env.GROQ_MODELOS) }) : null;
  console.log(`[plano] gerando com ${llm ? "o agente" : "regras (sem GROQ_API_KEY)"}...`);
  const inicio = Date.now();
  const aoProgredir = (m: string) => console.log("  ", m);
  const planoDoDia = await gerarPlanoDoDia(ctx, llm, { casosEspeciais: 5, aoProgredir });
  const planosCorrecao = await gerarPlanosCorrecao(ctx, llm);
  aoProgredir("Briefing do dia");
  const briefing = await gerarBriefing(ctx, llm, planoDoDia);
  const fonte = planoDoDia.grupos.some((g) => g.fonte === "agente") ? "agente" : "regras";
  gravarPlanoGerado({ hashDados, fonte, planoDoDia, planosCorrecao, briefing });
  console.log(`[plano] pronto em ${((Date.now() - inicio) / 1000).toFixed(0)}s: ${fonte}, ${planoDoDia.tokens} tokens, em ${ARQUIVO_PLANO}`);
}

main().catch((e) => {
  // O build nunca deve quebrar por causa da IA.
  console.error("[plano] falhou, o app usará regras:", e);
});
