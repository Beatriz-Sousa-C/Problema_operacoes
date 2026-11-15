/**
 * Ferramentas que o agente pode chamar. Cada uma é uma função pura sobre o
 * contexto: o modelo de linguagem nunca inventa um número, ele consulta.
 */
import { z } from "zod";
import { ACOES, POLITICA, REGIAO_POR_UF, TIPOS_EXCECAO, TIPOS_QUE_EXIGEM_FOTO, type ExcecaoAnalisada } from "@/core";
import type { Contexto } from "./contexto";
import type { DefinicaoFerramenta } from "./llm";

const r2 = (v: number) => Math.round(v * 100) / 100;

export function resumoPedido(e: ExcecaoAnalisada) {
  return {
    id: e.id,
    pedido: e.order_id,
    marca: e.marca,
    produto: e.descricao_produto,
    valor: e.valor,
    qtd_itens: e.qtd_itens,
    brinde_no_pedido: e.brinde_no_pedido,
    tipo_excecao: e.tipo_excecao,
    status_tratativa: e.status,
    transportadora: e.transportadora,
    destino: `${e.cidade}/${e.uf}`,
    data_pedido: e.data_pedido,
    data_prometida_ao_cliente: e.data_prometida,
    prazo_contratado_correto: e.prazoContratado,
    data_entrega: e.data_entrega,
    cd_turno: `${e.cd} ${e.turno}`,
    maquina: e.maquina,
    lote: e.lote_produto,
  };
}

export function riscoPedido(e: ExcecaoAnalisada) {
  return {
    atraso_dias_uteis_vs_prometido: e.atrasoAtual,
    atraso_dias_uteis_vs_contrato: e.atrasoVsContrato,
    probabilidade_cancelamento_hoje: e.probabilidadeCancelamentoAtual,
    valor_em_jogo: r2(e.valorEmJogo),
    perda_esperada_hoje: r2(e.exposicao),
    custo_de_esperar_ate_fim_da_fila: r2(e.custoDeEsperar),
    perda_ja_travada: e.perdaTravada,
    custo_reenvio: r2(e.custoReenvio),
  };
}

const esquemas = {
  consultar_pedido: z.object({ id: z.string() }),
  consultar_cliente: z.object({ customer_id: z.string() }),
  consultar_transportadora: z.object({ transportadora: z.string(), uf: z.string() }),
  verificar_causa_sistemica: z.object({ id: z.string() }),
  consultar_politica: z.object({ tipo_excecao: z.enum(TIPOS_EXCECAO) }),
};
export type NomeFerramentaConsulta = keyof typeof esquemas;

type Executor = (ctx: Contexto, args: unknown) => unknown;

const executores: Record<NomeFerramentaConsulta, Executor> = {
  consultar_pedido(ctx, args) {
    const { id } = esquemas.consultar_pedido.parse(args);
    const item = ctx.porId.get(id) ?? ctx.fila.find((i) => i.excecao.order_id === id);
    if (!item) return { erro: `Exceção ${id} não encontrada` };
    return {
      ...resumoPedido(item.excecao),
      risco: riscoPedido(item.excecao),
      posicao_na_fila: item.posicao,
      dia_de_tratamento: item.dia === 0 ? "hoje" : `daqui a ${item.dia} dia(s) útil(eis)`,
    };
  },

  consultar_cliente(ctx, args) {
    const { customer_id } = esquemas.consultar_cliente.parse(args);
    const excecoes = ctx.porCliente.get(customer_id);
    if (!excecoes?.length) return { erro: `Cliente ${customer_id} não encontrado` };
    const e = excecoes[0];
    return {
      customer_id,
      pedidos_desde_o_primeiro: e.cliente.n_pedidos,
      receita_acumulada: e.cliente.receita_acumulada,
      cliente_desde: e.cliente.data_primeiro_pedido,
      compras_por_ano_estimadas: r2(e.frequenciaAnual),
      ticket_medio: r2(e.ticketMedio),
      alto_valor: e.clienteVip,
      contatos_com_atendimento_12m: e.cliente.n_contatos_atendimento,
      excecoes_abertas: excecoes.map((x) => ({ id: x.id, tipo: x.tipo_excecao, valor: x.valor })),
    };
  },

  consultar_transportadora(ctx, args) {
    const { transportadora, uf } = esquemas.consultar_transportadora.parse(args);
    const todas = ctx.analise.excecoes;
    const regiao = REGIAO_POR_UF[uf.toUpperCase()] ?? "Desconhecida";
    const naRegiao = todas.filter((e) => e.regiao === regiao);
    const dela = naRegiao.filter((e) => e.transportadora === transportadora);
    if (!dela.length) return { erro: `Sem dados de ${transportadora} em ${uf}` };
    const atrasoOuRastreio = (l: ExcecaoAnalisada[]) =>
      l.filter((e) => e.tipo_excecao === "atraso_entrega" || e.tipo_excecao === "rastreio_parado").length / Math.max(1, l.length);
    const outras = naRegiao.filter((e) => e.transportadora !== transportadora);
    const porTipo: Record<string, number> = {};
    for (const e of dela) porTipo[e.tipo_excecao] = (porTipo[e.tipo_excecao] ?? 0) + 1;
    return {
      transportadora,
      uf,
      regiao,
      sla_contratado_dias_uteis: dela.find((e) => e.uf === uf)?.slaContratado ?? dela[0].slaContratado,
      frete_medio: dela.find((e) => e.uf === uf)?.freteMedio ?? dela[0].freteMedio,
      excecoes_na_regiao_por_tipo: porTipo,
      parcela_atraso_ou_rastreio_parado: r2(atrasoOuRastreio(dela)),
      mesma_parcela_nas_outras_transportadoras_da_regiao: r2(atrasoOuRastreio(outras)),
    };
  },

  verificar_causa_sistemica(ctx, args) {
    const { id } = esquemas.verificar_causa_sistemica.parse(args);
    const causas = ctx.causasPorPedido.get(id) ?? [];
    const e = ctx.porId.get(id)?.excecao;
    const promessaErrada =
      e && e.tipo_excecao === "atraso_entrega" && e.atrasoVsContrato === 0 && e.atrasoAtual > 0
        ? "O atraso existe só contra a data prometida: a transportadora está dentro do prazo contratado. O sistema calcula a promessa em dias corridos."
        : null;
    return {
      faz_parte_de_causa_sistemica: causas.length > 0,
      causas: causas.map((c) => ({
        causa: `${c.dimensao}: ${c.grupo}`,
        tipo: c.tipo,
        pedidos_afetados: c.observado,
        esperado_se_normal: r2(c.esperado),
        vezes_acima_do_normal: r2(c.lift),
      })),
      promessa_de_prazo_errada: promessaErrada,
    };
  },

  consultar_politica(_ctx, args) {
    const { tipo_excecao } = esquemas.consultar_politica.parse(args);
    const r = POLITICA[tipo_excecao];
    return {
      tipo_excecao,
      descricao: r.descricao,
      acoes_permitidas: r.permitidas,
      orientacao: r.orientacao,
      exige_foto_antes_da_solucao: TIPOS_QUE_EXIGEM_FOTO.has(tipo_excecao),
      regras_de_autonomia: [
        "Comunicação sem custo (mensagem informativa, pedido de foto, acionar transportadora) é automática para todos.",
        "Toda ação que envolve dinheiro (reenvio, nova produção, substituto, reembolso, cancelamento) exige aprovação humana, de qualquer valor.",
        "Avaria, vazamento e erro de personalização: o sistema pede a foto primeiro; a sua mensagem é a que sai depois da foto e da aprovação.",
        "A mensagem que anuncia ações com dinheiro só sai quando todas forem aprovadas.",
      ],
    };
  },
};

