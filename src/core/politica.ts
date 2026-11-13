/**
 * Política de tratativas e regras de autonomia do agente.
 *
 * A IA propõe; este módulo decide o que pode ser executado. Nenhuma ação sai
 * do sistema sem passar por `avaliarAcao`, então um erro do modelo nunca vira
 * dinheiro saindo da empresa sem uma pessoa aprovar (decisão "B" de autonomia).
 */
import type { ExcecaoAnalisada, TipoExcecao } from "./tipos";

export const ACOES = [
  "contatar_cliente",
  "acionar_transportadora",
  "reenviar",
  "nova_producao",
  "oferecer_substituto",
  "reembolsar",
  "cancelar_pedido",
  "abrir_chamado_interno",
] as const;
export type Acao = (typeof ACOES)[number];

export const ROTULO_ACAO: Record<Acao, string> = {
  contatar_cliente: "Contatar cliente",
  acionar_transportadora: "Acionar transportadora",
  reenviar: "Reenviar",
  nova_producao: "Nova produção",
  oferecer_substituto: "Oferecer substituto",
  reembolsar: "Reembolsar",
  cancelar_pedido: "Cancelar pedido",
  abrir_chamado_interno: "Chamado interno",
};

/** Ações que custam dinheiro diretamente */
const ACOES_COM_CUSTO: ReadonlySet<Acao> = new Set(["reenviar", "nova_producao"]);
/** Ações que sempre exigem uma pessoa */
const ACOES_SEMPRE_COM_APROVACAO: ReadonlySet<Acao> = new Set(["reembolsar", "cancelar_pedido"]);

export interface RegraTipo {
  descricao: string;
  /** Ações permitidas para o tipo (reembolso e chamado interno valem para todos) */
  permitidas: Acao[];
  /** Tratativa padrão, usada quando a IA está indisponível */
  padrao: Acao[];
  orientacao: string;
}

const COMUNS: Acao[] = ["contatar_cliente", "reembolsar", "abrir_chamado_interno"];

export const POLITICA: Record<TipoExcecao, RegraTipo> = {
  atraso_entrega: {
    descricao: "Pedido atrasado em relação à data prometida",
    permitidas: [...COMUNS, "acionar_transportadora"],
    padrao: ["acionar_transportadora", "contatar_cliente"],
    orientacao: "Cobrar a transportadora pelo novo prazo e avisar o cliente proativamente. Se já foi entregue, só pedir desculpas.",
  },
  rastreio_parado: {
    descricao: "Rastreio sem atualização",
    permitidas: [...COMUNS, "acionar_transportadora", "reenviar"],
    padrao: ["acionar_transportadora", "contatar_cliente"],
    orientacao: "Abrir investigação na transportadora. Reenviar só se ela confirmar extravio.",
  },
  extravio: {
    descricao: "Pedido extraviado pela transportadora",
    permitidas: [...COMUNS, "acionar_transportadora", "reenviar"],
    padrao: ["reenviar", "acionar_transportadora", "contatar_cliente"],
    orientacao: "Reenviar ao cliente e pedir indenização à transportadora.",
  },
  devolvido_transportadora: {
    descricao: "Pedido devolvido ao CD pela transportadora",
    permitidas: [...COMUNS, "acionar_transportadora", "reenviar"],
    padrao: ["contatar_cliente", "reenviar"],
    orientacao: "Confirmar o endereço com o cliente antes de reenviar.",
  },
  avaria_transporte: {
    descricao: "Produto avariado no transporte",
    permitidas: [...COMUNS, "acionar_transportadora", "reenviar"],
    padrao: ["reenviar", "acionar_transportadora", "contatar_cliente"],
    orientacao: "Reenvio sem custo mediante foto, em até 7 dias do recebimento. Abrir sinistro na transportadora.",
  },
  vazamento_produto: {
    descricao: "Produto chegou vazando",
    permitidas: [...COMUNS, "reenviar"],
    padrao: ["reenviar", "contatar_cliente"],
    orientacao: "Reenvio sem custo mediante foto, em até 7 dias do recebimento. Reenviar de outro lote se o lote estiver sob suspeita.",
  },
  item_faltante: {
    descricao: "Item faltando no pedido",
    permitidas: [...COMUNS, "reenviar"],
    padrao: ["reenviar", "contatar_cliente"],
    orientacao: "Reenviar o item faltante (inclusive brinde de campanha) sem custo.",
  },
  falha_personalizacao: {
    descricao: "Erro na personalização Gocase",
    permitidas: [...COMUNS, "nova_producao"],
    padrao: ["nova_producao", "contatar_cliente"],
    orientacao: "Nova produção sem custo. Mesmo custo de um reenvio.",
  },
  pagamento_pendente: {
    descricao: "Pagamento não confirmado",
    permitidas: [...COMUNS, "cancelar_pedido"],
    padrao: ["contatar_cliente"],
    orientacao: "Lembrar o cliente do pagamento. Cancelar só com aprovação, quando não houver retorno.",
  },
  ruptura_pos_venda: {
    descricao: "Produto sem estoque depois da venda",
    permitidas: [...COMUNS, "oferecer_substituto"],
    padrao: ["oferecer_substituto", "contatar_cliente"],
    orientacao: "Oferecer substituto equivalente ou reembolso, à escolha do cliente.",
  },
  endereco_divergente: {
    descricao: "Endereço divergente",
    permitidas: [...COMUNS, "acionar_transportadora"],
    padrao: ["contatar_cliente", "acionar_transportadora"],
    orientacao: "Confirmar o endereço com o cliente e corrigir a rota na transportadora.",
  },
};

