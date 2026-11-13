/**
 * Modelo de risco financeiro de cada exceção.
 *
 * Premissas (detalhadas em DECISOES.md):
 *  - A probabilidade de cancelamento depende dos dias úteis de atraso em
 *    relação à data MOSTRADA ao cliente, no momento em que a exceção é tratada.
 *    Tratar um pedido impede que o atraso dele continue crescendo, mas não
 *    desfaz o risco que o atraso já criou.
 *  - Se o cliente cancela, a empresa perde o reembolso (valor pago) e a
 *    exceção conta como mal resolvida: a chance de recompra cai pela metade.
 *    O que se perde é a margem das compras dos próximos 12 meses, estimadas
 *    pela frequência histórica do cliente (com piso de histórico e teto).
 *  - Pagamento pendente não tem reembolso (o cliente não pagou): o que se
 *    perde é a margem da venda.
 *  - Atraso já entregue tem perda travada: a fila não muda o resultado.
 */
import { Calendario, paraDia, paraIso } from "./calendario";
import { PARAMETROS, REGIAO_POR_UF, type Parametros } from "./parametros";
import type { BaseDados, ExcecaoAnalisada, RelatorioQualidade, Transportadora } from "./tipos";
import { removerDuplicatas } from "./dados";

export function probabilidadeCancelamento(atrasoDiasUteis: number, p: Parametros = PARAMETROS): number {
  for (const f of p.faixasCancelamento) {
    if (atrasoDiasUteis >= f.min && atrasoDiasUteis <= f.max) return f.probabilidade;
  }
  return 0;
}

const DIAS_POR_MES = 30.44;

/** Compras por ano esperadas para o cliente, com as proteções dos parâmetros. */
export function comprasPorAno(
  nPedidos: number,
  dataPrimeiroPedido: string,
  dataReferencia: string,
  p: Parametros = PARAMETROS,
): number {
  const meses = Math.max(
    p.recompra.mesesMinimosHistorico,
    (paraDia(dataReferencia) - paraDia(dataPrimeiroPedido)) / DIAS_POR_MES,
  );
  return Math.min(p.recompra.compraMaximaPorAno, (nPedidos / meses) * 12);
}

export interface Analise {
  excecoes: ExcecaoAnalisada[];
  qualidade: RelatorioQualidade;
  /** Dias úteis necessários para zerar a fila com a capacidade atual */
  horizonteDias: number;
  /** Datas (dias úteis) em que a fila é tratada: índice 0 = hoje */
  diasDeTratamento: string[];
  parametros: Parametros;
}

/**
 * Atraso (dias úteis) que o pedido terá se for tratado em cada dia do horizonte.
 * Calculado a partir do calendário real, então pedidos cujo prazo ainda não
 * venceu começam a acumular atraso só depois da data prometida.
 */
export function atrasoNoDia(
  cal: Calendario,
  dataPrometida: string,
  diaTratamento: string,
): number {
  return cal.diasUteisEntre(paraDia(dataPrometida), paraDia(diaTratamento));
}

const mediana = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * SLA e frete quando a transportadora × UF não está na tabela: a mediana da
 * mesma transportadora nas outras UFs ou, sem ela, a mediana geral. Usar 0
 * faria a transportadora parecer atrasada e o reenvio parecer mais barato.
 */
export function estimadorDeSla(tabela: readonly Transportadora[]) {
  const geral = { sla: Math.round(mediana(tabela.map((t) => t.sla_contratado_dias_uteis))), frete: mediana(tabela.map((t) => t.custo_medio_frete)) };
  const cache = new Map<string, { sla: number; frete: number }>();
  return (transportadora: string) => {
    let r = cache.get(transportadora);
    if (!r) {
      const dela = tabela.filter((t) => t.transportadora === transportadora);
      r = dela.length
        ? { sla: Math.round(mediana(dela.map((t) => t.sla_contratado_dias_uteis))), frete: mediana(dela.map((t) => t.custo_medio_frete)) }
        : geral;
      cache.set(transportadora, r);
    }
    return r;
  };
}

