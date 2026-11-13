import { describe, expect, it } from "vitest";
import { analisar, auditarPrazos, detectarCausas, PARAMETROS, testeDuasProporcoes } from "@/core";
import { baseReal } from "./carregar";

const analise = analisar(baseReal());
const causas = detectarCausas(analise.excecoes, { custoContato: PARAMETROS.custoContato });
const achou = (grupo: string, tipo: string) =>
  causas.some((c) => c.tipo === tipo && (c.grupo.startsWith(grupo) || c.tambemVisivelEm.some((t) => t.includes(grupo))));

describe("testeDuasProporcoes", () => {
  it("p-valor ~0,5 para proporções iguais e pequeno para diferença grande", () => {
    expect(testeDuasProporcoes(10, 100, 10, 100)).toBeCloseTo(0.5, 2);
    expect(testeDuasProporcoes(50, 100, 10, 100)).toBeLessThan(1e-6);
  });
});

describe("detectarCausas na base real", () => {
  it.each([
    ["IMP-02", "falha_personalizacao"],
    ["CD2, turno da noite", "item_faltante"],
    ["Rota Express no Nordeste", "atraso_entrega"],
    ["Carga Norte", "avaria_transporte"],
    ["APC-1067", "vazamento_produto"],
    ["L2607-B", "vazamento_produto"],
  ])("encontra %s → %s", (g, t) => expect(achou(g, t)).toBe(true));

  it("não confunde exclusividade estrutural com causa (Gocase × personalização)", () => {
    expect(causas.some((c) => c.grupo === "Gocase" && c.tipo === "falha_personalizacao")).toBe(false);
  });
});

describe("auditarPrazos", () => {
  it("detecta que o sistema promete em dias corridos", () => {
    const a = auditarPrazos(analise.excecoes);
    expect(a.regraObservada).toMatch(/CORRIDOS/);
    expect(a.batemComCorridos).toBe(a.pedidos);
    expect(a.atrasosDentroDoContrato).toBeGreaterThan(100);
  });

  it("um erro de digitação não apaga o achado (basta 95% das datas)", () => {
    const comErro = analise.excecoes.map((e, i) => (i === 0 ? { ...e, data_prometida: "2026-01-01" } : e));
    const a = auditarPrazos(comErro);
    expect(a.batemComCorridos).toBe(a.pedidos - 1);
    expect(a.regraObservada).toMatch(/CORRIDOS/);
  });

  it("lista vazia não afirma regra nenhuma", () => {
    expect(auditarPrazos([]).regraObservada).toBeNull();
  });
});
