import { describe, expect, it } from "vitest";
import { criarContexto } from "@/agente";
import { avaliarAcoes, estadoAcao, estadoMensagem, planejarMensagens, podeDecidir, situacaoPedido, type RegistroTratativa } from "@/core";
import { baseReal } from "./carregar";

const ctx = criarContexto(baseReal());
const todas = ctx.analise.excecoes;
const reg = (r: Partial<RegistroTratativa> = {}): RegistroTratativa => ({ decisoes: {}, fotoRecebida: false, ...r });

describe("fluxo da foto e da aprovação", () => {
  const e = todas.find((x) => x.tipo_excecao === "avaria_transporte")!;
  const acoes = avaliarAcoes(["reenviar", "acionar_transportadora"], e);
  const [pedidoFoto, solucao] = planejarMensagens("Vamos reenviar o produto.", acoes, e);
  const reenvio = acoes.find((a) => a.acao === "reenviar")!;

  it("o pedido de foto sai na hora; a solução espera a foto", () => {
    expect(estadoMensagem(pedidoFoto, acoes, reg())).toBe("enviar_agora");
    expect(estadoMensagem(solucao, acoes, reg())).toBe("espera_foto");
    expect(estadoAcao(reenvio, reg())).toBe("aguarda_foto");
    expect(podeDecidir(reenvio, reg())).toBe(false);
  });

  it("com a foto, o reenvio vai para aprovação e a mensagem continua esperando", () => {
    const r = reg({ fotoRecebida: true });
    expect(estadoAcao(reenvio, r)).toBe("aguarda_aprovacao");
    expect(podeDecidir(reenvio, r)).toBe(true);
    expect(estadoMensagem(solucao, acoes, r)).toBe("espera_aprovacao");
  });

  it("com a foto e a aprovação, a mensagem pode sair", () => {
    const r = reg({ fotoRecebida: true, decisoes: { reenviar: "aprovada" } });
    expect(estadoAcao(reenvio, r)).toBe("aprovada");
    expect(estadoMensagem(solucao, acoes, r)).toBe("enviar_agora");
  });

  it("aprovar antes da foto não libera a mensagem", () => {
    expect(estadoMensagem(solucao, acoes, reg({ decisoes: { reenviar: "aprovada" } }))).toBe("espera_foto");
  });

  it("acionar a transportadora é automático desde o início", () => {
    expect(estadoAcao(acoes.find((a) => a.acao === "acionar_transportadora")!, reg())).toBe("liberada");
  });
});

describe("mensagem que anuncia mais de uma ação com dinheiro", () => {
  const e = todas.find((x) => x.tipo_excecao === "item_faltante")!;
  const acoes = avaliarAcoes(["reenviar", "reembolsar", "contatar_cliente"], e);
  const [m] = planejarMensagens("Vamos reenviar e reembolsar.", acoes, e);

  it("não sai com só uma das ações aprovada", () => {
    expect(m.dependeDe).toEqual(["reenviar", "reembolsar"]);
    expect(estadoMensagem(m, acoes, reg({ decisoes: { reenviar: "aprovada" } }))).toBe("espera_aprovacao");
  });

  it("sai quando todas forem aprovadas", () => {
    expect(estadoMensagem(m, acoes, reg({ decisoes: { reenviar: "aprovada", reembolsar: "aprovada" } }))).toBe("enviar_agora");
  });

  it("fica cancelada se alguma for recusada", () => {
    expect(estadoMensagem(m, acoes, reg({ decisoes: { reenviar: "aprovada", reembolsar: "recusada" } }))).toBe("cancelada");
  });
});

describe("situacaoPedido: em que passo do dia o pedido está", () => {
  const e = todas.find((x) => x.tipo_excecao === "avaria_transporte")!;
  const acoes = avaliarAcoes(["reenviar", "acionar_transportadora"], e);
  const mensagens = planejarMensagens("Vamos reenviar o produto.", acoes, e);

  it("avaria antes da foto: esperando o cliente", () => {
    expect(situacaoPedido(acoes, mensagens, reg())).toBe("esperando_cliente");
  });
  it("depois da foto: decidir", () => {
    expect(situacaoPedido(acoes, mensagens, reg({ fotoRecebida: true }))).toBe("decidir");
  });
  it("aprovada: falta enviar a mensagem da solução", () => {
    const r = reg({ fotoRecebida: true, decisoes: { reenviar: "aprovada" }, enviadas: [0] });
    expect(situacaoPedido(acoes, mensagens, r)).toBe("enviar");
  });
  it("aprovada e com as mensagens enviadas: concluído", () => {
    const r = reg({ fotoRecebida: true, decisoes: { reenviar: "aprovada" }, enviadas: [0, 1] });
    expect(situacaoPedido(acoes, mensagens, r)).toBe("concluido");
  });
  it("recusada: concluído, com a mensagem da solução cancelada", () => {
    const r = reg({ fotoRecebida: true, decisoes: { reenviar: "recusada" }, enviadas: [0] });
    expect(situacaoPedido(acoes, mensagens, r)).toBe("concluido");
    expect(estadoMensagem(mensagens[1], acoes, r)).toBe("cancelada");
  });
  it("só mensagem informativa: enviar, e depois concluído", () => {
    const x = todas.find((y) => y.tipo_excecao === "atraso_entrega" && !y.perdaTravada)!;
    const ac = avaliarAcoes(["acionar_transportadora", "contatar_cliente"], x);
    const ms = planejarMensagens("Já cobramos a transportadora.", ac, x);
    expect(situacaoPedido(ac, ms, reg())).toBe("enviar");
    expect(situacaoPedido(ac, ms, reg({ enviadas: [0] }))).toBe("concluido");
  });
});

describe("mensagem sem dinheiro", () => {
  it("sai na hora, mesmo para cliente de alto valor", () => {
    const e = todas.find((x) => x.clienteVip && x.tipo_excecao === "atraso_entrega")!;
    const acoes = avaliarAcoes(["acionar_transportadora", "contatar_cliente"], e);
    const [m] = planejarMensagens("Já cobramos a transportadora.", acoes, e);
    expect(m.dependeDe).toEqual([]);
    expect(estadoMensagem(m, acoes, reg())).toBe("enviar_agora");
  });
});
