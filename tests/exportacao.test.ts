import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import { criarContexto, gerarPlanoDoDia, type PlanoDoDia } from "@/agente";
import { chaveAcao, chaveMensagem, chaveRecusa, chaveTransportadora, jaExportados, reduzirLotes, type Lote } from "@/ui/lotes";
import { descreverContagens, montarExportacao, nomeDeAba, nomeDoArquivo, paraCsv, transportadoraDoDestino, type Aba } from "@/ui/exportacao";
import { planilhasDe } from "@/ui/planilha";
import { reduzirRegistro, type Registro } from "@/ui/registro";
import { montarDia } from "@/ui/tratativas";
import { baseReal } from "./carregar";

const base = baseReal();
const ctx = criarContexto(base);
const plano: PlanoDoDia = await gerarPlanoDoDia(ctx, null);
// Um grupo com reenvio em aprovação e um grupo com acionamento de transportadora.
const grupoReenvio = plano.grupos.find((g) => g.plano.acoes.includes("reenviar") && g.tipo === "item_faltante")!;
const dosGrupo = (chave: string) => plano.tratativas.filter((t) => t.grupo === chave);
const agora = new Date("2026-09-30T15:00:00-03:00");

const exportar = (registro: Registro, escopo: "novos" | "dia" | { lote: Lote }, exportados = new Set<string>(), proximoLote = 1) =>
  montarExportacao(ctx, montarDia(ctx, plano, registro), registro, plano, base, { escopo, exportados, proximoLote, agora });

const aba = (e: ReturnType<typeof exportar>, id: string) => e.abas.find((a) => a.id === id)!;
const pedidosDe = (a: Aba) => a.linhas.map((l) => String(l.celulas[0]));

describe("montarExportacao", () => {
  it("sem aprovações: transportadoras só com acionamentos liberados, reenvios e financeiro vazios, mensagens só as liberadas", () => {
    const e = exportar({}, "dia");
    expect(e.abas[0].id).toBe("resumo");
    expect(aba(e, "reenvios").linhas).toHaveLength(0);
    expect(aba(e, "financeiro").linhas).toHaveLength(0);
    const transp = e.abas.filter((a) => a.id.startsWith("transportadora:"));
    expect(transp.length).toBeGreaterThan(0);
    for (const a of transp) {
      expect(a.nome.length).toBeLessThanOrEqual(31);
      for (const l of a.linhas) expect(String(l.celulas[9])).toContain("Acionar transportadora");
    }
    const dia = montarDia(ctx, plano, {});
    expect(aba(e, "mensagens").linhas).toHaveLength(dia.nEnviar);
    expect(e.contagens.total).toBe(e.itens.length);
    expect(e.numeroLote).toBeNull();
  });

  it("aprovações viram linhas de reenvio com custo; recusas vão para a aba de auditoria; o chamado do grupo vai só para a transportadora certa", () => {
    const t = dosGrupo(grupoReenvio.chave);
    const [aprovado, recusado] = t;
    let registro: Registro = reduzirRegistro({}, { tipo: "decidir", id: aprovado.id, acao: "reenviar", decisao: "aprovada" });
    registro = reduzirRegistro(registro, { tipo: "decidir", id: recusado.id, acao: "reenviar", decisao: "recusada" });
    const e = exportar(registro, "dia");

    const reenvios = aba(e, "reenvios");
    expect(pedidosDe(reenvios)).toContain(ctx.porId.get(aprovado.id)!.excecao.order_id);
    expect(pedidosDe(reenvios)).not.toContain(ctx.porId.get(recusado.id)!.excecao.order_id);
    const linha = reenvios.linhas.find((l) => l.chave === chaveAcao(aprovado.id, "reenviar"))!;
    expect(Number(linha.celulas[11])).toBeGreaterThan(0); // custo estimado
    expect(pedidosDe(aba(e, "recusas"))).toContain(ctx.porId.get(recusado.id)!.excecao.order_id);
    expect(aba(e, "recusas").linhas[0].chave).toBe(chaveRecusa(recusado.id, "reenviar"));

    // Chamados em lote: os de transportadora aparecem no preâmbulo da aba dela e em nenhuma outra; os internos vão para a aba de chamados.
    const nomes = [...new Set(base.transportadoras.map((x) => x.transportadora))];
    for (const g of plano.grupos.filter((x) => x.plano.chamado_lote)) {
      const transp = transportadoraDoDestino(g.plano.chamado_lote!.destino, nomes);
      const texto = g.plano.chamado_lote!.texto;
      if (transp) {
        const certa = e.abas.find((a) => a.id === `transportadora:${transp}`)!;
        expect(certa.preambulo.some((p) => p.includes(texto))).toBe(true);
        for (const outra of e.abas.filter((a) => a.id.startsWith("transportadora:") && a !== certa)) expect(outra.preambulo.some((p) => p.includes(texto))).toBe(false);
      } else {
        expect(aba(e, "chamados").linhas.some((l) => String(l.celulas[3]) === texto)).toBe(true);
      }
    }
  });

  it("escopo 'novos' exclui o que já saiu, 'dia' inclui tudo e { lote } reproduz exatamente o lote", () => {
    const t = dosGrupo(grupoReenvio.chave);
    const registro = reduzirRegistro({}, { tipo: "decidir_lote", itens: t.map((x) => ({ id: x.id, acao: "reenviar" as const })), decisao: "aprovada" });
    const lote1 = exportar(registro, "novos");
    expect(lote1.numeroLote).toBe(1);
    expect(lote1.itens.length).toBe(lote1.contagens.total);
    const lotes = reduzirLotes([], { tipo: "fechar", itens: lote1.itens, contagens: {}, em: agora.toISOString() });

    const lote2 = exportar(registro, "novos", jaExportados(lotes), 2);
    expect(lote2.contagens.total).toBe(0);
    expect(lote2.abas.filter((a) => a.id !== "resumo").every((a) => a.linhas.length === 0 && a.preambulo.length === 0)).toBe(true);

    // Nova aprovação depois do lote 1 entra sozinha no lote 2; mensagem nova também.
    const outro = plano.tratativas.find((x) => x.grupo !== grupoReenvio.chave && x.acoes.some((a) => a.status === "aguardando_aprovacao"))!;
    const acao = outro.acoes.find((a) => a.status === "aguardando_aprovacao")!.acao;
    const registro2 = reduzirRegistro(registro, { tipo: "decidir", id: outro.id, acao, decisao: "aprovada" });
    const lote2b = exportar(registro2, "novos", jaExportados(lotes), 2);
    expect(lote2b.itens).toContain(chaveAcao(outro.id, acao));
    expect(lote2b.itens.some((c) => t.some((x) => c.startsWith(`${x.id}|`)))).toBe(false);

    const dia = exportar(registro2, "dia");
    expect(dia.itens.length).toBe(lote1.itens.length + lote2b.itens.length);

    const repetido = exportar(registro2, { lote: lotes[0] });
    expect(new Set(repetido.itens)).toEqual(new Set(lote1.itens));
    expect(repetido.numeroLote).toBe(1);
  });

  it("mensagem marcada como enviada continua na aba com status 'enviada'; linha de transportadora tem chave própria", () => {
    const t = plano.tratativas.find((x) => x.mensagens.some((m) => m.status === "automatica") && x.acoes.some((a) => a.acao === "acionar_transportadora"))!;
    const i = t.mensagens.findIndex((m) => m.status === "automatica");
    const registro = reduzirRegistro({}, { tipo: "mensagem_enviada", id: t.id, indice: i });
    const e = exportar(registro, "dia");
    const linha = aba(e, "mensagens").linhas.find((l) => l.chave === chaveMensagem(t.id, i))!;
    expect(linha.celulas[4]).toBe("enviada");
    expect(e.itens).toContain(chaveTransportadora(t.id));
  });
});