export function executarFerramenta(ctx: Contexto, nome: string, argumentosJson: string): unknown {
  const executor = executores[nome as NomeFerramentaConsulta];
  if (!executor) return { erro: `Ferramenta desconhecida: ${nome}` };
  try {
    return executor(ctx, JSON.parse(argumentosJson || "{}"));
  } catch (e) {
    return { erro: `Argumentos inválidos para ${nome}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): DefinicaoFerramenta => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const FERRAMENTAS_CONSULTA: DefinicaoFerramenta[] = [
  fn("consultar_pedido", "Dados do pedido, risco financeiro calculado e posição na fila.", { id: { type: "string", description: "id da exceção (pedido|tipo) ou número do pedido" } }, ["id"]),
  fn("consultar_cliente", "Histórico do cliente: frequência, receita, alto valor, outras exceções abertas.", { customer_id: { type: "string" } }, ["customer_id"]),
  fn("consultar_transportadora", "SLA, frete e desempenho da transportadora na região, comparado às concorrentes.", { transportadora: { type: "string" }, uf: { type: "string" } }, ["transportadora", "uf"]),
  fn("verificar_causa_sistemica", "Indica se a exceção faz parte de um problema de processo e se a data prometida estava errada.", { id: { type: "string" } }, ["id"]),
  fn("consultar_politica", "Ações permitidas pela política para o tipo de exceção e regras de autonomia.", { tipo_excecao: { type: "string", enum: [...TIPOS_EXCECAO] } }, ["tipo_excecao"]),
];

export const ESQUEMA_DECISAO = z.object({
  acoes: z.array(z.enum(ACOES)).min(1).max(4),
  justificativa: z.string().min(10).max(1200),
  mensagem_cliente: z.string().min(10).max(1500),
  chamado: z
    .object({ destino: z.string().min(2).max(80), texto: z.string().min(10).max(1500) })
    .nullable()
    .optional(),
  confianca: z.enum(["baixa", "media", "alta"]),
});
export type DecisaoAgente = z.infer<typeof ESQUEMA_DECISAO>;

export const FERRAMENTA_DECISAO: DefinicaoFerramenta = fn(
  "registrar_decisao",
  "Registra a decisão final para a exceção. Chame uma única vez, ao terminar a investigação.",
  {
    acoes: { type: "array", items: { type: "string", enum: [...ACOES] }, minItems: 1, maxItems: 4, description: "Ações em ordem de execução" },
    justificativa: { type: "string", description: "Por que estas ações, citando os números consultados" },
    mensagem_cliente: { type: "string", description: "Mensagem pronta para enviar ao cliente (WhatsApp/e-mail), em português, cordial e objetiva" },
    chamado: {
      type: "object",
      description: "Chamado para a transportadora ou área interna. Omita se não houver.",
      properties: { destino: { type: "string" }, texto: { type: "string" } },
      required: ["destino", "texto"],
    },
    confianca: { type: "string", enum: ["baixa", "media", "alta"] },
  },
  ["acoes", "justificativa", "mensagem_cliente", "confianca"],
);
