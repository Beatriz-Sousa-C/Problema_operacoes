import { describe, expect, it } from "vitest";
import { analisar, probabilidadeCancelamento, removerDuplicatas, type BaseDados, type ExcecaoBruta } from "@/core";
import { baseReal } from "./carregar";

const excecao = (parcial: Partial<ExcecaoBruta>): ExcecaoBruta => ({
  order_id: "GB1", customer_id: "C1", marca: "Ápice", data_pedido: "2026-09-14", valor: 100,
  sku: "S", descricao_produto: "P", qtd_itens: 1, brinde_no_pedido: false, tipo_excecao: "atraso_entrega",
  status: "aberta", transportadora: "T", uf: "SP", cidade: "São Paulo", data_prometida: "2026-09-18",
  data_entrega: null, maquina: null, turno: "manhã", cd: "CD1", lote_produto: "L1", data_abertura_excecao: "2026-09-19",
  ...parcial,
});

const base = (e: ExcecaoBruta[], receita = 500, nPedidos = 5): BaseDados => ({
  excecoes: e,
  clientes: [{ customer_id: "C1", n_pedidos: nPedidos, receita_acumulada: receita, data_primeiro_pedido: "2025-01-01", n_contatos_atendimento: 0 }],
  transportadoras: [{ transportadora: "T", uf_atendida: "SP", sla_contratado_dias_uteis: 3, custo_medio_frete: 12 }],
});

describe("probabilidadeCancelamento", () => {
  it.each([[0, 0], [1, 0.04], [2, 0.04], [3, 0.1], [5, 0.1], [6, 0.22], [10, 0.22], [11, 0.4], [40, 0.4]])(
    "%i dias úteis → %f", (d, p) => expect(probabilidadeCancelamento(d)).toBe(p));
});

describe("removerDuplicatas", () => {
  it("mantém o registro com tratativa mais avançada", () => {
    const { unicas, duplicatas } = removerDuplicatas([excecao({ status: "aberta" }), excecao({ status: "em_analise" })]);
    expect(unicas).toHaveLength(1);
    expect(unicas[0].status).toBe("em_analise");
    expect(duplicatas[0]).toMatchObject({ statusMantido: "em_analise", statusDescartado: "aberta" });
  });
});

describe("analisar", () => {
  it("calcula atraso, prazo contratado e valor em jogo de um caso conhecido", () => {
    // pedido seg 14/09, SLA 3 → dia 1 = ter 15/09, prazo = sex 18/09. Hoje = qua 30/09.
    const [e] = analisar(base([excecao({})])).excecoes;
    expect(e.prazoContratado).toBe("2026-09-18");
    expect(e.atrasoAtual).toBe(8); // 21..25 (5) + 28..30 (3)
    expect(e.probabilidadeCancelamentoAtual).toBe(0.22);
    // recompra: 28% × 50% × ticket 100 × margem 76%
    expect(e.componenteRecompra).toBeCloseTo(0.28 * 0.5 * 100 * 0.76);
    expect(e.valorEmJogo).toBeCloseTo(100 + 10.64);
    expect(e.custoReenvio).toBeCloseTo(24 + 12);
  });

  it("pagamento pendente arrisca a margem, não um reembolso", () => {
    const [e] = analisar(base([excecao({ tipo_excecao: "pagamento_pendente" })])).excecoes;
    expect(e.componenteReembolso).toBeCloseTo(76);
  });

  it("atraso já entregue tem perda travada e custo de esperar zero", () => {
    const [e] = analisar(base([excecao({ data_entrega: "2026-09-22" })])).excecoes;
    expect(e.perdaTravada).toBe(true);
    expect(e.atrasoAtual).toBe(2);
    expect(e.custoDeEsperar).toBe(0);
  });

  it("cliente acima de R$ 1.500 usa recompra de 70%", () => {
    const [e] = analisar(base([excecao({})], 2000, 10)).excecoes;
    expect(e.clienteVip).toBe(true);
    expect(e.componenteRecompra).toBeCloseTo(0.7 * 0.5 * 200 * 0.76);
  });

  it("na base real: 42 duplicatas, 2.000 exceções e 14 dias de fila", () => {
    const a = analisar(baseReal());
    expect(a.qualidade.duplicatasRemovidas).toBe(42);
    expect(a.excecoes).toHaveLength(2000);
    expect(a.horizonteDias).toBe(14);
    expect(a.qualidade.clientesAusentes).toBe(0);
    expect(a.qualidade.transportadorasSemSla).toBe(0);
  });
});
