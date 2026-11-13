/**
 * Agente investigador: um laço de raciocínio com ferramentas.
 * O modelo consulta o sistema quantas vezes precisar e termina registrando
 * uma decisão estruturada, que é validada pelo código antes de valer.
 */
import { acoesPadrao, avaliarAcao, POLITICA, type AvaliacaoAcao, type ExcecaoAnalisada } from "@/core";
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
  trilha: PassoTrilha[];
  modelo?: string;
  tokens: number;
  /** Motivo de ter caído nas regras, quando for o caso */
  aviso?: string;
}

const MAX_PASSOS = 8;

/** Decisão por regras: a rede de segurança quando a IA está indisponível. */
export function decisaoPorRegras(e: ExcecaoAnalisada): DecisaoAgente {
  const regra = POLITICA[e.tipo_excecao];
  return {
    acoes: acoesPadrao(e),
    justificativa: `Tratativa padrão da política para ${regra.descricao.toLowerCase()}. ${regra.orientacao}`,
    mensagem_cliente: e.perdaTravada
      ? `Olá! Seu pedido ${e.order_id} foi entregue depois do prazo que informamos. Pedimos desculpas pelo transtorno e seguimos à disposição.`
      : `Olá! Identificamos um problema com o seu pedido ${e.order_id} (${e.descricao_produto}) e já estamos resolvendo. Em breve enviamos a atualização.`,
    chamado: null,
    confianca: "media",
  };
}

export function avaliar(decisao: DecisaoAgente, e: ExcecaoAnalisada): AvaliacaoAcao[] {
  return decisao.acoes.map((a) => avaliarAcao(a, e));
}

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
          const validado = ESQUEMA_DECISAO.safeParse(bruto);
          if (validado.success) {
            trilha.push({ ferramenta: c.function.name, argumentos: validado.data, resultado: "decisão registrada" });
            return { id, fonte: "agente", decisao: validado.data, avaliacoes: avaliar(validado.data, e), trilha, modelo, tokens };
          }
          // Autocorreção: devolve o erro de validação para o modelo tentar de novo.
          const erro = validado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          trilha.push({ ferramenta: c.function.name, argumentos: bruto, resultado: { erro } });
          mensagens.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ erro: `Decisão inválida: ${erro}. Corrija e chame de novo.` }) });
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
      avaliacoes: avaliar(decisao, e),
      trilha,
      modelo,
      tokens,
      aviso: `Agente indisponível (${erro instanceof Error ? erro.message.slice(0, 160) : "erro"}). Aplicada a tratativa padrão da política.`,
    };
  }
}
