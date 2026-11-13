/**
 * Plano do dia (decisão "B" híbrida): a fila continua ordenada por custo de
 * esperar; as exceções do dia com o mesmo tipo e a mesma causa formam um
 * grupo, e o agente decide uma vez por grupo, com um chamado único por lote.
 * Casos sensíveis (alto valor, cliente com várias exceções) recebem
 * investigação individual completa.
 *
 * Isso cabe na cota gratuita do modelo: ~20 chamadas por dia em vez de 150.
 */
import { z } from "zod";
import { ACOES, acoesPadrao, POLITICA, TIPOS_QUE_EXIGEM_FOTO, type AvaliacaoAcao, type CausaSistemica, type ExcecaoAnalisada, type MensagemPlanejada } from "@/core";
import { filaDoDia, type Contexto } from "./contexto";
import type { ClienteLlm, DefinicaoFerramenta } from "./llm";
import { avaliar, investigarExcecao, type ResultadoInvestigacao } from "./investigador";
import { PROMPT_PLANO_CORRECAO, PROMPT_PLANO_GRUPO } from "./prompts";

const r2 = (v: number) => Math.round(v * 100) / 100;
const num1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export interface Grupo {
  chave: string;
  tipo: ExcecaoAnalisada["tipo_excecao"];
  causa: CausaSistemica | null;
  perdaTravada: boolean;
  membros: ExcecaoAnalisada[];
}

export function agruparFilaDoDia(ctx: Contexto, dia = 0): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const { excecao: e } of filaDoDia(ctx, dia)) {
    const causa = ctx.causasPorPedido.get(e.id)?.[0] ?? null;
    const chave = `${e.tipo_excecao}|${causa?.id ?? "sem causa"}|${e.perdaTravada ? "entregue" : "aberto"}`;
    const g = grupos.get(chave) ?? { chave, tipo: e.tipo_excecao, causa, perdaTravada: e.perdaTravada, membros: [] };
    g.membros.push(e);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.membros.length - a.membros.length);
}

/** Casos que merecem investigação individual, em ordem de valor em jogo. */
export function casosEspeciais(ctx: Contexto, limite: number, dia = 0): ExcecaoAnalisada[] {
  return filaDoDia(ctx, dia)
    .map((i) => i.excecao)
    .filter((e) => e.clienteVip || (ctx.porCliente.get(e.customer_id)?.length ?? 0) > 1)
    .sort((a, b) => b.valorEmJogo - a.valorEmJogo)
    .slice(0, limite);
}

const ESQUEMA_PLANO_GRUPO = z.object({
  acoes: z.array(z.enum(ACOES)).min(1).max(4),
  justificativa: z.string().min(10).max(1500),
  modelo_mensagem_cliente: z.string().min(10).max(1500),
  chamado_lote: z.object({ destino: z.string().min(2), texto: z.string().min(10).max(2500) }).nullable().optional(),
});
export type PlanoGrupo = z.infer<typeof ESQUEMA_PLANO_GRUPO>;

const FERRAMENTA_PLANO_GRUPO: DefinicaoFerramenta = {
  type: "function",
  function: {
    name: "registrar_plano_grupo",
    description: "Registra a tratativa do grupo.",
    parameters: {
      type: "object",
      properties: {
        acoes: { type: "array", items: { type: "string", enum: [...ACOES] }, minItems: 1, maxItems: 4 },
        justificativa: { type: "string" },
        modelo_mensagem_cliente: { type: "string", description: "Use {pedido} e {produto} como marcadores" },
        chamado_lote: {
          type: "object",
          description: "Chamado único para a área responsável pelo lote. Omita se não houver.",
          properties: { destino: { type: "string" }, texto: { type: "string" } },
          required: ["destino", "texto"],
        },
      },
      required: ["acoes", "justificativa", "modelo_mensagem_cliente"],
    },
  },
};

