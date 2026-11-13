/**
 * Chamadas do navegador ao agente, que roda no servidor. O navegador manda só
 * ids; a conversa com o modelo é montada lá, onde fica a chave.
 */
import {
  agruparFilaDoDia,
  aplicarDecisaoGrupo,
  aplicarInvestigacao,
  casosEspeciais,
  decidirGrupo,
  montarPlano,
  type Contexto,
  type PlanoDoDia,
  type ResultadoGrupo,
  type ResultadoInvestigacao,
  type TratativaPedido,
} from "@/agente";

async function post<T>(url: string, corpo: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.erro ?? `Erro ${res.status} no servidor`);
  return json as T;
}

export const investigarNoServidor = (id: string) => post<ResultadoInvestigacao>("/api/agente/investigar", { id });

interface RespostaGrupo {
  grupo: ResultadoGrupo;
  tratativas: TratativaPedido[];
  modelo?: string;
  tokens: number;
}

/** Refaz o plano do dia grupo a grupo no servidor; o que falhar cai nas regras da política. */
export async function gerarPlanoNoServidor(ctx: Contexto, aoProgredir: (msg: string) => void, casos = 2): Promise<PlanoDoDia> {
  const grupos = agruparFilaDoDia(ctx);
  const resultados: ResultadoGrupo[] = [];
  const tratativas: TratativaPedido[] = [];
  let tokens = 0;
  let modelo: string | undefined;

  for (const [i, g] of grupos.entries()) {
    aoProgredir(`Grupo ${i + 1}/${grupos.length}: ${g.tipo} (${g.membros.length})`);
    let r: RespostaGrupo;
    try {
      r = await post<RespostaGrupo>("/api/agente/grupo", { chave: g.chave });
    } catch (e) {
      const d = await decidirGrupo(null, g);
      r = { ...aplicarDecisaoGrupo(g, { ...d, aviso: e instanceof Error ? e.message : "servidor indisponível" }), tokens: 0 };
    }
    tokens += r.tokens;
    modelo ??= r.modelo;
    resultados.push(r.grupo);
    tratativas.push(...r.tratativas);
  }

  const especiais = casosEspeciais(ctx, casos);
  for (const [i, e] of especiais.entries()) {
    aoProgredir(`Investigação individual ${i + 1}/${especiais.length}: ${e.order_id}`);
    try {
      const inv = await investigarNoServidor(e.id);
      tokens += inv.tokens;
      aplicarInvestigacao(tratativas, inv);
    } catch {
      /* mantém a decisão do grupo */
    }
  }
  return montarPlano(ctx, resultados, tratativas, { modelo, tokens });
}
