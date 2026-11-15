/**
 * Lotes de exportação: cada planilha gerada vira um lote numerado que marca
 * os itens incluídos (ação aprovada, mensagem liberada, chamado). "Exportado"
 * é só uma marca: nada do registro é apagado, o último lote pode ser desfeito
 * e qualquer lote pode ser gerado de novo, idêntico, a partir do registro.
 * Módulo puro (sem React), para poder ser testado.
 */
import type { Acao } from "@/core";

/** Identifica um item exportável: ação, mensagem, chamado ou linha de transportadora de um pedido. */
export type ChaveItem = string;

export const chaveAcao = (id: string, acao: Acao): ChaveItem => `${id}|acao:${acao}`;
export const chaveRecusa = (id: string, acao: Acao): ChaveItem => `${id}|recusa:${acao}`;
export const chaveMensagem = (id: string, indice: number): ChaveItem => `${id}|msg:${indice}`;
export const chaveTransportadora = (id: string): ChaveItem => `${id}|transportadora`;
export const chaveChamado = (origem: string): ChaveItem => `${origem}|chamado`;

export interface Lote {
  numero: number;
  /** Momento da exportação, ISO */
  em: string;
  itens: ChaveItem[];
  /** Contagens por aba, para mostrar no histórico sem recalcular */
  contagens: Record<string, number>;
}

export type AcaoLotes =
  | { tipo: "fechar"; itens: ChaveItem[]; contagens: Record<string, number>; em?: string }
  | { tipo: "desfazer_ultimo" }
  | { tipo: "limpar" }
  | { tipo: "carregar"; lotes: Lote[] };

export const proximoNumero = (lotes: readonly Lote[]) => (lotes.at(-1)?.numero ?? 0) + 1;

export function reduzirLotes(lotes: Lote[], a: AcaoLotes): Lote[] {
  switch (a.tipo) {
    case "fechar":
      return [...lotes, { numero: proximoNumero(lotes), em: a.em ?? new Date().toISOString(), itens: a.itens, contagens: a.contagens }];
    case "desfazer_ultimo":
      return lotes.slice(0, -1);
    case "limpar":
      return [];
    case "carregar":
      return Array.isArray(a.lotes) ? a.lotes.filter((l) => l && typeof l.numero === "number" && Array.isArray(l.itens)) : [];
  }
}

/** Conjunto de tudo o que já saiu em algum lote. */
export const jaExportados = (lotes: readonly Lote[]): Set<ChaveItem> => new Set(lotes.flatMap((l) => l.itens));

/** Em que lote o item saiu (o mais recente), ou null. */
export function loteDoItem(lotes: readonly Lote[], chave: ChaveItem): number | null {
  for (let i = lotes.length - 1; i >= 0; i--) if (lotes[i].itens.includes(chave)) return lotes[i].numero;
  return null;
}