function resumoGrupo(g: Grupo) {
  const n = g.membros.length;
  const soma = (f: (e: ExcecaoAnalisada) => number) => g.membros.reduce((s, e) => s + f(e), 0);
  const contagem = (f: (e: ExcecaoAnalisada) => string) => {
    const m: Record<string, number> = {};
    for (const e of g.membros) m[f(e)] = (m[f(e)] ?? 0) + 1;
    return m;
  };
  const regra = POLITICA[g.tipo];
  return {
    tipo_excecao: g.tipo,
    descricao: regra.descricao,
    ja_entregue_com_atraso: g.perdaTravada,
    pedidos: n,
    valor_total_pedidos: r2(soma((e) => e.valor)),
    valor_em_jogo_total: r2(soma((e) => e.valorEmJogo)),
    custo_de_esperar_total: r2(soma((e) => e.custoDeEsperar)),
    atraso_medio_dias_uteis: r2(soma((e) => e.atrasoAtual) / n),
    clientes_alto_valor: g.membros.filter((e) => e.clienteVip).length,
    custo_medio_reenvio: r2(soma((e) => e.custoReenvio) / n),
    transportadoras: contagem((e) => e.transportadora),
    atrasos_dentro_do_prazo_contratado: g.membros.filter((e) => e.atrasoAtual > 0 && e.atrasoVsContrato === 0).length,
    causa_sistemica: g.causa
      ? { causa: `${g.causa.dimensao}: ${g.causa.grupo}`, vezes_acima_do_normal: r2(g.causa.lift), total_na_base: g.causa.observado }
      : null,
    politica: { acoes_permitidas: regra.permitidas, orientacao: regra.orientacao },
    exemplos_de_pedidos: g.membros.slice(0, 3).map((e) => `${e.order_id} (${e.descricao_produto})`),
  };
}

export function planoGrupoPorRegras(g: Grupo): PlanoGrupo {
  const regra = POLITICA[g.tipo];
  return {
    acoes: acoesPadrao(g.membros[0]),
    justificativa: `Tratativa padrão da política: ${regra.orientacao}`,
    modelo_mensagem_cliente: g.perdaTravada
      ? "Olá! Seu pedido {pedido} foi entregue depois do prazo que informamos. Pedimos desculpas pelo transtorno."
      : TIPOS_QUE_EXIGEM_FOTO.has(g.tipo)
        ? "Obrigado pela foto! Já demos andamento à solução do seu pedido {pedido} ({produto}) e avisamos assim que estiver a caminho."
        : "Olá! Identificamos um problema com o seu pedido {pedido} ({produto}) e já estamos resolvendo. Em breve enviamos a atualização.",
    chamado_lote: g.causa
      ? { destino: g.causa.dimensao, texto: `Lote de ${g.membros.length} pedidos com ${g.tipo} ligados a ${g.causa.grupo}. Favor investigar a causa.` }
      : null,
  };
}

export interface TratativaPedido {
  id: string;
  grupo: string;
  acoes: AvaliacaoAcao[];
  mensagens: MensagemPlanejada[];
  investigacao?: ResultadoInvestigacao;
}

export interface ResultadoGrupo {
  chave: string;
  tipo: string;
  causa: string | null;
  pedidos: number;
  fonte: "agente" | "regras";
  plano: PlanoGrupo;
  aviso?: string;
}

export interface PlanoDoDia {
  geradoEm: string;
  dataReferencia: string;
  modelo?: string;
  tokens: number;
  grupos: ResultadoGrupo[];
  tratativas: TratativaPedido[];
  resumo: {
    automaticas: number;
    aguardandoFoto: number;
    aguardandoAprovacao: number;
    bloqueadas: number;
    custoAutomatico: number;
    custoAposFoto: number;
    custoEmAprovacao: number;
    mensagensAgora: number;
    mensagensEmEspera: number;
  };
}

const preencher = (modelo: string, e: ExcecaoAnalisada) =>
  modelo.replaceAll("{pedido}", e.order_id).replaceAll("{produto}", e.descricao_produto);

export interface DecisaoGrupo {
  plano: PlanoGrupo;
  fonte: "agente" | "regras";
  modelo?: string;
  tokens: number;
  aviso?: string;
}

export async function decidirGrupo(llm: ClienteLlm | null, g: Grupo): Promise<DecisaoGrupo> {
  if (!llm) return { plano: planoGrupoPorRegras(g), fonte: "regras", tokens: 0, aviso: "IA não configurada" };
  try {
    const r = await llm.completar({
      messages: [
        { role: "system", content: PROMPT_PLANO_GRUPO },
        { role: "user", content: JSON.stringify(resumoGrupo(g)) },
      ],
      tools: [FERRAMENTA_PLANO_GRUPO],
      toolChoice: { nome: "registrar_plano_grupo" },
    });
    const chamada = r.mensagem.tool_calls?.[0];
    const validado = ESQUEMA_PLANO_GRUPO.safeParse(chamada ? JSON.parse(chamada.function.arguments) : null);
    if (!validado.success) throw new Error("plano do grupo fora do formato");
    return { plano: validado.data, fonte: "agente", modelo: r.modelo, tokens: r.tokens };
  } catch (e) {
    return { plano: planoGrupoPorRegras(g), fonte: "regras", tokens: 0, aviso: e instanceof Error ? e.message.slice(0, 160) : "erro" };
  }
}

