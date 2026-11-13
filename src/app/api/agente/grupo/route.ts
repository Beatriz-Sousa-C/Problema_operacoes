import { NextResponse } from "next/server";
import { z } from "zod";
import { agruparFilaDoDia, aplicarDecisaoGrupo, decidirGrupo } from "@/agente/planoDoDia";
import { clienteParaRequisicao, contextoDoServidor } from "@/agente/servidor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** O navegador manda só a chave do grupo do dia: o servidor monta o resumo e a conversa. */
const esquema = z.object({ chave: z.string().min(1).max(200) }).strict();

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }
  const v = esquema.safeParse(corpo);
  if (!v.success) return NextResponse.json({ erro: "Envie apenas { chave } do grupo" }, { status: 400 });

  const g = agruparFilaDoDia(contextoDoServidor()).find((x) => x.chave === v.data.chave);
  if (!g) return NextResponse.json({ erro: "Grupo não encontrado na fila de hoje" }, { status: 404 });

  const d = await decidirGrupo(clienteParaRequisicao(req.headers, "grupo"), g);
  return NextResponse.json({ ...aplicarDecisaoGrupo(g, d), modelo: d.modelo, tokens: d.tokens });
}
