/** Imprime os números principais da análise no terminal (útil para conferência). */
import "./env";
import { analisar, auditarPrazos, carregarBase, detectarCausas, simular, PARAMETROS } from "../src/core";
import { lerCsvsDoDisco } from "../src/servidor/dados";

const base = carregarBase(lerCsvsDoDisco());
const a = analisar(base);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
console.log("Qualidade:", { ...a.qualidade, duplicatas: a.qualidade.duplicatas.length });
console.log("Horizonte:", a.horizonteDias, "dias úteis", a.diasDeTratamento[0], "→", a.diasDeTratamento.at(-1));
const s = simular(a);
console.log("Perda inevitável:", brl(s.perdaInevitavel));
for (const r of s.estrategias) console.log(r.nome.padEnd(40), brl(r.perdaEsperada), r.cancelamentosEsperados.toFixed(0), "cancel.");
console.log("Recuperado:", brl(s.recuperadoVsAtual), "eficiência", (s.eficiencia * 100).toFixed(0) + "%");
console.log(auditarPrazos(a.excecoes));
for (const c of detectarCausas(a.excecoes, { custoContato: PARAMETROS.custoContato }))
  console.log(`${c.dimensao}: ${c.grupo} | ${c.tipo} | obs ${c.observado} esp ${c.esperado.toFixed(1)} lift ${c.lift.toFixed(1)} p ${c.pValor.toExponential(1)} custo ${brl(c.custoDoExcesso)} | ${c.tambemVisivelEm.join("; ")}`);
