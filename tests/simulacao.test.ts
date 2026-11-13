import { describe, expect, it } from "vitest";
import { analisar, montarFila, simular } from "@/core";
import { baseReal } from "./carregar";

const analise = analisar(baseReal());
const sim = simular(analise);
const perda = (k: string) => sim.estrategias.find((r) => r.estrategia === k)!.perdaEsperada;

describe("simulação na base real", () => {
  it("nenhuma estratégia perde menos que a perda inevitável", () => {
    for (const r of sim.estrategias) expect(r.perdaEsperada).toBeGreaterThanOrEqual(sim.perdaInevitavel - 1e-6);
  });

  it("a solução (custo de esperar) perde menos que a ordem de chegada e que a exposição", () => {
    expect(perda("custo_de_esperar")).toBeLessThan(perda("ordem_de_chegada"));
    expect(perda("custo_de_esperar")).toBeLessThan(perda("exposicao"));
    expect(sim.eficiencia).toBeGreaterThan(0.8);
  });

  it("a curva acumulada termina na perda total", () => {
    for (const r of sim.estrategias) expect(r.perdaAcumuladaPorDia.at(-1)).toBeCloseTo(r.perdaEsperada);
  });

  it("a fila do dia respeita a capacidade e é determinística", () => {
    const f1 = montarFila(analise.excecoes, 150);
    const f2 = montarFila([...analise.excecoes].reverse(), 150);
    expect(f1.filter((i) => i.dia === 0)).toHaveLength(150);
    expect(f1.map((i) => i.excecao.id)).toEqual(f2.map((i) => i.excecao.id));
  });
});
