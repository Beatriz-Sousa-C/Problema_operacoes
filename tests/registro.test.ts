import { describe, expect, it } from "vitest";
import { criarContexto, gerarPlanoDoDia, type ResultadoInvestigacao } from "@/agente";
import { avaliarAcoes, planejarMensagens } from "@/core";
import { reduzirRegistro, type Registro } from "@/ui/registro";
import { mensagensProntas, montarTratativas, pendenciasPorGrupo, situacoes } from "@/ui/tratativas";
import { baseReal } from "./carregar";

const ctx = criarContexto(baseReal());
const plano = await gerarPlanoDoDia(ctx, null);

describe("reduzirRegistro", () => {
  it("decidir_lote aprova só os itens indicados", () => {
    const r = reduzirRegistro({}, {
      tipo: "decidir_lote",
      decisao: "aprovada",
      itens: [{ id: "A", acao: "reenviar" }, { id: "B", acao: "reenviar" }],
    });
    expect(r.A.decisoes).toEqual({ reenviar: "aprovada" });
    expect(r.B.decisoes).toEqual({ reenviar: "aprovada" });
    expect(r.C).toBeUndefined();
  });

  it("marca mensagens como enviadas sem repetir", () => {
    let r: Registro = reduzirRegistro({}, { tipo: "mensagem_enviada", id: "A", indice: 1 });
    r = reduzirRegistro(r, { tipo: "mensagens_enviadas_lote", itens: [{ id: "A", indice: 1 }, { id: "A", indice: 0 }] });
    expect(r.A.enviadas).toEqual([1, 0]);
  });

  it("uma nova investigação zera as decisões e os envios anteriores", () => {
    let r = reduzirRegistro({}, { tipo: "decidir", id: "A", acao: "reenviar", decisao: "aprovada" });
    r = reduzirRegistro(r, { tipo: "mensagem_enviada", id: "A", indice: 0 });
    r = reduzirRegistro(r, { tipo: "investigacao", id: "A", resultado: { id: "A" } as ResultadoInvestigacao });
    expect(r.A.decisoes).toEqual({});
    expect(r.A.enviadas).toEqual([]);
  });
});

describe("pendenciasPorGrupo", () => {
  const tratativas = montarTratativas(ctx, plano, {});
  const pendencias = pendenciasPorGrupo(ctx, tratativas, {}, plano);

  it("junta as ações com dinheiro por grupo, sem perder nenhuma", () => {
    const soltas = [...tratativas.values()].flatMap((t) => t.acoes).filter((a) => a.status === "aguardando_aprovacao");
    expect(pendencias.reduce((s, p) => s + p.itens.length, 0)).toBe(soltas.length);
    expect(pendencias.length).toBeLessThan(soltas.length); // menos decisões do que ações
    for (const p of pendencias) expect(new Set(p.itens.map((i) => i.acao))).toEqual(new Set([p.acao]));
  });

  it("soma custo e valor em jogo de cada grupo", () => {
    for (const p of pendencias) {
      expect(p.custoTotal).toBeCloseTo(p.itens.reduce((s, i) => s + i.custo, 0));
      const ids = [...new Set(p.itens.map((i) => i.id))];
      expect(p.valorEmJogo).toBeCloseTo(ids.reduce((s, id) => s + ctx.porId.get(id)!.excecao.valorEmJogo, 0));
      expect(p.justificativa.length).toBeGreaterThan(0);
    }
  });

  it("aprovar um grupo tira o grupo da lista", () => {
    const [p] = pendencias;
    const r = reduzirRegistro({}, { tipo: "decidir_lote", decisao: "aprovada", itens: p.itens.map(({ id, acao }) => ({ id, acao })) });
    const depois = pendenciasPorGrupo(ctx, montarTratativas(ctx, plano, r), r, plano);
    expect(depois.some((x) => x.chave === p.chave)).toBe(false);
  });

  it("pedido investigado pelo agente vira um cartão próprio", () => {
    const [p] = pendencias;
    const alvo = p.itens[0].excecao;
    const avaliacoes = avaliarAcoes(["reenviar", "contatar_cliente"], alvo);
    const inv: ResultadoInvestigacao = {
      id: alvo.id,
      fonte: "agente",
      decisao: { acoes: ["reenviar", "contatar_cliente"], justificativa: "Cliente frequente; reenvio protege a recompra.", mensagem_cliente: "Vamos reenviar.", confianca: "alta" },
      avaliacoes,
      mensagens: planejarMensagens("Vamos reenviar.", avaliacoes, alvo),
      trilha: [],
      tokens: 0,
    };
    const r = reduzirRegistro({}, { tipo: "investigacao", id: alvo.id, resultado: inv });
    const depois = pendenciasPorGrupo(ctx, montarTratativas(ctx, plano, r), r, plano);
    const proprio = depois.find((x) => x.individual && x.itens[0].id === alvo.id);
    expect(proprio).toMatchObject({ fonte: "agente", justificativa: "Cliente frequente; reenvio protege a recompra." });
    expect(depois.find((x) => x.chave === p.chave)?.itens.some((i) => i.id === alvo.id) ?? false).toBe(false);
  });
});

describe("passos 2 e 3", () => {
  it("todo pedido do dia está em exatamente um passo, e as mensagens prontas batem com o passo 3", () => {
    const tratativas = montarTratativas(ctx, plano, {});
    const sit = situacoes(tratativas, {});
    expect(sit.size).toBe(150);
    const { blocos, canceladas } = mensagensProntas(ctx, tratativas, {}, plano);
    const pedidosComMensagem = new Set(blocos.flatMap((b) => b.mensagens.map((m) => m.id)));
    for (const [id, s] of sit) if (s === "enviar") expect(pedidosComMensagem.has(id)).toBe(true);
    expect(canceladas).toEqual([]);
  });
});
