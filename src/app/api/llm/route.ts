import { NextResponse } from "next/server";
import { ClienteGroq, ErroLlm, modelosDoAmbiente } from "@/agente/llm";
import { validarPedidoDoNavegador } from "@/agente/protocolo";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Limite simples por IP (melhor esforço: cada instância serverless tem a sua memória). */
const JANELA_MS = 60_000;
const MAXIMO_POR_JANELA = 40;
const acessos = new Map<string, number[]>();

function dentroDoLimite(ip: string): boolean {
  const agora = Date.now();
  const recentes = (acessos.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  acessos.set(ip, recentes);
  return recentes.length <= MAXIMO_POR_JANELA;
}

export async function POST(req: Request) {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) return NextResponse.json({ erro: "IA não configurada no servidor (GROQ_API_KEY ausente)" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!dentroDoLimite(ip)) return NextResponse.json({ erro: "Muitas chamadas seguidas. Aguarde um minuto." }, { status: 429 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }
  const v = validarPedidoDoNavegador(corpo);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const cliente = new ClienteGroq({
    chave,
    modelos: modelosDoAmbiente(process.env.GROQ_MODELOS),
    tentativasPorModelo: 2,
    esperaMaximaMs: 20_000,
  });
  try {
    return NextResponse.json(await cliente.completar(v.pedido));
  } catch (e) {
    const status = e instanceof ErroLlm && e.status === 429 ? 429 : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message.slice(0, 300) : "Falha no modelo" }, { status });
  }
}
