import { describe, expect, it } from "vitest";
import { ClienteContado, configDoAmbiente, ipDaRequisicao, Limitador } from "@/agente/limite";
import type { ClienteLlm } from "@/agente";

const relogio = (inicio = Date.UTC(2026, 9, 1, 15)) => {
  let t = inicio;
  return { agora: () => t, avancar: (ms: number) => (t += ms) };
};

describe("Limitador", () => {
  it("usa limites que cabem na cota gratuita por padrão e lê o ambiente", () => {
    expect(configDoAmbiente({})).toMatchObject({ porIp: { investigacao: 8, grupo: 40 }, diario: 400, tokensDiarios: 400_000 });
    expect(configDoAmbiente({ LIMITE_IA_POR_IP: "10", LIMITE_IA_DIARIO: "200", LIMITE_IA_TOKENS_DIARIO: "5000" })).toMatchObject({
      porIp: { investigacao: 10, grupo: 50 },
      diario: 200,
      tokensDiarios: 5000,
    });
    expect(configDoAmbiente({ LIMITE_IA_POR_IP: "abc" }).porIp.investigacao).toBe(8);
  });

  it("bloqueia a 9ª investigação do mesmo IP e libera depois de 10 minutos", () => {
    const r = relogio();
    const l = new Limitador(configDoAmbiente({}), r.agora);
    for (let i = 0; i < 8; i++) expect(l.permitir("1.1.1.1", "investigacao").ok).toBe(true);
    expect(l.permitir("1.1.1.1", "investigacao")).toMatchObject({ ok: false, motivo: expect.stringMatching(/alguns minutos/) });
    expect(l.permitir("2.2.2.2", "investigacao").ok).toBe(true); // outro IP não é afetado
    expect(l.permitir("1.1.1.1", "grupo").ok).toBe(true); // grupos têm contagem própria
    r.avancar(10 * 60_000);
    expect(l.permitir("1.1.1.1", "investigacao").ok).toBe(true);
  });

  it("respeita o teto diário de chamadas e zera no dia seguinte", () => {
    const r = relogio();
    const l = new Limitador({ ...configDoAmbiente({}), diario: 3 }, r.agora);
    expect([l.contarChamada(), l.contarChamada(), l.contarChamada(), l.contarChamada()]).toEqual([true, true, true, false]);
    expect(l.permitir("1.1.1.1", "investigacao")).toMatchObject({ ok: false, motivo: expect.stringMatching(/diário/) });
    r.avancar(24 * 3_600_000);
    expect(l.contarChamada()).toBe(true);
  });

  it("respeita o teto diário de tokens, que é o limite real da cota gratuita", () => {
    const r = relogio();
    const l = new Limitador({ ...configDoAmbiente({}), tokensDiarios: 10_000 }, r.agora);
    l.contarTokens(6_000);
    expect(l.permitir("1.1.1.1", "investigacao").ok).toBe(true);
    l.contarTokens(4_500);
    expect(l.tetoDiarioAtingido()).toBe(true);
    expect(l.permitir("1.1.1.1", "investigacao")).toMatchObject({ ok: false, motivo: expect.stringMatching(/diário/) });
    expect(l.contarChamada()).toBe(false);
    r.avancar(24 * 3_600_000);
    expect(l.usoHoje).toEqual({ chamadas: 0, tokens: 0 });
  });

  it("limpa IPs sem uso recente da memória", () => {
    const r = relogio();
    const l = new Limitador(configDoAmbiente({}), r.agora);
    for (let i = 0; i < 100; i++) l.permitir(`ip${i}`, "investigacao");
    r.avancar(11 * 60_000);
    l.permitir("novo", "investigacao");
    expect(l.ipsEmMemoria).toBe(1);
  });

  it("o cliente contado soma tokens e recusa chamadas acima do teto sem chamar o modelo", async () => {
    let chamadas = 0;
    const interno: ClienteLlm = { completar: async () => (chamadas++, { mensagem: { role: "assistant", content: "ok" }, modelo: "x", tokens: 700 }) };
    const limitador = new Limitador({ ...configDoAmbiente({}), diario: 1 });
    const c = new ClienteContado(interno, limitador);
    await c.completar({ messages: [] });
    expect(limitador.usoHoje).toEqual({ chamadas: 1, tokens: 700 });
    await expect(c.completar({ messages: [] })).rejects.toThrow(/limite diário/);
    expect(chamadas).toBe(1);
  });

  it("lê o IP dos cabeçalhos da plataforma", () => {
    expect(ipDaRequisicao(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(ipDaRequisicao(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(ipDaRequisicao(new Headers())).toBe("local");
  });
});