/** Resultado do grupo para exibir e as tratativas de cada pedido dele. */
export function aplicarDecisaoGrupo(g: Grupo, d: DecisaoGrupo): { grupo: ResultadoGrupo; tratativas: TratativaPedido[] } {
  const grupo: ResultadoGrupo = {
    chave: g.chave,
    tipo: g.tipo,
    causa: g.causa ? `${g.causa.dimensao}: ${g.causa.grupo}` : null,
    pedidos: g.membros.length,
    fonte: d.fonte,
    plano: d.plano,
    aviso: d.aviso,
  };
  const tratativas = g.membros.map((e): TratativaPedido => {
    const { avaliacoes, mensagens } = avaliar({ ...d.plano, mensagem_cliente: preencher(d.plano.modelo_mensagem_cliente, e), confianca: "media" }, e);
    return { id: e.id, grupo: g.chave, acoes: avaliacoes, mensagens };
  });
  return { grupo, tratativas };
}

/** A investigação individual do agente substitui a decisão do grupo para o pedido. */
export function aplicarInvestigacao(tratativas: TratativaPedido[], inv: ResultadoInvestigacao) {
  const t = tratativas.find((x) => x.id === inv.id);
  if (!t) return;
  if (inv.fonte === "agente") {
    t.acoes = inv.avaliacoes;
    t.mensagens = inv.mensagens;
  }
  t.investigacao = inv;
}

export async function gerarPlanoDoDia(
  ctx: Contexto,
  llm: ClienteLlm | null,
  opcoes: { casosEspeciais?: number; aoProgredir?: (msg: string) => void } = {},
): Promise<PlanoDoDia> {
  const { casosEspeciais: limite = 5, aoProgredir } = opcoes;
  const grupos = agruparFilaDoDia(ctx);
  const resultados: ResultadoGrupo[] = [];
  const tratativas: TratativaPedido[] = [];
  let tokens = 0;
  let modelo: string | undefined;

  for (const [i, g] of grupos.entries()) {
    aoProgredir?.(`Grupo ${i + 1}/${grupos.length}: ${g.tipo} (${g.membros.length})`);
    const d = await decidirGrupo(llm, g);
    tokens += d.tokens;
    modelo ??= d.modelo;
    const r = aplicarDecisaoGrupo(g, d);
    resultados.push(r.grupo);
    tratativas.push(...r.tratativas);
  }

  if (llm) {
    const especiais = casosEspeciais(ctx, limite);
    for (const [i, e] of especiais.entries()) {
      aoProgredir?.(`Investigação individual ${i + 1}/${especiais.length}: ${e.order_id}`);
      const inv = await investigarExcecao(ctx, llm, e.id);
      tokens += inv.tokens;
      aplicarInvestigacao(tratativas, inv);
    }
  }

  return montarPlano(ctx, resultados, tratativas, { modelo, tokens });
}

/** Monta o plano com o resumo de status e custos (usado no build e no navegador). */
export function montarPlano(
  ctx: Contexto,
  grupos: ResultadoGrupo[],
  tratativas: TratativaPedido[],
  meta: { modelo?: string; tokens: number },
): PlanoDoDia {
  const todas = tratativas.flatMap((t) => t.acoes);
  const mensagens = tratativas.flatMap((t) => t.mensagens);
  const somaCusto = (s: AvaliacaoAcao["status"]) => r2(todas.filter((a) => a.status === s).reduce((x, a) => x + a.custoEstimado, 0));
  return {
    geradoEm: new Date().toISOString(),
    dataReferencia: ctx.analise.parametros.dataReferencia,
    modelo: meta.modelo,
    tokens: meta.tokens,
    grupos,
    tratativas,
    resumo: {
      automaticas: todas.filter((a) => a.status === "automatica").length,
      aguardandoFoto: todas.filter((a) => a.status === "aguarda_foto").length,
      aguardandoAprovacao: todas.filter((a) => a.status === "aguardando_aprovacao").length,
      bloqueadas: todas.filter((a) => a.status === "bloqueada").length,
      custoAutomatico: somaCusto("automatica"),
      custoAposFoto: somaCusto("aguarda_foto"),
      custoEmAprovacao: somaCusto("aguardando_aprovacao"),
      mensagensAgora: mensagens.filter((m) => m.status === "automatica").length,
      mensagensEmEspera: mensagens.filter((m) => m.status !== "automatica").length,
    },
  };
}

