/**
 * Contexto de trabalho do agente: a análise já calculada pelo núcleo, com
 * índices para que cada ferramenta responda em O(1).
 */
import {
  analisar,
  auditarPrazos,
  detectarCausas,
  inferirDataReferencia,
  montarFila,
  PARAMETROS,
  type Analise,
  type AuditoriaPrazo,
  type BaseDados,
  type CausaSistemica,
  type ExcecaoAnalisada,
  type ItemFila,
  type Parametros,
} from "@/core";

export interface Contexto {
  analise: Analise;
  fila: ItemFila[];
  causas: CausaSistemica[];
  auditoria: AuditoriaPrazo;
  porId: Map<string, ItemFila>;
  porCliente: Map<string, ExcecaoAnalisada[]>;
  causasPorPedido: Map<string, CausaSistemica[]>;
}

/** Parâmetros para uma lista: os do negócio, com "hoje" sendo a data mais recente da própria lista. */
export const parametrosDaLista = (base: BaseDados, p: Parametros = PARAMETROS): Parametros => ({
  ...p,
  dataReferencia: inferirDataReferencia(base) ?? p.dataReferencia,
});

export function criarContexto(base: BaseDados, parametros: Parametros = parametrosDaLista(base)): Contexto {
  const analise = analisar(base, parametros);
  const fila = montarFila(analise.excecoes, parametros.capacidadeDiaria);
  const causas = detectarCausas(analise.excecoes, { custoContato: parametros.custoContato });

  const porCliente = new Map<string, ExcecaoAnalisada[]>();
  for (const e of analise.excecoes) {
    const l = porCliente.get(e.customer_id);
    if (l) l.push(e);
    else porCliente.set(e.customer_id, [e]);
  }
  const causasPorPedido = new Map<string, CausaSistemica[]>();
  for (const c of causas) {
    for (const id of c.pedidos) {
      const l = causasPorPedido.get(id);
      if (l) l.push(c);
      else causasPorPedido.set(id, [c]);
    }
  }
  return {
    analise,
    fila,
    causas,
    auditoria: auditarPrazos(analise.excecoes),
    porId: new Map(fila.map((i) => [i.excecao.id, i])),
    porCliente,
    causasPorPedido,
  };
}

export const filaDoDia = (ctx: Contexto, dia = 0) => ctx.fila.filter((i) => i.dia === dia);
