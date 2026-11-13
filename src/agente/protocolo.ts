/**
 * Validação do que o navegador pode pedir ao modelo pelo proxy.
 * O link é público, então o proxy só aceita conversas do próprio agente
 * (prompts e ferramentas conhecidos), impedindo uso da chave como chat genérico.
 */
import { z } from "zod";
import type { PedidoLlm } from "./llm";
import { PROMPT_INVESTIGADOR, PROMPT_PLANO_CORRECAO, PROMPT_PLANO_GRUPO } from "./prompts";
import { FERRAMENTA_DECISAO, FERRAMENTAS_CONSULTA } from "./ferramentas";

const PROMPTS_PERMITIDOS = new Set([PROMPT_INVESTIGADOR, PROMPT_PLANO_GRUPO, PROMPT_PLANO_CORRECAO]);
const FERRAMENTAS_PERMITIDAS = new Set([
  ...FERRAMENTAS_CONSULTA.map((f) => f.function.name),
  FERRAMENTA_DECISAO.function.name,
  "registrar_plano_grupo",
  "registrar_plano_correcao",
]);

const mensagem = z.union([
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.string().max(8000) }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    tool_calls: z
      .array(z.object({ id: z.string(), type: z.literal("function"), function: z.object({ name: z.string(), arguments: z.string() }) }))
      .optional(),
  }),
  z.object({ role: z.literal("tool"), tool_call_id: z.string(), content: z.string().max(20000) }),
]);

const esquemaPedido = z.object({
  messages: z.array(mensagem).min(2).max(40),
  tools: z
    .array(z.object({ type: z.literal("function"), function: z.object({ name: z.string(), description: z.string(), parameters: z.record(z.string(), z.unknown()) }) }))
    .max(8)
    .optional(),
  toolChoice: z.union([z.literal("auto"), z.literal("required"), z.object({ nome: z.string() })]).optional(),
});

export function validarPedidoDoNavegador(corpo: unknown): { ok: true; pedido: PedidoLlm } | { ok: false; erro: string } {
  const r = esquemaPedido.safeParse(corpo);
  if (!r.success) return { ok: false, erro: "Formato de pedido inválido" };
  const [primeira] = r.data.messages;
  if (primeira.role !== "system" || !PROMPTS_PERMITIDOS.has(primeira.content)) {
    return { ok: false, erro: "Só conversas do agente de exceções são aceitas" };
  }
  if (r.data.messages.slice(1).some((m) => m.role === "system")) return { ok: false, erro: "Prompt de sistema adicional não é permitido" };
  if (r.data.tools?.some((t) => !FERRAMENTAS_PERMITIDAS.has(t.function.name))) return { ok: false, erro: "Ferramenta não permitida" };
  return { ok: true, pedido: { ...(r.data as PedidoLlm), maxTokens: 1200, temperature: 0.2 } };
}
