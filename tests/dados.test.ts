import { describe, expect, it } from "vitest";
import { analisar, carregarBase, data, numero, parseExcecoes, parseTransportadoras } from "@/core";
import { baseReal } from "./carregar";

const CAB =
  "order_id,customer_id,marca,data_pedido,valor,sku,descricao_produto,qtd_itens,brinde_no_pedido,tipo_excecao,status,transportadora,uf,cidade,data_prometida,data_entrega,maquina,turno,cd,lote_produto,data_abertura_excecao";
const linha = (sobrescrever: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    order_id: "GB1", customer_id: "C1", marca: "Ápice", data_pedido: "2026-09-14", valor: "100.50", sku: "S", descricao_produto: "P",
    qtd_itens: "1", brinde_no_pedido: "False", tipo_excecao: "atraso_entrega", status: "aberta", transportadora: "T", uf: "SP",
    cidade: "São Paulo", data_prometida: "2026-09-18", data_entrega: "", maquina: "", turno: "manhã", cd: "CD1", lote_produto: "L1",
    data_abertura_excecao: "2026-09-19", ...sobrescrever,
  };
  return CAB.split(",").map((c) => base[c]).join(",");
};

describe("dados da empresa", () => {
  it("são aceitos inteiros: nenhuma linha descartada ou corrigida", () => {
    const base = baseReal();
    expect(base.descartadas).toEqual([]);
    expect(base.corrigidas).toEqual([]);
    const a = analisar(base);
    expect(a.qualidade.linhasRecebidas).toBe(2042);
    expect(a.qualidade.duplicatasRemovidas).toBe(42);
    expect(a.excecoes).toHaveLength(2000);
  });
});

describe("conversores tolerantes", () => {
  it.each([
    ["77.31", 77.31], ["77,31", 77.31], ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["R$ 77,31", 77.31], [" 12 ", 12], ["abc", NaN], ["", NaN],
  ])("numero(%s) = %f", (v, esperado) => expect(numero(v)).toEqual(esperado));

  it.each([
    ["2026-09-14", "2026-09-14"], ["2026-09-14 10:30:00", "2026-09-14"], ["14/09/2026", "2026-09-14"], ["4/9/2026", "2026-09-04"],
    ["2026-02-30", null], ["31/04/2026", null], ["ontem", null],
  ])("data(%s) = %s", (v, esperado) => expect(data(v)).toBe(esperado));
});

describe("leitura de arquivos de planilha", () => {
  it("aceita BOM, separador ; e vírgula decimal", () => {
    const csv = "﻿" + [CAB, linha({ valor: "100,50", data_pedido: "14/09/2026" })].map((l) => l.replaceAll(",", ";").replace("100;50", "100,50")).join("\n");
    const r = parseExcecoes(csv);
    expect(r.descartadas).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ order_id: "GB1", valor: 100.5, data_pedido: "2026-09-14" });
  });

  it("descarta só a linha com problema, com o motivo", () => {
    const csv = [CAB, linha(), linha({ order_id: "GB2", valor: "caro" }), linha({ order_id: "GB3", tipo_excecao: "Atraso Entrega" })].join("\n");
    const r = parseExcecoes(csv);
    expect(r.linhas.map((l) => l.order_id)).toEqual(["GB1", "GB3"]);
    expect(r.descartadas).toEqual([{ arquivo: "pedidos_excecao.csv", linha: 3, motivo: 'valor inválido "caro"' }]);
  });

  it("preenche padrões e corrige campos opcionais ilegíveis", () => {
    const csv = [CAB, linha({ status: "", data_abertura_excecao: "", qtd_itens: "", data_entrega: "sei lá" })].join("\n");
    const r = parseExcecoes(csv);
    expect(r.linhas[0]).toMatchObject({ status: "aberta", data_abertura_excecao: "2026-09-14", qtd_itens: 1, data_entrega: null });
    expect(r.corrigidas).toHaveLength(1);
  });

  it("recusa arquivo sem coluna obrigatória, sem linhas ou com a maioria inválida", () => {
    expect(() => parseExcecoes("order_id,valor\nGB1,10")).toThrow(/colunas ausentes/);
    expect(() => parseExcecoes(CAB)).toThrow(/sem linhas válidas/);
    expect(() => parseExcecoes([CAB, linha({ valor: "x" }), linha({ valor: "y" }), linha()].join("\n"))).toThrow(/2 de 3 linhas inválidas/);
  });

  it("valida colunas de transportadoras e clientes", () => {
    expect(() => parseTransportadoras("transportadora,uf_atendida\nT,SP")).toThrow(/colunas ausentes/);
    expect(() =>
      carregarBase({ excecoes: [CAB, linha()].join("\n"), clientes: "customer_id\nC1", transportadoras: "transportadora,uf_atendida,sla_contratado_dias_uteis,custo_medio_frete\nT,SP,3,12" }),
    ).toThrow(/clientes.csv: colunas ausentes/);
  });
});
