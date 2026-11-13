import { ErroLlm, type ClienteLlm, type PedidoLlm, type RespostaLlm } from "@/agente/llm";

/** Cliente usado no navegador: fala com /api/llm, onde fica a chave. */
export class ClienteProxy implements ClienteLlm {
  async completar(pedido: PedidoLlm): Promise<RespostaLlm> {
    for (let tentativa = 1; ; tentativa++) {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pedido),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json as RespostaLlm;
      if (res.status === 429 && tentativa < 3) {
        await new Promise((r) => setTimeout(r, 15_000 * tentativa));
        continue;
      }
      throw new ErroLlm(json.erro ?? `Erro ${res.status}`, res.status);
    }
  }
}
