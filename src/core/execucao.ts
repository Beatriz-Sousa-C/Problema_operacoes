/**
 * Estado de execução de uma tratativa: o que já pode sair, dado o que a
 * pessoa registrou (foto recebida, aprovações e recusas).
 *
 * Funções puras: a tela só lê o resultado, e as regras ficam testáveis.
 *  - Ação que espera foto só passa a pedir aprovação depois que a foto chega.
 *  - Mensagem que anuncia ações com dinheiro só sai quando TODAS forem
 *    aprovadas; se alguma for recusada, a mensagem não deve ser enviada.
 */
import type { Acao, AvaliacaoAcao, MensagemPlanejada } from "./politica";

export type DecisaoHumana = "aprovada" | "recusada";

export interface RegistroTratativa {
  decisoes: Partial<Record<Acao, DecisaoHumana>>;
  fotoRecebida: boolean;
  /** Índices das mensagens que a pessoa marcou como enviadas */
  enviadas?: number[];
}

export const REGISTRO_VAZIO: RegistroTratativa = { decisoes: {}, fotoRecebida: false, enviadas: [] };

export type EstadoAcao = "liberada" | "aguarda_foto" | "aguarda_aprovacao" | "aprovada" | "recusada" | "bloqueada";

export function estadoAcao(a: AvaliacaoAcao, r: RegistroTratativa = REGISTRO_VAZIO): EstadoAcao {
  if (a.status === "bloqueada") return "bloqueada";
  if (a.status === "automatica") return "liberada";
  if (a.status === "aguarda_foto") {
    if (!r.fotoRecebida) return "aguarda_foto";
    if (a.statusAposFoto === "automatica") return "liberada";
    if (a.statusAposFoto === "bloqueada") return "bloqueada";
  }
  return r.decisoes[a.acao] ?? "aguarda_aprovacao";
}

/** A pessoa pode aprovar ou recusar esta ação agora? */
export const podeDecidir = (a: AvaliacaoAcao, r: RegistroTratativa = REGISTRO_VAZIO) =>
  estadoAcao(a, r) === "aguarda_aprovacao";

export type EstadoMensagem = "enviar_agora" | "espera_foto" | "espera_aprovacao" | "cancelada";

export function estadoMensagem(
  m: MensagemPlanejada,
  avaliacoes: readonly AvaliacaoAcao[],
  r: RegistroTratativa = REGISTRO_VAZIO,
): EstadoMensagem {
  const estados = m.dependeDe.map((acao) => {
    const a = avaliacoes.find((x) => x.acao === acao);
    return a ? estadoAcao(a, r) : "aguarda_aprovacao";
  });
  if (estados.includes("recusada")) return "cancelada";
  if (m.exigeFoto && !r.fotoRecebida) return "espera_foto";
  if (estados.every((s) => s === "aprovada" || s === "liberada")) return "enviar_agora";
  return "espera_aprovacao";
}

/**
 * Em que passo do dia o pedido está, do ponto de vista de quem opera:
 *  - decidir: há ação com dinheiro esperando aprovação;
 *  - esperando_cliente: há ação esperando a foto do cliente;
 *  - enviar: há mensagem liberada ainda não enviada;
 *  - concluido: nada mais a fazer hoje.
 */
export type SituacaoPedido = "decidir" | "esperando_cliente" | "enviar" | "concluido";

export function situacaoPedido(
  acoes: readonly AvaliacaoAcao[],
  mensagens: readonly MensagemPlanejada[],
  r: RegistroTratativa = REGISTRO_VAZIO,
): SituacaoPedido {
  const estados = acoes.map((a) => estadoAcao(a, r));
  if (estados.includes("aguarda_aprovacao")) return "decidir";
  if (estados.includes("aguarda_foto")) return "esperando_cliente";
  const enviadas = new Set(r.enviadas ?? []);
  if (mensagens.some((m, i) => !enviadas.has(i) && estadoMensagem(m, acoes, r) === "enviar_agora")) return "enviar";
  return "concluido";
}