export const LIMITE_REENVIO_AUTOMATICO = 65;

export type StatusAcao = "automatica" | "aguardando_aprovacao" | "bloqueada";

export interface AvaliacaoAcao {
  acao: Acao;
  status: StatusAcao;
  motivo: string;
  custoEstimado: number;
}

export function custoDaAcao(acao: Acao, e: ExcecaoAnalisada): number {
  if (ACOES_COM_CUSTO.has(acao)) return e.custoReenvio;
  if (acao === "reembolsar") return e.tipo_excecao === "pagamento_pendente" ? 0 : e.valor;
  return 0;
}

/** Regras de autonomia (decisão B). */
export function avaliarAcao(acao: Acao, e: ExcecaoAnalisada): AvaliacaoAcao {
  const custoEstimado = custoDaAcao(acao, e);
  const regra = POLITICA[e.tipo_excecao];
  if (!regra.permitidas.includes(acao)) {
    return { acao, status: "bloqueada", motivo: `"${ROTULO_ACAO[acao]}" não é permitido pela política para ${e.tipo_excecao}`, custoEstimado };
  }
  if (ACOES_SEMPRE_COM_APROVACAO.has(acao)) {
    return { acao, status: "aguardando_aprovacao", motivo: "Reembolsos e cancelamentos sempre passam por uma pessoa", custoEstimado };
  }
  if (e.clienteVip) {
    return { acao, status: "aguardando_aprovacao", motivo: "Cliente de alto valor (receita acumulada acima de R$ 1.500)", custoEstimado };
  }
  if (ACOES_COM_CUSTO.has(acao) && custoEstimado > LIMITE_REENVIO_AUTOMATICO) {
    return {
      acao,
      status: "aguardando_aprovacao",
      motivo: `Custo de R$ ${custoEstimado.toFixed(2)} acima do limite automático de R$ ${LIMITE_REENVIO_AUTOMATICO}`,
      custoEstimado,
    };
  }
  return { acao, status: "automatica", motivo: "Dentro da política e do limite de autonomia", custoEstimado };
}

/** Tratativa padrão, sem IA: usada como rede de segurança. */
export function acoesPadrao(e: ExcecaoAnalisada): Acao[] {
  if (e.perdaTravada) return ["contatar_cliente"];
  return POLITICA[e.tipo_excecao].padrao;
}
