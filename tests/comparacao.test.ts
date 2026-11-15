import { describe, expect, it } from "vitest";
import { carregarBase, inferirDataReferencia, projetarPorMes } from "@/core";
import { criarContexto, gerarPlanoDoDia } from "@/agente";
import { compararDias, excecoesParaCsv, simularAmanha } from "@/ui/comparacao";
import { lerCsvsDoDisco } from "@/servidor/dados";
import { reduzirRegistro } from "@/ui/registro";
import { montarDia, placarDoAgente } from "@/ui/tratativas";
import { baseReal } from "./carregar";

const csvs = lerCsvsDoDisco();
const base = baseReal();
const ctx = criarContexto(base);

describe("data de referência inferida da lista", () => {
  it("na lista do desafio dá a mesma data dos parâmetros, então nenhum número muda", () => {
    expect(inferirDataReferencia(base)).toBe("2026-09-30");
    expect(ctx.analise.parametros.dataReferencia).toBe("2026-09-30");
  });
});

describe("projeção mensal das causas", () => {
  it("leva o excesso da janela de 60 dias para 30 dias", () => {
    expect(projetarPorMes({ excesso: 20, custoDoExcesso: 1200 }, 60)).toEqual({ excecoes: 10, custo: 600 });
    expect(projetarPorMes({ excesso: -3, custoDoExcesso: 0 }, 60).excecoes).toBe(0);
  });
});

describe("lista de amanhã simulada e comparação", () => {
  const plano = gerarPlanoDoDia(ctx, null);

  it("gera um CSV que abre pelo mesmo leitor, sem linhas descartadas, datado do próximo dia útil", async () => {
    const p = await plano;
    const tratativas = p.tratativas.slice(0, 10);
    const registro = reduzirRegistro({}, { tipo: "decidir_lote", itens: tratativas.map((t) => ({ id: t.id, acao: t.acoes[0].acao })), decisao: "aprovada" });
    const { base: amanha, dataAmanha } = simularAmanha(base, ctx, registro);
    expect(dataAmanha).toBe("2026-10-01");
    const csv = excecoesParaCsv(amanha.excecoes);
    expect(csv.split("\n")[0]).toBe(csvs.excecoes.split("\n")[0].trim());
    const relida = carregarBase({ ...csvs, excecoes: csv });
    expect(relida.descartadas).toHaveLength(0);
    expect(relida.excecoes).toHaveLength(amanha.excecoes.length);
    const ctxAmanha = criarContexto(relida);
    expect(ctxAmanha.analise.parametros.dataReferencia).toBe("2026-10-01");

    const c = compararDias(ctx, ctxAmanha, registro);
    expect(c.dataAnterior).toBe("2026-09-30");
    expect(c.dataAtual).toBe("2026-10-01");
    expect(c.novas.total).toBe(36);
    expect(c.resolvidas.total + c.continuam.total).toBe(c.totalAnterior);
    expect(c.continuam.total + c.novas.total).toBe(c.totalAtual);
    // A fila priorizada se resolve muito mais do que o resto: é o que a comparação deve mostrar.
    expect(c.previstoRealizado.fracaoFila).toBeGreaterThan(0.6);
    expect(c.previstoRealizado.fracaoFora).toBeLessThan(0.15);
    expect(c.previstoRealizado.aprovadosOntem).toBe(10);
    expect(c.previstoRealizado.fracaoAprovados).toBeGreaterThanOrEqual(0.6);
    // O atraso de quem continua cresce um dia útil (em média, perto disso)
    expect(c.continuam.atrasoMedioAgora).toBeGreaterThan(c.continuam.atrasoMedioAntes);
    expect(c.novas.ligadasACausaConhecida).toBeGreaterThan(0);
    expect(c.causas.length).toBeGreaterThan(0);
    expect(c.causas.every((t) => ["piorou", "melhorou", "estavel", "sumiu", "nova"].includes(t.tendencia))).toBe(true);
  });

  it("é determinística: a mesma lista gera a mesma simulação", () => {
    const a = simularAmanha(base, ctx).base.excecoes.map((e) => e.order_id).join(",");
    const b = simularAmanha(base, ctx).base.excecoes.map((e) => e.order_id).join(",");
    expect(a).toBe(b);
  });
});

describe("placar de confiança no agente", () => {
  it("conta aprovações e recusas e aponta onde o agente erra", async () => {
    const plano = await gerarPlanoDoDia(ctx, null);
    const [a, b, c] = plano.tratativas.filter((t) => t.acoes.some((x) => x.status === "aguardando_aprovacao"));
    const acao = (t: typeof a) => t.acoes.find((x) => x.status === "aguardando_aprovacao")!.acao;
    let registro = reduzirRegistro({}, { tipo: "decidir", id: a.id, acao: acao(a), decisao: "aprovada" });
    registro = reduzirRegistro(registro, { tipo: "decidir", id: b.id, acao: acao(b), decisao: "aprovada" });
    registro = reduzirRegistro(registro, { tipo: "decidir", id: c.id, acao: acao(c), decisao: "recusada" });
    const placar = placarDoAgente(ctx, montarDia(ctx, plano, registro), registro, plano);
    expect(placar).toMatchObject({ decididas: 3, aprovadas: 2, recusadas: 1 });
    expect(placar.taxa).toBeCloseTo(2 / 3);
    expect(placar.recusasPorTipo[0]).toMatchObject({ acao: acao(c), recusadas: 1 });
    expect(placar.agente.decididas).toBe(0); // plano por regras: nenhuma recomendação é do agente
    expect(placarDoAgente(ctx, montarDia(ctx, plano, {}), {}, plano).taxa).toBeNull();
  });
});
