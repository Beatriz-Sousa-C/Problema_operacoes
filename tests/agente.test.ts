import { describe, expect, it } from "vitest";
import {
  agruparFilaDoDia,
  criarContexto,
  filaDoDia,
  gerarPlanoDoDia,
  gerarPlanosCorrecao,
  investigarExcecao,
  type ClienteLlm,
  type PedidoLlm,
  type RespostaLlm,
} from "@/agente";
import { avaliarAcao } from "@/core";
import { baseReal } from "./carregar";

const ctx = criarContexto(baseReal());

/** Modelo falso: devolve respostas roteirizadas e registra o que recebeu. */
class LlmRoteirizado implements ClienteLlm {
  recebidos: PedidoLlm[] = [];
  constructor(private roteiro: ((p: PedidoLlm) => RespostaLlm)[]) {}
  async completar(p: PedidoLlm) {
    this.recebidos.push(p);
    const passo = this.roteiro.shift();
    if (!passo) throw new Error("roteiro acabou");
    return passo(p);
  }
}

const chamada = (name: string, args: unknown, id = name): RespostaLlm => ({
  mensagem: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  modelo: "falso",
  tokens: 100,
});

const decisaoValida = {
  acoes: ["reenviar", "contatar_cliente"],
  justificativa: "Item faltante em pedido com brinde, separado no CD2 noite.",
  mensagem_cliente: "Olá! Vamos reenviar o item que faltou no seu pedido, sem custo.",
  confianca: "alta",
};

describe("investigarExcecao", () => {
  const alvo = filaDoDia(ctx).find((i) => i.excecao.tipo_excecao === "item_faltante")!.excecao;

  it("consulta ferramentas reais, registra a decisão e passa pela política", async () => {
    const llm = new LlmRoteirizado([
      () => chamada("consultar_pedido", { id: alvo.id }),
      () => chamada("verificar_causa_sistemica", { id: alvo.id }),
      () => chamada("registrar_decisao", decisaoValida),
    ]);
    const r = await investigarExcecao(ctx, llm, alvo.id);
    expect(r.fonte).toBe("agente");
    expect(r.trilha.map((t) => t.ferramenta)).toEqual(["consultar_pedido", "verificar_causa_sistemica", "registrar_decisao"]);
    // O resultado da ferramenta volta para o modelo como mensagem "tool"
    expect(llm.recebidos.at(-1)!.messages.filter((m) => m.role === "tool")).toHaveLength(2);
    expect(JSON.stringify(r.trilha[1].resultado)).toContain("faz_parte_de_causa_sistemica");
    expect(r.avaliacoes.map((a) => a.acao)).toEqual(["reenviar", "contatar_cliente"]);
  });

  it("devolve o erro de validação ao modelo e aceita a correção", async () => {
    const llm = new LlmRoteirizado([
      () => chamada("registrar_decisao", { ...decisaoValida, acoes: ["teletransportar"] }),
      () => chamada("registrar_decisao", decisaoValida, "2"),
    ]);
    const r = await investigarExcecao(ctx, llm, alvo.id);
    expect(r.fonte).toBe("agente");
    expect(r.trilha[0].resultado).toHaveProperty("erro");
  });

  it("cai na tratativa por regras quando o modelo falha", async () => {
    const llm = new LlmRoteirizado([]);
    const r = await investigarExcecao(ctx, llm, alvo.id);
    expect(r.fonte).toBe("regras");
    expect(r.aviso).toMatch(/indisponível/);
    expect(r.decisao.acoes).toContain("reenviar");
  });

  it("a política bloqueia ação proibida mesmo que o modelo a proponha", () => {
    const av = avaliarAcao("nova_producao", alvo); // nova produção não vale para item faltante
    expect(av.status).toBe("bloqueada");
  });
});

describe("regras de autonomia (decisão B)", () => {
  const todas = ctx.analise.excecoes;
  it("reembolso sempre precisa de aprovação", () => {
    expect(avaliarAcao("reembolsar", todas.find((e) => !e.clienteVip)!).status).toBe("aguardando_aprovacao");
  });
  it("cliente de alto valor sempre precisa de aprovação", () => {
    expect(avaliarAcao("contatar_cliente", todas.find((e) => e.clienteVip)!).status).toBe("aguardando_aprovacao");
  });
  it("reenvio barato é automático e caro precisa de aprovação", () => {
    const faltantes = todas.filter((e) => e.tipo_excecao === "item_faltante" && !e.clienteVip);
    expect(avaliarAcao("reenviar", faltantes.find((e) => e.custoReenvio <= 65)!).status).toBe("automatica");
    expect(avaliarAcao("reenviar", faltantes.find((e) => e.custoReenvio > 65)!).status).toBe("aguardando_aprovacao");
  });
});

describe("plano do dia", () => {
  it("sem IA, gera o plano por regras cobrindo os 150 pedidos do dia", async () => {
    const plano = await gerarPlanoDoDia(ctx, null);
    expect(plano.tratativas).toHaveLength(150);
    expect(plano.grupos.every((g) => g.fonte === "regras")).toBe(true);
    expect(plano.resumo.automaticas + plano.resumo.aguardandoAprovacao + plano.resumo.bloqueadas).toBe(
      plano.tratativas.reduce((s, t) => s + t.acoes.length, 0),
    );
  });

  it("com IA, faz uma chamada por grupo e preenche os marcadores da mensagem", async () => {
    const grupos = agruparFilaDoDia(ctx);
    const llm = new LlmRoteirizado(
      grupos.map(() => () =>
        chamada("registrar_plano_grupo", {
          acoes: ["contatar_cliente"],
          justificativa: "Grupo tratado com contato proativo.",
          modelo_mensagem_cliente: "Olá! Sobre o pedido {pedido} ({produto}): estamos cuidando.",
        }),
      ),
    );
    const plano = await gerarPlanoDoDia(ctx, llm, { casosEspeciais: 0 });
    expect(llm.recebidos).toHaveLength(grupos.length);
    expect(plano.grupos.every((g) => g.fonte === "agente")).toBe(true);
    expect(plano.tratativas[0].mensagem).not.toContain("{pedido}");
  });

  it("planos de correção incluem a auditoria da data prometida", async () => {
    const planos = await gerarPlanosCorrecao(ctx, null);
    expect(planos[0].causa).toBe("auditoria-prazo");
    expect(planos.length).toBe(ctx.causas.length + 1);
  });
});