describe("nomes, CSV e planilha", () => {
  it("nomeDeAba corta em 31, remove caracteres proibidos e evita duplicatas", () => {
    const usados = new Set<string>();
    expect(nomeDeAba("Rota Express: Nordeste/Norte [2026]?*", usados)).toBe("Rota Express Nordeste Norte 202");
    expect(nomeDeAba("Rota Express: Nordeste/Norte [2026]?*", usados)).toBe("Rota Express Nordeste Norte (2)");
    expect(nomeDeAba("   ", usados)).toBe("Aba");
  });

  it("paraCsv usa BOM, ponto e vírgula, decimal com vírgula e escapa aspas e quebras de linha", () => {
    const a: Aba = {
      id: "x",
      nome: "X",
      titulo: "X",
      preambulo: ["Chamado; com ponto e vírgula"],
      colunas: [{ titulo: "Pedido" }, { titulo: "Valor (R$)" }, { titulo: "Texto" }],
      linhas: [{ chave: "k", celulas: ["GC1", 12.5, 'Olá "cliente"\nlinha 2'] }],
    };
    const csv = paraCsv(a);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas[0]).toBe('"Chamado; com ponto e vírgula"');
    expect(linhas[1]).toBe("Pedido;Valor (R$);Texto");
    expect(linhas[2]).toBe('GC1;12,5;"Olá ""cliente""\nlinha 2"');
  });

  it("nomeDoArquivo e descreverContagens", () => {
    expect(nomeDoArquivo("2026-09-30", 3, "xlsx")).toBe("excecoes_2026-09-30_lote-03.xlsx");
    expect(nomeDoArquivo("2026-09-30", null, "csv", { nome: "Rota Express (2)" } as Aba)).toBe("excecoes_2026-09-30_dia-inteiro_rota-express-2.csv");
    expect(descreverContagens({ pedidosTransportadoras: 4, reenvios: 1, mensagens: 58 })).toBe("4 pedidos para transportadoras · 1 reenvio ou produção · 58 mensagens");
    expect(descreverContagens({})).toBe("nada novo");
  });

  it("gera um XLSX válido com todas as abas (conferência em Node)", async () => {
    const e = exportar({}, "dia");
    const planilhas = planilhasDe<Buffer>(e);
    expect(planilhas.map((p) => p.sheet)).toEqual(e.abas.map((a) => a.nome));
    const buffer = await (await writeXlsxFile(planilhas)).toBuffer();
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK"); // é um zip
    expect(buffer.includes("xl/workbook.xml")).toBe(true);
    expect(buffer.length).toBeGreaterThan(10_000);
  });
});
