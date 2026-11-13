import { NextResponse } from "next/server";
import { z } from "zod";
import { investigarExcecao } from "@/agente/investigador";
import { clienteParaRequisicao, contextoDoServidor } from "@/agente/servidor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** O navegador manda só o id da exceção: não existe nenhum texto livre que chegue ao modelo. */
const esquema = z.object({ id: z.string().min(1).max(100) }).strict();

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }
  const v = esquema.safeParse(corpo);
  if (!v.success) return NextResponse.json({ erro: "Envie apenas { id } da exceção" }, { status: 400 });

  const ctx = contextoDoServidor();
  if (!ctx.porId.has(v.data.id)) return NextResponse.json({ erro: "Exceção não encontrada na lista original" }, { status: 404 });

  const llm = clienteParaRequisicao(req.headers, "investigacao");
  return NextResponse.json(await investigarExcecao(ctx, llm, v.data.id));
}
