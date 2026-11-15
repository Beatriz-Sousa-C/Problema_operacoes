import { describe, expect, it } from "vitest";
import { briefingPorRegras, criarContexto, dadosDoBriefing, gerarBriefing, gerarPlanoDoDia, type ClienteLlm, type PedidoLlm, type RespostaLlm } from "@/agente";
import { baseReal } from "./carregar";

const ctx = criarContexto(baseReal());
const plano = await gerarPlanoDoDia(ctx, null);

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
const chamada = (args: unknown): RespostaLlm => ({
  mensagem: { role: "assistant", content: null, tool_calls: [{ id: "b", type: "function", function: { name: "registrar_briefing", arguments: JSON.stringify(args) } }] },
  modelo: "falso",
  tokens: 300,
});
const bom = {
  titulo: "R$ 24 mil a menos em perdas mudando a ordem da fila",
  paragrafos: ["A fila tem 2.000 exceções e leva 14 dias úteis para zerar.", "Pela ordem de chegada a perda é de R$ 112 mil; pelo custo de esperar, R$ 88 mil."],
  prioridades: ["Aprovar as 48 ações com dinheiro. Operações.", "Corrigir a data prometida. Tecnologia.", "Calibrar a IMP-02. Manutenção."],
};

describe("briefing do dia", () => {
  it("os dados do briefing trazem só números já calculados, inclusive a projeção mensal das causas", () => {
    const d = dadosDoBriefing(ctx, plano);
    expect(d.fila.excecoes_abertas).toBe(ctx.analise.excecoes.length);
    expect(d.perdas_esperadas_ate_zerar_a_fila.recuperado_pela_solucao).toBeGreaterThan(20_000);
    expect(d.causas_de_processo[0].economia_por_mes_se_corrigida).toBeGreaterThan(0);
    expect(d.data_prometida).not.toBeNull();
  });

  it("o briefing por regras tem título com o número principal, 4 parágrafos e até 5 prioridades", () => {
    const b = briefingPorRegras(ctx, plano);
    expect(b.fonte).toBe("regras");
    expect(b.titulo).toMatch(/R\$ 24\.\d{3}/);
    expect(b.paragrafos).toHaveLength(4);
    expect(b.prioridades.length).toBeGreaterThanOrEqual(3);
    expect(b.prioridades.length).toBeLessThanOrEqual(5);
    expect(b.prioridades[1]).toMatch(/data prometida/);
  });

  it("com o modelo, aceita o briefing válido; com link, devolve o erro e aceita a correção", async () => {
    const llm = new LlmRoteirizado([() => chamada({ ...bom, titulo: "Veja em www.exemplo.com" }), () => chamada(bom)]);
    const b = await gerarBriefing(ctx, llm, plano);
    expect(b.fonte).toBe("agente");
    expect(b.titulo).toBe(bom.titulo);
    expect(llm.recebidos).toHaveLength(2);
    expect(JSON.stringify(llm.recebidos[1].messages.at(-1))).toMatch(/links/);
  });

  it("se o modelo falhar duas vezes ou estourar, vale o briefing por regras", async () => {
    const ruim = new LlmRoteirizado([() => chamada({ titulo: "x" }), () => chamada({ titulo: "y" })]);
    expect((await gerarBriefing(ctx, ruim, plano)).fonte).toBe("regras");
    expect((await gerarBriefing(ctx, new LlmRoteirizado([]), plano)).fonte).toBe("regras");
    expect((await gerarBriefing(ctx, null, plano)).fonte).toBe("regras");
  });
});
