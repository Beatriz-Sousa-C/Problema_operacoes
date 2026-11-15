/**
 * Agente investigador: um laço de raciocínio com ferramentas.
 * O modelo consulta o sistema quantas vezes precisar e termina registrando
 * uma decisão estruturada, que é validada pelo código antes de valer.
 */
import { acoesPadrao, avaliarAcoes, mensagemPedidoDeFoto, planejarMensagens, POLITICA, problemasDaMensagem, TIPOS_QUE_EXIGEM_FOTO, type AvaliacaoAcao, type ExcecaoAnalisada, type MensagemPlanejada } from "@/core";
import type { Contexto } from "./contexto";
import {
  ESQUEMA_DECISAO,
  executarFerramenta,
  FERRAMENTA_DECISAO,
  FERRAMENTAS_CONSULTA,
  type DecisaoAgente,
} from "./ferramentas";
import type { ClienteLlm, Mensagem } from "./llm";
import { PROMPT_INVESTIGADOR } from "./prompts";

export interface PassoTrilha {
  ferramenta: string;
  argumentos: unknown;
  resultado: unknown;
}

export interface ResultadoInvestigacao {
  id: string;
  fonte: "agente" | "regras";
  decisao: DecisaoAgente;
  avaliacoes: AvaliacaoAcao[];
  /** Mensagens ao cliente com o status que a política permite */
  mensagens: MensagemPlanejada[];
  trilha: PassoTrilha[];
  modelo?: string;
  tokens: number;
  /** Motivo de ter caído nas regras, quando for o caso */
  aviso?: string;
}

/** Cada passo reenvia a conversa inteira: 6 passos cabem em ~15 mil tokens e bastam para 4 consultas + decisão. */
const MAX_PASSOS = 6;

/** Erros de validação da decisão: formato (zod) e conteúdo da mensagem (política). */
export function validarDecisao(bruto: unknown, e?: Pick<ExcecaoAnalisada, "tipo_excecao">): { ok: true; decisao: DecisaoAgente } | { ok: false; erro: string } {
  const v = ESQUEMA_DECISAO.safeParse(bruto);
  if (!v.success) return { ok: false, erro: v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const problemas = problemasDaMensagem(v.data.mensagem_cliente, v.data.acoes, { tipo: e?.tipo_excecao });
  if (problemas.length) return { ok: false, erro: `mensagem_cliente: ${problemas.join("; ")}` };
  return { ok: true, decisao: v.data };
}

/** Decisão por regras: a rede de segurança quando a IA está indisponível. */
export function decisaoPorRegras(e: ExcecaoAnalisada): DecisaoAgente {
  const regra = POLITICA[e.tipo_excecao];
  return {
    acoes: acoesPadrao(e),
    justificativa: `Tratativa padrão da política para ${regra.descricao.toLowerCase()}. ${regra.orientacao}`,
    mensagem_cliente: e.perdaTravada
      ? `Olá! Seu pedido ${e.order_id} foi entregue depois do prazo que informamos. Pedimos desculpas pelo transtorno e seguimos à disposição.`
      : TIPOS_QUE_EXIGEM_FOTO.has(e.tipo_excecao)
        ? `Obrigado pela foto! Já demos andamento à solução do seu pedido ${e.order_id} (${e.descricao_produto}) e avisamos assim que estiver a caminho.`
        : `Olá! Identificamos um problema com o seu pedido ${e.order_id} (${e.descricao_produto}) e já estamos resolvendo. Em breve enviamos a atualização.`,
    chamado: null,
    confianca: "media",
  };
}

export function avaliar(decisao: DecisaoAgente, e: ExcecaoAnalisada): { avaliacoes: AvaliacaoAcao[]; mensagens: MensagemPlanejada[] } {
  const avaliacoes = avaliarAcoes(decisao.acoes, e);
  return { avaliacoes, mensagens: planejarMensagens(decisao.mensagem_cliente, avaliacoes, e) };
}

export { mensagemPedidoDeFoto };

export async function investigarExcecao(ctx: Contexto, llm: ClienteLlm, id: string): Promise<ResultadoInvestigacao> {
  const item = ctx.porId.get(id);
  if (!item) throw new Error(`Exceção ${id} não encontrada`);
  const e = item.excecao;

  const trilha: PassoTrilha[] = [];
  let tokens = 0;
  let modelo: string | undefined;
  const mensagens: Mensagem[] = [
    { role: "system", content: PROMPT_INVESTIGADOR },
    {
      role: "user",
      content: `Investigue a exceção id="${e.id}" (pedido ${e.order_id}, cliente ${e.customer_id}, tipo ${e.tipo_excecao}, transportadora ${e.transportadora}, UF ${e.uf}). Hoje é ${ctx.analise.parametros.dataReferencia}.`,
    },
  ];
  const ferramentas = [...FERRAMENTAS_CONSULTA, FERRAMENTA_DECISAO];

  try {
    for (let passo = 1; passo <= MAX_PASSOS; passo++) {
      const ultimo = passo === MAX_PASSOS;
      const r = await llm.completar({
        messages: mensagens,
        tools: ferramentas,
        toolChoice: ultimo ? { nome: "registrar_decisao" } : "auto",
      });
      tokens += r.tokens;
      modelo = r.modelo;
      mensagens.push(r.mensagem);
      const chamadas = r.mensagem.tool_calls ?? [];

      if (!chamadas.length) {
        mensagens.push({ role: "user", content: "Continue a investigação usando as ferramentas e termine com registrar_decisao." });
        continue;
      }

      for (const c of chamadas) {
        if (c.function.name === "registrar_decisao") {
          const bruto = (() => {
            try {
              return JSON.parse(c.function.arguments || "{}");
            } catch {
              return null;
            }
          })();
          const validado = validarDecisao(bruto, e);
          if (validado.ok) {
            trilha.push({ ferramenta: c.function.name, argumentos: validado.decisao, resultado: "decisão registrada" });
            return { id, fonte: "agente", decisao: validado.decisao, ...avaliar(validado.decisao, e), trilha, modelo, tokens };
          }
          // Autocorreção: devolve o erro de validação para o modelo tentar de novo.
          trilha.push({ ferramenta: c.function.name, argumentos: bruto, resultado: { erro: validado.erro } });
          mensagens.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ erro: `Decisão inválida: ${validado.erro}. Corrija e chame de novo.` }) });
          continue;
        }
        const resultado = executarFerramenta(ctx, c.function.name, c.function.arguments);
        let argumentos: unknown = c.function.arguments;
        try {
          argumentos = JSON.parse(c.function.arguments);
        } catch {
          /* mantém o texto bruto na trilha */
        }
        trilha.push({ ferramenta: c.function.name, argumentos, resultado });
        mensagens.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(resultado) });
      }
    }
    throw new Error("O agente não concluiu a decisão dentro do limite de passos");
  } catch (erro) {
    const decisao = decisaoPorRegras(e);
    return {
      id,
      fonte: "regras",
      decisao,
      ...avaliar(decisao, e),
      trilha,
      modelo,
      tokens,
      aviso: `Agente indisponível (${erro instanceof Error ? erro.message.slice(0, 160) : "erro"}). Aplicada a tratativa padrão da política.`,
    };
  }
}
