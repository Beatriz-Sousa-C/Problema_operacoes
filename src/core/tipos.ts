export const TIPOS_EXCECAO = [
  "atraso_entrega",
  "extravio",
  "rastreio_parado",
  "devolvido_transportadora",
  "avaria_transporte",
  "vazamento_produto",
  "item_faltante",
  "falha_personalizacao",
  "pagamento_pendente",
  "ruptura_pos_venda",
  "endereco_divergente",
] as const;
export type TipoExcecao = (typeof TIPOS_EXCECAO)[number];

export interface ExcecaoBruta {
  order_id: string;
  customer_id: string;
  marca: string;
  data_pedido: string;
  valor: number;
  sku: string;
  descricao_produto: string;
  qtd_itens: number;
  brinde_no_pedido: boolean;
  tipo_excecao: TipoExcecao;
  status: string;
  transportadora: string;
  uf: string;
  cidade: string;
  data_prometida: string;
  data_entrega: string | null;
  maquina: string | null;
  turno: string;
  cd: string;
  lote_produto: string;
  data_abertura_excecao: string;
}

export interface Cliente {
  customer_id: string;
  n_pedidos: number;
  receita_acumulada: number;
  data_primeiro_pedido: string;
  n_contatos_atendimento: number;
}

export interface Transportadora {
  transportadora: string;
  uf_atendida: string;
  sla_contratado_dias_uteis: number;
  custo_medio_frete: number;
}

export interface BaseDados {
  excecoes: ExcecaoBruta[];
  clientes: Cliente[];
  transportadoras: Transportadora[];
}

/** Exceção enriquecida com contexto e com o modelo de risco calculado. */
export interface ExcecaoAnalisada extends ExcecaoBruta {
  id: string;
  cliente: Cliente;
  slaContratado: number;
  freteMedio: number;
  regiao: string;
  /** Prazo correto segundo a regra (1 dia útil de separação + SLA em dias úteis) */
  prazoContratado: string;
  /** Dias úteis que o sistema prometeu a menos do que o contrato permite */
  diasPrometidosAMenos: number;
  entregue: boolean;
  /** Atraso entregue: o atraso final já ocorreu e a fila não muda a perda */
  perdaTravada: boolean;
  /** Atraso (dias úteis) em relação à data mostrada ao cliente, na data de referência */
  atrasoAtual: number;
  /** Atraso (dias úteis) em relação ao prazo contratado com a transportadora */
  atrasoVsContrato: number;
  clienteVip: boolean;
  ticketMedio: number;
  /** Compras por ano esperadas (frequência histórica, com piso e teto) */
  frequenciaAnual: number;
  /** Valor em jogo se o cliente cancelar: reembolso (ou margem perdida) + recompra perdida */
  valorEmJogo: number;
  componenteReembolso: number;
  componenteRecompra: number;
  probabilidadeCancelamentoAtual: number;
  /** X: perda esperada hoje (probabilidade atual × valor em jogo) */
  exposicao: number;
  /** Z: quanto a perda esperada aumenta se o pedido for para o fim da fila */
  custoDeEsperar: number;
  /** Custo de resolver por reenvio (CMV + frete médio) */
  custoReenvio: number;
}

export interface RelatorioQualidade {
  linhasRecebidas: number;
  duplicatasRemovidas: number;
  duplicatas: { order_id: string; tipo_excecao: string; statusMantido: string; statusDescartado: string }[];
  clientesAusentes: number;
  transportadorasSemSla: number;
}
