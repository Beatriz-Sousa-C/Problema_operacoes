import { describe, expect, it } from "vitest";
import { problemasDaMensagem } from "@/core";
import { validarDecisao } from "@/agente/investigador";
import { validarPlanoGrupo } from "@/agente/planoDoDia";

describe("conferência da mensagem ao cliente (pelo código, não pelo prompt)", () => {
  it("aceita uma mensagem cordial sem promessas fora das ações", () => {
    expect(problemasDaMensagem("Olá! Vamos reenviar o item que faltou no seu pedido, sem custo.", ["reenviar", "contatar_cliente"])).toEqual([]);
  });

  it("recusa link, promessa de reembolso sem a ação, cancelamento sem a ação e jargão interno", () => {
    expect(problemasDaMensagem("Acompanhe em https://rastreio.exemplo.com", ["contatar_cliente"])).toEqual(["contém link ou endereço de site"]);
    expect(problemasDaMensagem("Faremos o reembolso em 5 dias.", ["contatar_cliente"])).toEqual(['promete reembolso sem a ação "reembolsar"']);
    expect(problemasDaMensagem("Faremos o reembolso em 5 dias.", ["reembolsar"])).toEqual([]);
    expect(problemasDaMensagem("Seu pedido será cancelado.", ["contatar_cliente"])).toEqual(['fala em cancelamento sem a ação "cancelar_pedido"']);
    expect(problemasDaMensagem("Como você é um cliente VIP, a probabilidade de atraso é baixa.", ["contatar_cliente"])).toHaveLength(1);
  });

  it("a decisão do investigador falha na validação quando a mensagem viola a política", () => {
    const base = { acoes: ["contatar_cliente"], justificativa: "Atraso dentro do contrato, só avisar.", confianca: "alta" };
    expect(validarDecisao({ ...base, mensagem_cliente: "Olá! Seu pedido chega em breve, estamos acompanhando." }).ok).toBe(true);
    const r = validarDecisao({ ...base, mensagem_cliente: "Olá! Vamos estornar o valor pago hoje mesmo." });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/reembolso/) });
  });

  it("o plano do grupo passa pela mesma conferência, com os marcadores do modelo", () => {
    const ok = validarPlanoGrupo({ acoes: ["acionar_transportadora", "contatar_cliente"], justificativa: "Rota Express no Nordeste, 4,7x acima.", modelo_mensagem_cliente: "Olá! Sobre o pedido {pedido} ({produto}): acionamos a transportadora." });
    expect(ok.ok).toBe(true);
    const ruim = validarPlanoGrupo({ acoes: ["contatar_cliente"], justificativa: "Grupo informativo.", modelo_mensagem_cliente: "Veja em www.gocase.com.br o status do pedido {pedido}." });
    expect(ruim).toMatchObject({ ok: false, erro: expect.stringMatching(/link/) });
  });
});