// ---------- Planos de correção das causas sistêmicas ----------

const ESQUEMA_CORRECAO = z.object({
  responsavel: z.string().min(2).max(120),
  diagnostico: z.string().min(10).max(1500),
  acoes_imediatas: z.array(z.string().min(5)).min(1).max(5),
  acoes_estruturais: z.array(z.string().min(5)).min(1).max(5),
  indicador_de_sucesso: z.string().min(5).max(400),
});
export type PlanoCorrecao = z.infer<typeof ESQUEMA_CORRECAO> & { causa: string; fonte: "agente" | "regras" };

const FERRAMENTA_CORRECAO: DefinicaoFerramenta = {
  type: "function",
  function: {
    name: "registrar_plano_correcao",
    description: "Registra o plano de correção da causa.",
    parameters: {
      type: "object",
      properties: {
        responsavel: { type: "string", description: "Área ou cargo responsável" },
        diagnostico: { type: "string" },
        acoes_imediatas: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
        acoes_estruturais: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
        indicador_de_sucesso: { type: "string" },
      },
      required: ["responsavel", "diagnostico", "acoes_imediatas", "acoes_estruturais", "indicador_de_sucesso"],
    },
  },
};

export interface CausaParaCorrecao {
  id: string;
  titulo: string;
  dados: Record<string, unknown>;
}

export function causasParaCorrecao(ctx: Contexto): CausaParaCorrecao[] {
  const lista: CausaParaCorrecao[] = ctx.causas.map((c) => ({
    id: c.id,
    titulo: `${c.dimensao}: ${c.grupo} → ${c.tipo}`,
    dados: {
      onde: `${c.dimensao}: ${c.grupo}`,
      tipo_excecao: c.tipo,
      excecoes_observadas: c.observado,
      esperadas_se_normal: r2(c.esperado),
      excesso: r2(c.excesso),
      vezes_acima_do_normal: r2(c.lift),
      custo_direto_do_excesso_em_60_dias: r2(c.custoDoExcesso),
      tambem_visivel_em: c.tambemVisivelEm,
    },
  }));
  const a = ctx.auditoria;
  if (a.regraObservada) {
    lista.unshift({
      id: "auditoria-prazo",
      titulo: "Data prometida calculada em dias corridos",
      dados: {
        onde: "Cálculo da data prometida no checkout",
        regra_correta: "1 dia útil de separação + SLA da transportadora em dias úteis",
        regra_observada: a.regraObservada,
        datas_que_batem_com_dias_corridos: `${a.batemComCorridos} de ${a.pedidos}`,
        dias_uteis_prometidos_a_menos_em_media: r2(a.diasPrometidosAMenosMedio),
        maximo_dias_a_menos: a.diasPrometidosAMenosMax,
        atrasos_que_estao_dentro_do_prazo_contratado: `${a.atrasosDentroDoContrato} de ${a.atrasosTotal}`,
      },
    });
  }
  return lista;
}

