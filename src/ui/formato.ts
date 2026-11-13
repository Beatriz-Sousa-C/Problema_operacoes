import type { Acao, StatusAcao, TipoExcecao } from "@/core";

const moeda0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const moeda2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const brl = (v: number) => moeda0.format(v);
export const brl2 = (v: number) => moeda2.format(v);
export const num = (v: number) => inteiro.format(v);
export const num1 = (v: number) => decimal1.format(v);
export const pct = (v: number) => `${inteiro.format(v * 100)}%`;
export const milhar = (v: number) => `R$ ${decimal1.format(v / 1000)} mil`;
export const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

export const ROTULO_TIPO: Record<TipoExcecao, string> = {
  atraso_entrega: "Atraso na entrega",
  extravio: "Extravio",
  rastreio_parado: "Rastreio parado",
  devolvido_transportadora: "Devolvido pela transportadora",
  avaria_transporte: "Avaria no transporte",
  vazamento_produto: "Vazamento",
  item_faltante: "Item faltante",
  falha_personalizacao: "Falha de personalização",
  pagamento_pendente: "Pagamento pendente",
  ruptura_pos_venda: "Ruptura pós-venda",
  endereco_divergente: "Endereço divergente",
};

export const ROTULO_STATUS: Record<StatusAcao, string> = {
  automatica: "Automática",
  aguarda_foto: "Depois da foto do cliente",
  aguardando_aprovacao: "Precisa de aprovação",
  bloqueada: "Bloqueada pela política",
};

export const ICONE_STATUS: Record<StatusAcao, string> = {
  automatica: "✓",
  aguarda_foto: "◔",
  aguardando_aprovacao: "!",
  bloqueada: "×",
};

export type { Acao };
