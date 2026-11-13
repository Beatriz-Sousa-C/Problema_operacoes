/**
 * Política de tratativas e regras de autonomia do agente.
 *
 * A IA propõe; este módulo decide o que pode ser executado. Nenhuma ação sai
 * do sistema sem passar por `avaliarAcao`, então um erro do modelo nunca vira
 * dinheiro saindo da empresa sem uma pessoa aprovar.
 *
 * Regras de autonomia:
 *  - Comunicação sem custo (mensagem informativa, pedido de foto, acionar a
 *    transportadora) é automática para todos os clientes.
 *  - Ação com custo é automática até R$ 65, exceto para cliente de alto valor.
 *  - Reembolso e cancelamento sempre passam por uma pessoa.
 *  - Avaria, vazamento e erro de personalização exigem foto antes do reenvio.
 *  - Uma mensagem que anuncia uma ação pendente espera junto com ela
 *    (`planejarMensagens`): a empresa nunca promete o que não foi aprovado.
 */
import type { ExcecaoAnalisada, TipoExcecao } from "./tipos";

export const ACOES = [
  "contatar_cliente",
  "solicitar_foto",
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
  solicitar_foto: "Pedir foto",
  acionar_transportadora: "Acionar transportadora",
  reenviar: "Reenviar",
  nova_producao: "Nova produção",
  oferecer_substituto: "Oferecer substituto",
  reembolsar: "Reembolsar",
  cancelar_pedido: "Cancelar pedido",
  abrir_chamado_interno: "Chamado interno",
};

/** Ações que custam dinheiro diretamente (o substituto custa a mercadoria e o frete) */
const ACOES_COM_CUSTO: ReadonlySet<Acao> = new Set(["reenviar", "nova_producao", "oferecer_substituto"]);
/** Ações que sempre exigem uma pessoa */
const ACOES_SEMPRE_COM_APROVACAO: ReadonlySet<Acao> = new Set(["reembolsar", "cancelar_pedido"]);
/** Ações que a política só libera depois da foto do cliente */
const ACOES_QUE_EXIGEM_FOTO: ReadonlySet<Acao> = new Set(["reenviar", "nova_producao"]);
/** Ações que o cliente fica sabendo pela mensagem (as internas não entram) */
const ACOES_ANUNCIADAS_AO_CLIENTE: ReadonlySet<Acao> = new Set([...ACOES_COM_CUSTO, ...ACOES_SEMPRE_COM_APROVACAO]);

export const TIPOS_QUE_EXIGEM_FOTO: ReadonlySet<TipoExcecao> = new Set([
  "avaria_transporte",
  "vazamento_produto",
  "falha_personalizacao",
]);

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
    orientacao: "Abrir investigação na transportadora e avisar o cliente. Reenviar só se ela confirmar extravio.",
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
    orientacao: "Pedir ao cliente a confirmação do endereço antes de reenviar.",
  },
  avaria_transporte: {
    descricao: "Produto avariado no transporte",
    permitidas: [...COMUNS, "solicitar_foto", "acionar_transportadora", "reenviar"],
    padrao: ["solicitar_foto", "reenviar", "acionar_transportadora"],
    orientacao: "Pedir a foto; com ela, reenvio sem custo em até 7 dias do recebimento. Abrir sinistro na transportadora.",
  },
  vazamento_produto: {
    descricao: "Produto chegou vazando",
    permitidas: [...COMUNS, "solicitar_foto", "reenviar"],
    padrao: ["solicitar_foto", "reenviar"],
    orientacao: "Pedir a foto; com ela, reenvio sem custo em até 7 dias do recebimento. Reenviar de outro lote se o lote estiver sob suspeita.",
  },
  item_faltante: {
    descricao: "Item faltando no pedido",
    permitidas: [...COMUNS, "reenviar"],
    padrao: ["reenviar", "contatar_cliente"],
    orientacao: "Reenviar o item faltante (inclusive brinde de campanha) sem custo.",
  },
  falha_personalizacao: {
    descricao: "Erro na personalização Gocase",
    permitidas: [...COMUNS, "solicitar_foto", "nova_producao"],
    padrao: ["solicitar_foto", "nova_producao"],
    orientacao: "Pedir a foto; com ela, nova produção sem custo, com o mesmo custo de um reenvio.",
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
    orientacao: "Pedir ao cliente a confirmação do endereço e corrigir a rota na transportadora.",
  },
};

export const LIMITE_REENVIO_AUTOMATICO = 65;

export type StatusAcao = "automatica" | "aguarda_foto" | "aguardando_aprovacao" | "bloqueada";

export interface AvaliacaoAcao {
  acao: Acao;
  status: StatusAcao;
  motivo: string;
  custoEstimado: number;
  /** Para ações que esperam a foto: o que acontece depois dela */
  statusAposFoto?: Exclude<StatusAcao, "aguarda_foto">;
}