/** Plano padrão por tipo de causa: rede de segurança quando a IA está indisponível. */
export function planoCorrecaoPorRegras(c: CausaParaCorrecao, ctx: Contexto): PlanoCorrecao {
  const base = { causa: c.id, fonte: "regras" as const };
  if (c.id === "auditoria-prazo") {
    return {
      ...base,
      responsavel: "Tecnologia (checkout) e Operações",
      diagnostico: `O checkout soma o prazo da transportadora em dias corridos. A promessa sai em média ${num1(ctx.auditoria.diasPrometidosAMenosMedio)} dia útil antes do contrato, e parte dos "atrasos" registrados está dentro do prazo contratado.`,
      acoes_imediatas: [
        "Corrigir o cálculo: 1 dia útil de separação + SLA em dias úteis, com calendário de feriados nacionais.",
        "Reclassificar os atrasos que estão dentro do prazo contratado para não cobrar a transportadora indevidamente.",
      ],
      acoes_estruturais: ["Teste automatizado do cálculo de prazo com sextas, fins de semana e feriados.", "Auditoria mensal: data prometida contra a regra."],
      indicador_de_sucesso: "100% das datas prometidas iguais à regra e queda das exceções de atraso dentro do contrato para zero.",
    };
  }
  const causa = ctx.causas.find((x) => x.id === c.id);
  const onde = causa ? `${causa.dimensao}: ${causa.grupo}` : c.titulo;
  const vezes = causa ? `${num1(causa.lift)} vezes acima do resto da operação` : "acima do normal";
  const porDimensao: Record<string, { responsavel: string; imediatas: string[]; estruturais: string[] }> = {
    Impressora: {
      responsavel: "Manutenção e produção Gocase",
      imediatas: ["Parar a impressora para calibração e inspeção de cabeçote.", "Redistribuir a fila de personalização para as outras máquinas do CD."],
      estruturais: ["Checklist de calibração por turno.", "Alerta automático quando a taxa de falha da máquina passar do dobro da média."],
    },
    "CD e turno": {
      responsavel: "Gestão do CD",
      imediatas: ["Conferência de saída (peso ou leitura) nos pedidos do turno até a causa ser corrigida.", "Revisar com o líder do turno como os brindes de campanha são separados."],
      estruturais: ["Brinde como item no picking, não separado à parte.", "Indicador diário de item faltante por turno."],
    },
    Transportadora: {
      responsavel: "Logística (gestão de transportadoras)",
      imediatas: ["Abrir sinistro em lote com a lista de pedidos.", "Revisar embalagem e manuseio exigidos em contrato."],
      estruturais: ["Cláusula de nível de serviço com penalidade.", "Reduzir a participação da transportadora até a taxa voltar ao normal."],
    },
    "Transportadora e região": {
      responsavel: "Logística (gestão de transportadoras)",
      imediatas: ["Cobrar plano de ação da transportadora para a região com a lista de pedidos.", "Mover os novos pedidos da região para a segunda opção de transportadora."],
      estruturais: ["Escolha de transportadora por região com base em desempenho, não só em frete.", "Revisão mensal de desempenho por região."],
    },
    Lote: {
      responsavel: "Qualidade",
      imediatas: ["Bloquear o lote no estoque e reenviar de outro lote.", "Acionar o fornecedor com amostras."],
      estruturais: ["Inspeção de recebimento por amostragem para a linha.", "Rastreio de lote na expedição."],
    },
    SKU: {
      responsavel: "Qualidade e Planejamento",
      imediatas: ["Investigar o produto com o fornecedor e bloquear o lote suspeito.", "Revisar a embalagem de envio do item."],
      estruturais: ["Inspeção de recebimento para o SKU.", "Acompanhar a taxa de exceção do SKU semanalmente."],
    },
    Marca: {
      responsavel: "Embalagem e Logística",
      imediatas: ["Revisar a proteção de envio dos itens frágeis da marca.", "Testar queda com a embalagem atual."],
      estruturais: ["Especificação de embalagem por tipo de frasco.", "Indicador de avaria por marca."],
    },
  };
  const modelo = porDimensao[causa?.dimensao ?? ""] ?? {
    responsavel: "Operações",
    imediatas: ["Investigar a origem com a área responsável."],
    estruturais: ["Acompanhar a taxa semanalmente."],
  };
  return {
    ...base,
    responsavel: modelo.responsavel,
    diagnostico: `${onde} concentra ${causa?.observado ?? "várias"} exceções do tipo "${causa ? POLITICA[causa.tipo].descricao.toLowerCase() : "único"}", ${vezes}.`,
    acoes_imediatas: modelo.imediatas,
    acoes_estruturais: modelo.estruturais,
    indicador_de_sucesso: "A participação desse tipo de exceção no grupo volta ao nível do resto da operação.",
  };
}

export async function gerarPlanosCorrecao(ctx: Contexto, llm: ClienteLlm | null): Promise<PlanoCorrecao[]> {
  const saida: PlanoCorrecao[] = [];
  for (const c of causasParaCorrecao(ctx)) {
    let plano: PlanoCorrecao | null = null;
    if (llm) {
      try {
        const r = await llm.completar({
          messages: [
            { role: "system", content: PROMPT_PLANO_CORRECAO },
            { role: "user", content: JSON.stringify(c.dados) },
          ],
          tools: [FERRAMENTA_CORRECAO],
          toolChoice: { nome: "registrar_plano_correcao" },
        });
        const chamada = r.mensagem.tool_calls?.[0];
        const v = ESQUEMA_CORRECAO.safeParse(chamada ? JSON.parse(chamada.function.arguments) : null);
        if (v.success) plano = { ...v.data, causa: c.id, fonte: "agente" };
      } catch {
        /* cai nas regras abaixo */
      }
    }
    saida.push(plano ?? planoCorrecaoPorRegras(c, ctx));
  }
  return saida;
}
