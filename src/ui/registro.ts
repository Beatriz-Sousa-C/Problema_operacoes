/**
 * Registro do que a pessoa fez em cada exceção: foto recebida, aprovações,
 * recusas, mensagens enviadas e investigações feitas ao vivo.
 * Módulo puro (sem React), para poder ser testado.
 */
import { REGISTRO_VAZIO, type Acao, type DecisaoHumana, type RegistroTratativa } from "@/core";
import type { ResultadoInvestigacao } from "@/agente";

export interface RegistroExcecao extends RegistroTratativa {
  /** Investigação individual feita ao vivo: substitui a decisão do grupo */
  investigacao?: ResultadoInvestigacao;
}
export type Registro = Record<string, RegistroExcecao>;

export interface ItemDecisao {
  id: string;
  acao: Acao;
}

export type AcaoRegistro =
  | { tipo: "decidir"; id: string; acao: Acao; decisao: DecisaoHumana }
  | { tipo: "decidir_lote"; itens: ItemDecisao[]; decisao: DecisaoHumana }
  | { tipo: "foto_recebida"; id: string }
  | { tipo: "mensagem_enviada"; id: string; indice: number }
  | { tipo: "mensagens_enviadas_lote"; itens: { id: string; indice: number }[] }
  | { tipo: "investigacao"; id: string; resultado: ResultadoInvestigacao }
  | { tipo: "limpar" }
  | { tipo: "carregar"; registro: Registro };

const doId = (r: Registro, id: string): RegistroExcecao => r[id] ?? REGISTRO_VAZIO;

function decidir(r: Registro, id: string, acao: Acao, decisao: DecisaoHumana): Registro {
  const atual = doId(r, id);
  return { ...r, [id]: { ...atual, decisoes: { ...atual.decisoes, [acao]: decisao } } };
}

function enviar(r: Registro, id: string, indice: number): Registro {
  const atual = doId(r, id);
  const enviadas = atual.enviadas ?? [];
  return enviadas.includes(indice) ? r : { ...r, [id]: { ...atual, enviadas: [...enviadas, indice] } };
}

export function reduzirRegistro(r: Registro, a: AcaoRegistro): Registro {
  switch (a.tipo) {
    case "decidir":
      return decidir(r, a.id, a.acao, a.decisao);
    case "decidir_lote":
      return a.itens.reduce((acc, i) => decidir(acc, i.id, i.acao, a.decisao), r);
    case "foto_recebida":
      return { ...r, [a.id]: { ...doId(r, a.id), fotoRecebida: true } };
    case "mensagem_enviada":
      return enviar(r, a.id, a.indice);
    case "mensagens_enviadas_lote":
      return a.itens.reduce((acc, i) => enviar(acc, i.id, i.indice), r);
    case "investigacao":
      // Uma nova decisão do agente pode trazer outras ações e mensagens: o que foi decidido antes não vale para ela.
      return { ...r, [a.id]: { ...doId(r, a.id), decisoes: {}, enviadas: [], investigacao: a.resultado } };
    case "limpar":
      return {};
    case "carregar":
      return a.registro;
  }
}
