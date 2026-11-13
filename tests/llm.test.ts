import { afterEach, describe, expect, it, vi } from "vitest";
import { ClienteGroq } from "@/agente";

afterEach(() => vi.unstubAllGlobals());

describe("ClienteGroq", () => {
  it("resposta que não é JSON passa para o próximo modelo em vez de abortar", async () => {
    const modelos: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const modelo = JSON.parse(String(init.body)).model;
      modelos.push(modelo);
      if (modelo === "a") return new Response("<html>gateway</html>", { status: 200 });
      return new Response(JSON.stringify({ model: "b", choices: [{ message: { content: "ok" } }], usage: { total_tokens: 5 } }), { status: 200 });
    });
    const c = new ClienteGroq({ chave: "k", modelos: ["a", "b"], tentativasPorModelo: 1 });
    const r = await c.completar({ messages: [{ role: "user", content: "oi" }] });
    expect(r.modelo).toBe("b");
    expect(modelos).toEqual(["a", "b"]);
  });

  it("desiste quando a espera do limite passaria do prazo da rota", async () => {
    vi.stubGlobal("fetch", async () => new Response("rate limited, try again in 10s", { status: 429 }));
    const c = new ClienteGroq({ chave: "k", modelos: ["a"], prazoFinal: Date.now() + 2000 });
    await expect(c.completar({ messages: [{ role: "user", content: "oi" }] })).rejects.toThrow(/Tempo esgotado/);
  });
});
