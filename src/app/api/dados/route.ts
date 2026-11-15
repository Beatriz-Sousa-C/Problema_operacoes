import { NextResponse } from "next/server";
import { csvsDoServidor, planoDoServidor } from "@/agente/servidor";

export const runtime = "nodejs";

/**
 * Entrega ao navegador os dados que a tela precisa para calcular a fila, mais
 * o plano do agente gerado no build. Nunca é cacheado por intermediários nem
 * indexado: é a única porta de saída dos dados, e ela não é um arquivo estático.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { csvs: csvsDoServidor(), plano: planoDoServidor() },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex",
        },
      },
    );
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro ao ler os dados";
    return NextResponse.json({ erro: `Dados indisponíveis no servidor: ${motivo}` }, { status: 503 });
  }
}
