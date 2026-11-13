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
import { avaliarAcao, avaliarAcoes, planejarMensagens } from "@/core";
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
    expect(r.mensagens.length).toBeGreaterThan(0);
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

describe("regras de autonomia", () => {
  const todas = ctx.analise.excecoes;
  const vip = (tipo: string) => todas.find((e) => e.clienteVip && e.tipo_excecao === tipo)!;
  const comum = (tipo: string, f: (c: number) => boolean = () => true) =>
    todas.find((e) => !e.clienteVip && e.tipo_excecao === tipo && f(e.custoReenvio))!;

  it("reembolso sempre precisa de aprovação", () => {
    expect(avaliarAcao("reembolsar", comum("atraso_entrega")).status).toBe("aguardando_aprovacao");
  });
  it("comunicação sem custo é automática mesmo para cliente de alto valor", () => {
    expect(avaliarAcao("contatar_cliente", vip("atraso_entrega")).status).toBe("automatica");
    expect(avaliarAcao("acionar_transportadora", vip("atraso_entrega")).status).toBe("automatica");
  });
  it("ação com custo para cliente de alto valor precisa de aprovação", () => {
    expect(avaliarAcao("reenviar", vip("item_faltante")).status).toBe("aguardando_aprovacao");
  });
  it("reenvio barato é automático e caro precisa de aprovação", () => {
    expect(avaliarAcao("reenviar", comum("item_faltante", (c) => c <= 65)).status).toBe("automatica");
    expect(avaliarAcao("reenviar", comum("item_faltante", (c) => c > 65)).status).toBe("aguardando_aprovacao");
  });
  it("avaria pede foto antes do reenvio, e o pedido de foto é incluído mesmo se o modelo esquecer", () => {
    const e = comum("avaria_transporte", (c) => c <= 65);
    const av = avaliarAcoes(["reenviar"], e);
    expect(av.map((a) => a.acao)).toEqual(["solicitar_foto", "reenviar"]);
    expect(av[0].status).toBe("automatica");
    expect(av[1]).toMatchObject({ status: "aguarda_foto", statusAposFoto: "automatica" });
  });
});

describe("mensagens ao cliente", () => {
  const todas = ctx.analise.excecoes;
  it("mensagem informativa sai na hora, mesmo para cliente de alto valor", () => {
    const e = todas.find((x) => x.clienteVip && x.tipo_excecao === "atraso_entrega" && !x.perdaTravada)!;
    const [m] = planejarMensagens("Acionamos a transportadora.", avaliarAcoes(["acionar_transportadora", "contatar_cliente"], e), e);
    expect(m.status).toBe("automatica");
  });
  it("mensagem que anuncia reenvio pendente espera a aprovação", () => {
    const e = todas.find((x) => x.clienteVip && x.tipo_excecao === "item_faltante")!;
    const ms = planejarMensagens("Vamos reenviar o item.", avaliarAcoes(["reenviar", "contatar_cliente"], e), e);
    expect(ms).toHaveLength(1);
    expect(ms[0].status).toBe("aguardando_aprovacao");
  });
  it("com foto exigida, sai o pedido de foto (texto fixo) e a solução fica para depois", () => {
    const e = todas.find((x) => x.tipo_excecao === "vazamento_produto")!;
    const ms = planejarMensagens("Vamos reenviar de outro lote.", avaliarAcoes(["reenviar"], e), e);
    expect(ms.map((m) => m.status)).toEqual(["automatica", "aguarda_foto"]);
    expect(ms[0].texto).toContain("foto");
    expect(ms[0].texto).not.toContain("reenviar");
  });
});

describe("plano do dia", () => {
  it("sem IA, gera o plano por regras cobrindo os 150 pedidos do dia", async () => {
    const plano = await gerarPlanoDoDia(ctx, null);
    expect(plano.tratativas).toHaveLength(150);
    expect(plano.grupos.every((g) => g.fonte === "regras")).toBe(true);
    expect(plano.resumo.automaticas + plano.resumo.aguardandoFoto + plano.resumo.aguardandoAprovacao + plano.resumo.bloqueadas).toBe(
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
    expect(plano.tratativas[0].mensagens[0].texto).not.toContain("{pedido}");
  });

  it("planos de correção incluem a auditoria da data prometida", async () => {
    const planos = await gerarPlanosCorrecao(ctx, null);
    expect(planos[0].causa).toBe("auditoria-prazo");
    expect(planos.length).toBe(ctx.causas.length + 1);
  });
});
