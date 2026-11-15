"use client";
/**
 * Carregamento dos dados no navegador. O núcleo de cálculo é o mesmo do
 * servidor e dos testes, então o que a banca vê é exatamente o que foi testado.
 * Os dados chegam pela rota /api/dados (nunca como arquivo estático), junto
 * com o plano do agente gerado no build.
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import { carregarBase, type BaseDados } from "@/core";
import { criarContexto, gerarPlanoDoDia, type Briefing, type Contexto, type PlanoCorrecao, type PlanoDoDia } from "@/agente";
import { reduzirLotes, type Lote } from "./lotes";
import { reduzirRegistro, type Registro } from "./registro";

export interface Csvs {
  excecoes: string;
  clientes: string;
  transportadoras: string;
}

export interface ArquivoPlano {
  hashDados: string;
  fonte: "agente" | "regras";
  planoDoDia: PlanoDoDia;
  planosCorrecao: PlanoCorrecao[];
  briefing?: Briefing;
}

export interface Dados {
  csvs: Csvs;
  /** "padrao" para a lista original; o nome dos arquivos para uma lista enviada */
  origem: "padrao" | string;
  /** Plano do agente gerado no build: só existe para a lista original */
  plano: ArquivoPlano | null;
}

export async function carregarPadrao(): Promise<Dados> {
  const r = await fetch("/api/dados", { cache: "no-store" });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erro ?? `Não foi possível carregar os dados (erro ${r.status})`);
  return { csvs: json.csvs, origem: "padrao", plano: json.plano ?? null };
}

/** Identifica cada arquivo enviado pelo cabeçalho, não pelo nome. */
export async function lerArquivosEnviados(arquivos: FileList, atual: Csvs): Promise<Dados> {
  const csvs = { ...atual };
  const nomes: string[] = [];
  for (const f of Array.from(arquivos)) {
    const texto = await f.text();
    const cabecalho = texto.slice(0, texto.indexOf("\n"));
    if (cabecalho.includes("tipo_excecao")) csvs.excecoes = texto;
    else if (cabecalho.includes("receita_acumulada")) csvs.clientes = texto;
    else if (cabecalho.includes("sla_contratado_dias_uteis")) csvs.transportadoras = texto;
    else throw new Error(`${f.name}: não reconheci o arquivo. Envie pedidos_excecao.csv, clientes.csv ou transportadoras.csv.`);
    nomes.push(f.name);
  }
  carregarBase(csvs); // valida antes de trocar os dados da tela
  return { csvs, origem: nomes.join(", "), plano: null };
}

export function useContexto(dados: Dados | null): { ctx: Contexto | null; base: BaseDados | null; erro: string | null } {
  return useMemo(() => {
    if (!dados) return { ctx: null, base: null, erro: null };
    try {
      const base = carregarBase(dados.csvs);
      return { ctx: criarContexto(base), base, erro: null };
    } catch (e) {
      return { ctx: null, base: null, erro: e instanceof Error ? e.message : String(e) };
    }
  }, [dados]);
}

// ---------- Registro das tratativas (foto, aprovações, investigações) ----------

// O reducer fica em registro.ts (módulo puro, testado); aqui só o carregamento e o salvamento.
export type { AcaoRegistro, Registro, RegistroExcecao } from "./registro";

/** Impressão digital simples dos dados: cada lista tem o seu próprio registro salvo. */
export function chaveRegistro(dados: Dados, dataReferencia: string): string {
  const texto = dados.csvs.excecoes + dados.csvs.clientes + dados.csvs.transportadoras;
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return `tratativas|${dataReferencia}|${(h >>> 0).toString(36)}`;
}

export function lerRegistroSalvo(chave: string): Registro {
  return lerSalvo(chave);
}

function lerSalvo(chave: string): Registro {
  try {
    const bruto = window.localStorage.getItem(chave);
    const valor = bruto ? JSON.parse(bruto) : {};
    return valor && typeof valor === "object" ? (valor as Registro) : {};
  } catch {
    return {};
  }
}

/**
 * Registro das tratativas, salvo no navegador por conjunto de dados: sobrevive
 * à troca de abas e ao recarregar a página.
 */