export function analisar(base: BaseDados, p: Parametros = PARAMETROS): Analise {
  const cal = new Calendario(p.feriados);
  const { unicas, duplicatas } = removerDuplicatas(base.excecoes);

  const clientes = new Map(base.clientes.map((c) => [c.customer_id, c]));
  const slas = new Map(base.transportadoras.map((t) => [`${t.transportadora}|${t.uf_atendida}`, t]));
  const estimarSla = estimadorDeSla(base.transportadoras);

  // O cliente só pode ir embora uma vez: a recompra dele é dividida entre as exceções abertas.
  const excecoesPorCliente = new Map<string, number>();
  for (const e of unicas) excecoesPorCliente.set(e.customer_id, (excecoesPorCliente.get(e.customer_id) ?? 0) + 1);

  const horizonteDias = Math.max(1, Math.ceil(unicas.length / p.capacidadeDiaria));
  const ref = paraDia(p.dataReferencia);
  const diasDeTratamento = Array.from({ length: horizonteDias }, (_, k) =>
    paraIso(k === 0 ? ref : cal.somarDiasUteis(ref, k)),
  );
  const ultimoDia = diasDeTratamento[diasDeTratamento.length - 1];

  let clientesAusentes = 0;
  let transportadorasSemSla = 0;

  const excecoes: ExcecaoAnalisada[] = unicas.map((e) => {
    let cliente = clientes.get(e.customer_id);
    if (!cliente) {
      clientesAusentes++;
      cliente = { customer_id: e.customer_id, n_pedidos: 1, receita_acumulada: e.valor, data_primeiro_pedido: e.data_pedido, n_contatos_atendimento: 0 };
    }
    const t = slas.get(`${e.transportadora}|${e.uf}`);
    if (!t) transportadorasSemSla++;
    const estimado = t ? null : estimarSla(e.transportadora);
    const sla = t?.sla_contratado_dias_uteis ?? estimado!.sla;
    const frete = t?.custo_medio_frete ?? estimado!.frete;
    const excecoesDoCliente = excecoesPorCliente.get(e.customer_id) ?? 1;

    const prazoContratado = cal.prazoContratado(e.data_pedido, sla);
    const entregue = e.data_entrega !== null;
    const perdaTravada = entregue && e.tipo_excecao === "atraso_entrega";
    const fimAtraso = perdaTravada ? e.data_entrega! : p.dataReferencia;

    const atrasoAtual = atrasoNoDia(cal, e.data_prometida, fimAtraso);
    const atrasoVsContrato = atrasoNoDia(cal, prazoContratado, fimAtraso);

    const clienteVip = cliente.receita_acumulada > p.recompra.limiarReceitaVip;
    const ticketMedio = cliente.receita_acumulada / Math.max(1, cliente.n_pedidos);
    const margem = 1 - p.cmv;
    const probRecompra = clienteVip ? p.recompra.probabilidadeVip : p.recompra.probabilidadeDemais;
    const frequenciaAnual = comprasPorAno(cliente.n_pedidos, cliente.data_primeiro_pedido, p.dataReferencia, p);
    const componenteRecompra =
      (probRecompra * (1 - p.recompra.fatorMalResolvida) * frequenciaAnual * ticketMedio * margem) / excecoesDoCliente;
    const componenteReembolso = e.tipo_excecao === "pagamento_pendente" ? e.valor * margem : e.valor;
    const valorEmJogo = componenteReembolso + componenteRecompra;

    const pAtual = probabilidadeCancelamento(atrasoAtual, p);
    const exposicao = pAtual * valorEmJogo;
    const atrasoNoFim = perdaTravada ? atrasoAtual : atrasoNoDia(cal, e.data_prometida, ultimoDia);
    const custoDeEsperar = (probabilidadeCancelamento(atrasoNoFim, p) - pAtual) * valorEmJogo;

    return {
      ...e,
      id: `${e.order_id}|${e.tipo_excecao}`,
      cliente,
      slaContratado: sla,
      freteMedio: frete,
      slaEstimado: !t,
      excecoesDoCliente,
      regiao: REGIAO_POR_UF[e.uf] ?? "Desconhecida",
      prazoContratado,
      diasPrometidosAMenos: cal.diasUteisEntre(paraDia(e.data_prometida), paraDia(prazoContratado)),
      entregue,
      perdaTravada,
      atrasoAtual,
      atrasoVsContrato,
      clienteVip,
      ticketMedio,
      frequenciaAnual,
      valorEmJogo,
      componenteReembolso,
      componenteRecompra,
      probabilidadeCancelamentoAtual: pAtual,
      exposicao,
      custoDeEsperar,
      custoReenvio: e.valor * p.cmv + frete,
    };
  });

  return {
    excecoes,
    qualidade: {
      linhasRecebidas: base.excecoes.length + (base.descartadas ?? []).filter((d) => d.arquivo === "pedidos_excecao.csv").length,
      duplicatasRemovidas: duplicatas.length,
      duplicatas,
      clientesAusentes,
      transportadorasSemSla,
      linhasDescartadas: base.descartadas ?? [],
      linhasCorrigidas: base.corrigidas ?? [],
    },
    horizonteDias,
    diasDeTratamento,
    parametros: p,
  };
}
