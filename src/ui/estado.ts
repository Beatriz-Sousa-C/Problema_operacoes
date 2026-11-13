"use client";
/**
 * Carregamento dos dados no navegador. O núcleo de cálculo é o mesmo do
 * servidor e dos testes, então o que a banca vê é exatamente o que foi testado.
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import { carregarBase, type BaseDados } from "@/core";
import { criarContexto, gerarPlanoDoDia, type Contexto, type PlanoCorrecao, type PlanoDoDia } from "@/agente";
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
}

export interface Dados {
  csvs: Csvs;
  origem: "padrao" | string;
}

async function baixar(caminho: string): Promise<string> {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`Não foi possível carregar ${caminho}`);
  return r.text();
}

export async function carregarPadrao(): Promise<Dados> {
  const [excecoes, clientes, transportadoras] = await Promise.all([
    baixar("/dados/pedidos_excecao.csv"),
    baixar("/dados/clientes.csv"),
    baixar("/dados/transportadoras.csv"),
  ]);
  return { csvs: { excecoes, clientes, transportadoras }, origem: "padrao" };
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
  return { csvs, origem: nomes.join(", ") };
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

/** Plano do agente gerado no build; com dados enviados pela banca, cai nas regras. */
export function usePlano(ctx: Contexto | null, origem: string | undefined) {
  const [arquivo, setArquivo] = useState<ArquivoPlano | null>(null);
  const [regras, setRegras] = useState<PlanoDoDia | null>(null);

  useEffect(() => {
    if (origem !== "padrao") return;
    fetch("/agente/plano.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setArquivo)
      .catch(() => setArquivo(null));
  }, [origem]);

  useEffect(() => {
    if (!ctx) return;
    let vivo = true;
    gerarPlanoDoDia(ctx, null).then((p) => vivo && setRegras(p));
    return () => {
      vivo = false;
    };
  }, [ctx]);

  if (origem === "padrao" && arquivo) return { plano: arquivo.planoDoDia, correcoes: arquivo.planosCorrecao, fonte: arquivo.fonte };
  return { plano: regras, correcoes: null as PlanoCorrecao[] | null, fonte: "regras" as const };
}
