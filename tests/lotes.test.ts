import { describe, expect, it } from "vitest";
import { chaveAcao, chaveMensagem, jaExportados, loteDoItem, proximoNumero, reduzirLotes, type Lote } from "@/ui/lotes";

describe("lotes de exportação", () => {
  it("fechar numera em sequência, desfazer remove só o último, limpar zera", () => {
    let lotes: Lote[] = [];
    lotes = reduzirLotes(lotes, { tipo: "fechar", itens: [chaveAcao("A", "reenviar")], contagens: { reenvios: 1 }, em: "2026-09-30T12:00:00Z" });
    lotes = reduzirLotes(lotes, { tipo: "fechar", itens: [chaveMensagem("B", 0)], contagens: { mensagens: 1 }, em: "2026-09-30T13:00:00Z" });
    expect(lotes.map((l) => l.numero)).toEqual([1, 2]);
    expect(proximoNumero(lotes)).toBe(3);
    expect(jaExportados(lotes)).toEqual(new Set([chaveAcao("A", "reenviar"), chaveMensagem("B", 0)]));
    expect(loteDoItem(lotes, chaveMensagem("B", 0))).toBe(2);
    expect(loteDoItem(lotes, chaveMensagem("B", 1))).toBeNull();

    lotes = reduzirLotes(lotes, { tipo: "desfazer_ultimo" });
    expect(lotes.map((l) => l.numero)).toEqual([1]);
    expect(jaExportados(lotes).has(chaveMensagem("B", 0))).toBe(false);
    // Fechar de novo reaproveita o número 2: a numeração segue o que existe, não o que já existiu.
    expect(proximoNumero(lotes)).toBe(2);

    expect(reduzirLotes(lotes, { tipo: "limpar" })).toEqual([]);
  });

  it("carregar ignora lixo salvo no navegador", () => {
    const bons = reduzirLotes([], { tipo: "carregar", lotes: [{ numero: 1, em: "x", itens: [], contagens: {} }, { numero: "a" } as unknown as Lote, null as unknown as Lote] });
    expect(bons).toHaveLength(1);
    expect(reduzirLotes([], { tipo: "carregar", lotes: "nada" as unknown as Lote[] })).toEqual([]);
  });
});