export function custoDaAcao(acao: Acao, e: ExcecaoAnalisada): number {
  if (ACOES_COM_CUSTO.has(acao)) return e.custoReenvio;
  if (acao === "reembolsar") return e.tipo_excecao === "pagamento_pendente" ? 0 : e.valor;
  return 0;
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Status de uma ação, supondo que a foto (quando exigida) já chegou. */
function avaliarSemFoto(acao: Acao, e: ExcecaoAnalisada): AvaliacaoAcao {
  const custoEstimado = custoDaAcao(acao, e);
  if (!POLITICA[e.tipo_excecao].permitidas.includes(acao)) {
    return { acao, status: "bloqueada", motivo: `A política não permite "${ROTULO_ACAO[acao]}" para este tipo de exceção`, custoEstimado };
  }
  if (ACOES_SEMPRE_COM_APROVACAO.has(acao)) {
    return { acao, status: "aguardando_aprovacao", motivo: "Reembolsos e cancelamentos sempre passam por uma pessoa", custoEstimado };
  }
  if (!ACOES_COM_CUSTO.has(acao)) {
    return { acao, status: "automatica", motivo: "Comunicação sem custo", custoEstimado };
  }
  if (e.clienteVip) {
    return { acao, status: "aguardando_aprovacao", motivo: `Custo de ${reais(custoEstimado)} para cliente de alto valor (receita acima de R$ 1.500)`, custoEstimado };
  }
  if (custoEstimado > LIMITE_REENVIO_AUTOMATICO) {
    return { acao, status: "aguardando_aprovacao", motivo: `Custo de ${reais(custoEstimado)}, acima do limite automático de R$ ${LIMITE_REENVIO_AUTOMATICO}`, custoEstimado };
  }
  return { acao, status: "automatica", motivo: `Custo de ${reais(custoEstimado)}, dentro do limite automático`, custoEstimado };
}

export function avaliarAcao(acao: Acao, e: ExcecaoAnalisada): AvaliacaoAcao {
  const aposFoto = avaliarSemFoto(acao, e);
  if (aposFoto.status === "bloqueada" || !TIPOS_QUE_EXIGEM_FOTO.has(e.tipo_excecao) || !ACOES_QUE_EXIGEM_FOTO.has(acao)) {
    return aposFoto;
  }
  const depois = aposFoto.status === "automatica" ? "sai automaticamente" : "vai para aprovação";
  return {
    acao,
    status: "aguarda_foto",
    statusAposFoto: aposFoto.status as Exclude<StatusAcao, "aguarda_foto">,
    motivo: `A política exige a foto do cliente; quando ela chegar, ${depois}. ${aposFoto.motivo}`,
    custoEstimado: aposFoto.custoEstimado,
  };
}

/** Garante a ordem da política: quem exige foto começa pedindo a foto. */
export function normalizarAcoes(acoes: readonly Acao[], e: ExcecaoAnalisada): Acao[] {
  const unicas = [...new Set(acoes)];
  const precisaFoto = TIPOS_QUE_EXIGEM_FOTO.has(e.tipo_excecao) && unicas.some((a) => ACOES_QUE_EXIGEM_FOTO.has(a));
  if (precisaFoto && !unicas.includes("solicitar_foto")) unicas.unshift("solicitar_foto");
  return unicas;
}

export function avaliarAcoes(acoes: readonly Acao[], e: ExcecaoAnalisada): AvaliacaoAcao[] {
  return normalizarAcoes(acoes, e).map((a) => avaliarAcao(a, e));
}

/** Tratativa padrão, sem IA: usada como rede de segurança. */
export function acoesPadrao(e: ExcecaoAnalisada): Acao[] {
  if (e.perdaTravada) return ["contatar_cliente"];
  return POLITICA[e.tipo_excecao].padrao;
}

// ---------- Mensagens ao cliente ----------

export interface MensagemPlanejada {
  texto: string;
  status: "automatica" | "aguardando_aprovacao" | "aguarda_foto";
  motivo: string;
}

export function mensagemPedidoDeFoto(e: ExcecaoAnalisada): string {
  const oQue = e.tipo_excecao === "falha_personalizacao" ? "da personalização" : "do produto como ele chegou";
  return `Olá! Sentimos muito pelo problema com o seu pedido ${e.order_id} (${e.descricao_produto}). Para resolvermos o quanto antes, você pode nos enviar uma foto ${oQue}? Assim que recebermos, damos sequência à solução.`;
}

/**
 * A mensagem segue o status das ações que ela anuncia, pela estrutura da
 * decisão e não pelo texto: não depende de o modelo se comportar.
 *  - Exige foto: agora sai o pedido de foto (texto fixo, sem promessa); a
 *    mensagem da solução fica para depois da foto.
 *  - Anuncia ação com custo que precisa de aprovação: espera a aprovação.
 *  - Caso contrário: informativa, automática.
 */
export function planejarMensagens(texto: string, avaliacoes: readonly AvaliacaoAcao[], e: ExcecaoAnalisada): MensagemPlanejada[] {
  const anunciadas = avaliacoes.filter((a) => ACOES_ANUNCIADAS_AO_CLIENTE.has(a.acao) && a.status !== "bloqueada");
  const esperaFoto = anunciadas.find((a) => a.status === "aguarda_foto");
  const pendente = anunciadas.find((a) => a.status === "aguardando_aprovacao");

  if (esperaFoto) {
    const depois = esperaFoto.statusAposFoto === "automatica" ? "e sai automaticamente" : `e depois da aprovação de "${ROTULO_ACAO[esperaFoto.acao].toLowerCase()}"`;
    return [
      { texto: mensagemPedidoDeFoto(e), status: "automatica", motivo: "Pedido de foto exigido pela política, sem promessa" },
      { texto, status: "aguarda_foto", motivo: `Anuncia a solução: sai quando a foto chegar ${depois}` },
    ];
  }
  if (pendente) {
    return [{ texto, status: "aguardando_aprovacao", motivo: `Anuncia "${ROTULO_ACAO[pendente.acao].toLowerCase()}", que precisa de aprovação: sai junto com ela` }];
  }
  return [{ texto, status: "automatica", motivo: "Mensagem informativa ou ação já liberada" }];
}