export function useRegistro(chave: string | null) {
  const [registro, despachar] = useReducer(reduzirRegistro, {});
  const [carregado, setCarregado] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) return;
    despachar({ tipo: "carregar", registro: lerSalvo(chave) });
    setCarregado(chave);
  }, [chave]);

  useEffect(() => {
    if (!chave || carregado !== chave) return;
    try {
      if (Object.keys(registro).length) window.localStorage.setItem(chave, JSON.stringify(registro));
      else window.localStorage.removeItem(chave);
    } catch {
      /* armazenamento indisponível: o registro vale só nesta sessão */
    }
  }, [chave, carregado, registro]);

  return { registro, despachar };
}

// ---------- Lotes de exportação ----------

/**
 * Lotes de exportação, salvos ao lado do registro (chave própria, para não
 * mudar a forma do registro). Também sobrevivem à troca de abas e ao recarregar.
 */
export function useLotes(chaveDoRegistro: string | null) {
  const chave = chaveDoRegistro ? `lotes|${chaveDoRegistro}` : null;
  const [lotes, despacharLotes] = useReducer(reduzirLotes, []);
  const [carregado, setCarregado] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) return;
    let salvos: Lote[] = [];
    try {
      const bruto = window.localStorage.getItem(chave);
      salvos = bruto ? (JSON.parse(bruto) as Lote[]) : [];
    } catch {
      salvos = [];
    }
    despacharLotes({ tipo: "carregar", lotes: salvos });
    setCarregado(chave);
  }, [chave]);

  useEffect(() => {
    if (!chave || carregado !== chave) return;
    try {
      if (lotes.length) window.localStorage.setItem(chave, JSON.stringify(lotes));
      else window.localStorage.removeItem(chave);
    } catch {
      /* armazenamento indisponível: os lotes valem só nesta sessão */
    }
  }, [chave, carregado, lotes]);

  return { lotes, despacharLotes };
}

/** Plano do agente gerado no build para a lista original; para uma lista enviada, o plano por regras calculado aqui. */
export function usePlano(ctx: Contexto | null, dados: Dados | null) {
  const [regras, setRegras] = useState<PlanoDoDia | null>(null);
  const arquivo = dados?.origem === "padrao" ? dados.plano : null;

  useEffect(() => {
    if (!ctx || arquivo) return;
    let vivo = true;
    gerarPlanoDoDia(ctx, null).then((p) => vivo && setRegras(p));
    return () => {
      vivo = false;
    };
  }, [ctx, arquivo]);

  if (arquivo) return { plano: arquivo.planoDoDia, correcoes: arquivo.planosCorrecao, briefing: arquivo.briefing ?? null, fonte: arquivo.fonte };
  return { plano: regras, correcoes: null as PlanoCorrecao[] | null, briefing: null as Briefing | null, fonte: "regras" as const };
}

// ---------- Pedido no link (#aba?pedido=GC...) ----------

/** Pedido apontado pelo link, se houver (número do pedido ou id da exceção). */
export function lerPedidoDoLink(): string | null {
  if (typeof window === "undefined") return null;
  const consulta = window.location.hash.slice(1).split("?")[1];
  return consulta ? new URLSearchParams(consulta).get("pedido") : null;
}

/** Aba apontada pelo link, sem a parte do pedido. */
export const lerAbaDoLink = () => (typeof window === "undefined" ? "" : window.location.hash.slice(1).split("?")[0]);

export function gravarPedidoNoLink(orderId: string | null, abaPadrao = "fila") {
  const aba = lerAbaDoLink() || abaPadrao;
  history.replaceState(null, "", `#${aba}${orderId ? `?pedido=${encodeURIComponent(orderId)}` : ""}`);
}

/** Link completo para um pedido, para colar num chamado ou mensagem interna. */
export const linkDoPedido = (orderId: string) => `${window.location.origin}${window.location.pathname}#fila?pedido=${encodeURIComponent(orderId)}`;

/**
 * Pedido selecionado numa tela, sincronizado com o link: abrir pelo link
 * seleciona o pedido; selecionar atualiza o link, que pode ser copiado.
 */
export function usePedidoSelecionado(ctx: Contexto): [string | null, (id: string | null) => void] {
  const [selecionado, setSelecionado] = useState<string | null>(() => {
    const v = lerPedidoDoLink();
    if (!v) return null;
    if (ctx.porId.has(v)) return v;
    return ctx.fila.find((i) => i.excecao.order_id === v)?.excecao.id ?? null;
  });
  const selecionar = (id: string | null) => {
    setSelecionado(id);
    gravarPedidoNoLink(id ? (ctx.porId.get(id)?.excecao.order_id ?? null) : null);
  };
  return [selecionado, selecionar];
}
