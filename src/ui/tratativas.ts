/**
 * Tratativas em vigor na fila do dia e os agrupamentos que a tela "Hoje" usa.
 * As funções de agrupamento são puras (testadas); o hook só junta tudo.
 */
import { useMemo } from "react";
import { estadoAcao, estadoMensagem, situacaoPedido, type Acao, type ExcecaoAnalisada, type SituacaoPedido } from "@/core";
import { filaDoDia, type Contexto, type PlanoDoDia, type ResultadoGrupo, type TratativaPedido } from "@/agente";
import type { Registro } from "./registro";

/** A investigação individual do agente substitui a decisão do grupo. */
export function tratativaEmVigor(t: TratativaPedido | undefined, registro: Registro, id: string): TratativaPedido | undefined {
  const inv = registro[id]?.investigacao;
  if (!inv) return t;
  if (inv.fonte === "agente") return { id, grupo: t?.grupo ?? "", acoes: inv.avaliacoes, mensagens: inv.mensagens, investigacao: inv };
  return t ? { ...t, investigacao: inv } : undefined;
}

/** Pedido decidido individualmente pelo agente (fora da decisão do grupo)? */
export const decididoIndividualmente = (t: TratativaPedido) => t.investigacao?.fonte === "agente";

export function montarTratativas(ctx: Contexto, plano: PlanoDoDia | null, registro: Registro): Map<string, TratativaPedido> {
  const doPlano = new Map(plano?.tratativas.map((t) => [t.id, t]) ?? []);
  const saida = new Map<string, TratativaPedido>();
  for (const { excecao: e } of filaDoDia(ctx)) {
    const t = tratativaEmVigor(doPlano.get(e.id), registro, e.id);
    if (t) saida.set(e.id, t);
  }
  return saida;
}

export function useTratativas(ctx: Contexto, plano: PlanoDoDia | null, registro: Registro) {
  return useMemo(() => montarTratativas(ctx, plano, registro), [ctx, plano, registro]);
}

// ---------- Passo 1: o que a pessoa precisa decidir, agrupado ----------

export interface ItemPendente {
  id: string;
  acao: Acao;
  custo: number;
  excecao: ExcecaoAnalisada;
}

export interface Pendencia {
  chave: string;
  acao: Acao;
  /** Grupo do plano (ausente quando o pedido foi decidido individualmente) */
  grupo?: ResultadoGrupo;
  individual: boolean;
  /** Por que o agente (ou a política) recomenda esta ação */
  justificativa: string;
  fonte: "agente" | "regras";
  itens: ItemPendente[];
  custoTotal: number;
  /** Soma do valor em jogo dos pedidos (cada pedido conta uma vez) */
  valorEmJogo: number;
  /** Perda adicional evitada por tratar estes pedidos hoje */
  custoDeEsperar: number;
  /** Mensagem que sai depois da aprovação (do primeiro pedido) */
  mensagemPrevia?: string;
}

export function pendenciasPorGrupo(
  ctx: Contexto,
  tratativas: Map<string, TratativaPedido>,
  registro: Registro,
  plano: PlanoDoDia | null,
): Pendencia[] {
  const grupos = new Map(plano?.grupos.map((g) => [g.chave, g]) ?? []);
  const porChave = new Map<string, Pendencia & { ids: Set<string> }>();

  for (const [id, t] of tratativas) {
    const e = ctx.porId.get(id)?.excecao;
    if (!e) continue;
    for (const a of t.acoes) {
      if (estadoAcao(a, registro[id]) !== "aguarda_aprovacao") continue;
      const individual = decididoIndividualmente(t);
      const chave = individual ? `individual|${id}|${a.acao}` : `${t.grupo}|${a.acao}`;
      let p = porChave.get(chave);
      if (!p) {
        const grupo = individual ? undefined : grupos.get(t.grupo);
        p = {
          chave,
          acao: a.acao,
          grupo,
          individual,
          justificativa: individual ? t.investigacao!.decisao.justificativa : (grupo?.plano.justificativa ?? a.motivo),
          fonte: individual ? "agente" : (grupo?.fonte ?? "regras"),
          itens: [],
          custoTotal: 0,
          valorEmJogo: 0,
          custoDeEsperar: 0,
          mensagemPrevia: t.mensagens.find((m) => m.dependeDe.includes(a.acao))?.texto,
          ids: new Set(),
        };
        porChave.set(chave, p);
      }
      p.itens.push({ id, acao: a.acao, custo: a.custoEstimado, excecao: e });
      p.custoTotal += a.custoEstimado;
      if (!p.ids.has(id)) {
        p.ids.add(id);
        p.valorEmJogo += e.valorEmJogo;
        p.custoDeEsperar += e.custoDeEsperar;
      }
    }
  }
  return [...porChave.values()]
    .map(({ ids: _ids, ...p }) => p)
    .sort((a, b) => b.custoDeEsperar - a.custoDeEsperar || b.valorEmJogo - a.valorEmJogo);
}

// ---------- Passos 2 e 3 ----------

export function situacoes(tratativas: Map<string, TratativaPedido>, registro: Registro): Map<string, SituacaoPedido> {
  return new Map([...tratativas].map(([id, t]) => [id, situacaoPedido(t.acoes, t.mensagens, registro[id])]));
}

export interface MensagemPronta {
  id: string;
  indice: number;
  texto: string;
  excecao: ExcecaoAnalisada;
}

export interface BlocoMensagens {
  chave: string;
  titulo: string;
  fonte: "agente" | "regras";
  mensagens: MensagemPronta[];
}

/** Mensagens liberadas e ainda não enviadas, agrupadas como no plano. */
export function mensagensProntas(
  ctx: Contexto,
  tratativas: Map<string, TratativaPedido>,
  registro: Registro,
  plano: PlanoDoDia | null,
  tituloGrupo: (g: ResultadoGrupo) => string,
): { blocos: BlocoMensagens[]; canceladas: MensagemPronta[] } {
  const grupos = new Map(plano?.grupos.map((g) => [g.chave, g]) ?? []);
  const blocos = new Map<string, BlocoMensagens>();
  const canceladas: MensagemPronta[] = [];
  for (const [id, t] of tratativas) {
    const e = ctx.porId.get(id)?.excecao;
    if (!e) continue;
    const r = registro[id];
    const enviadas = new Set(r?.enviadas ?? []);
    t.mensagens.forEach((m, indice) => {
      const estado = estadoMensagem(m, t.acoes, r);
      const item = { id, indice, texto: m.texto, excecao: e };
      if (estado === "cancelada") return void canceladas.push(item);
      if (estado !== "enviar_agora" || enviadas.has(indice)) return;
      const individual = decididoIndividualmente(t);
      const grupo = grupos.get(t.grupo);
      const chave = individual ? `individual|${id}` : t.grupo;
      let b = blocos.get(chave);
      if (!b) {
        b = {
          chave,
          titulo: individual ? `Pedido ${e.order_id} (investigado pelo agente)` : grupo ? tituloGrupo(grupo) : "Outros pedidos",
          fonte: individual ? "agente" : (grupo?.fonte ?? "regras"),
          mensagens: [],
        };
        blocos.set(chave, b);
      }
      b.mensagens.push(item);
    });
  }
  return { blocos: [...blocos.values()].sort((a, b) => b.mensagens.length - a.mensagens.length), canceladas };
}
