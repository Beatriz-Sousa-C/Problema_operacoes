import type { Acao, EstadoAcao, StatusAcao, TipoExcecao } from "@/core";
import type { ResultadoGrupo } from "@/agente";

const moeda0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const moeda2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const brl = (v: number) => moeda0.format(v);
export const brl2 = (v: number) => moeda2.format(v);
export const num = (v: number) => inteiro.format(v);
export const num1 = (v: number) => decimal1.format(v);
export const pct = (v: number) => `${inteiro.format(v * 100)}%`;
/** "R$ 24,1 mil" acima de mil; abaixo, o valor inteiro. */
export const milhar = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${decimal1.format(v / 1000)} mil` : brl(v));
/** dd/mm */
export const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
/** dd/mm/aaaa */
export const dataCompleta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
/** dd/mm hh:mm no fuso de quem vê */
export const dataHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
export const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

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

export const tituloGrupo = (g: ResultadoGrupo) => `${ROTULO_TIPO[g.tipo]}${g.causa ? `, ligado a ${g.causa}` : ""}`;

export const ROTULO_STATUS: Record<StatusAcao, string> = {
  automatica: "Automática",
  aguarda_foto: "Depois da foto do cliente",
  aguardando_aprovacao: "Precisa de aprovação",
  bloqueada: "Bloqueada pela política",
};

/** Estado de execução (depois de foto e decisões): rótulo, ícone e classe do chip */
export const ROTULO_ESTADO: Record<EstadoAcao, string> = {
  liberada: "Automática",
  aguarda_foto: "Depois da foto do cliente",
  aguarda_aprovacao: "Precisa de aprovação",
  aprovada: "Aprovada",
  recusada: "Recusada",
  bloqueada: "Bloqueada pela política",
};

export const ICONE_ESTADO: Record<EstadoAcao, string> = {
  liberada: "✓",
  aguarda_foto: "◔",
  aguarda_aprovacao: "!",
  aprovada: "✓",
  recusada: "×",
  bloqueada: "×",
};

export const CLASSE_ESTADO: Record<EstadoAcao, string> = {
  liberada: "automatica",
  aguarda_foto: "aguarda_foto",
  aguarda_aprovacao: "aguardando_aprovacao",
  aprovada: "aprovada",
  recusada: "recusada",
  bloqueada: "bloqueada",
};

export type { Acao };
