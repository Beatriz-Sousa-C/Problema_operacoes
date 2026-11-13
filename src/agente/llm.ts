/**
 * Abstração do modelo de linguagem. O agente depende só da interface
 * `ClienteLlm`, então dá para trocar o provedor (Groq, OpenAI, Anthropic) ou
 * usar um modelo falso nos testes sem mexer na lógica do agente.
 *
 * O formato segue a API de chat compatível com OpenAI, que a Groq implementa.
 */

export interface ChamadaFerramenta {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type Mensagem =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface DefinicaoFerramenta {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface PedidoLlm {
  messages: Mensagem[];
  tools?: DefinicaoFerramenta[];
  /** "auto", "required" ou o nome de uma ferramenta específica a ser chamada */
  toolChoice?: "auto" | "required" | { nome: string };
  temperature?: number;
  maxTokens?: number;
}

export interface RespostaLlm {
  mensagem: Extract<Mensagem, { role: "assistant" }>;
  modelo: string;
  tokens: number;
}

export interface ClienteLlm {
  completar(pedido: PedidoLlm): Promise<RespostaLlm>;
}

export class ErroLlm extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly tentarDeNovoEmMs?: number,
  ) {
    super(message);
    this.name = "ErroLlm";
  }
}

/** Corpo da requisição no formato OpenAI/Groq. */
export function corpoRequisicao(pedido: PedidoLlm, modelo: string) {
  const toolChoice =
    pedido.toolChoice === undefined
      ? undefined
      : typeof pedido.toolChoice === "string"
        ? pedido.toolChoice
        : { type: "function", function: { name: pedido.toolChoice.nome } };
  return {
    model: modelo,
    messages: pedido.messages,
    ...(pedido.tools?.length ? { tools: pedido.tools, tool_choice: toolChoice ?? "auto" } : {}),
    temperature: pedido.temperature ?? 0.2,
    max_tokens: pedido.maxTokens ?? 1200,
  };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lê o tempo de espera sugerido pela API (cabeçalho retry-after ou texto do erro). */
function tempoDeEspera(res: Response, texto: string): number | undefined {
  const cabecalho = res.headers.get("retry-after");
  if (cabecalho && !Number.isNaN(Number(cabecalho))) return Number(cabecalho) * 1000;
  const m = texto.match(/try again in ([\d.]+)(ms|s)/i);
  if (m) return Number(m[1]) * (m[2] === "ms" ? 1 : 1000);
  return undefined;
}

export interface OpcoesGroq {
  chave: string;
  /** Modelos em ordem de preferência: se um esgotar a cota, tenta o próximo */
  modelos: string[];
  url?: string;
  tentativasPorModelo?: number;
  /** Espera máxima aceita num 429 antes de pular para o próximo modelo */
  esperaMaximaMs?: number;
  /** Momento (Date.now()) a partir do qual não vale mais esperar: desiste para caber no tempo da função */
  prazoFinal?: number;
}

/**
 * Cliente HTTP da Groq com tolerância a falhas: respeita o tempo de espera
 * dos limites por minuto e troca de modelo quando a cota de um acaba.
 */
export class ClienteGroq implements ClienteLlm {
  private readonly url: string;

  constructor(private readonly opcoes: OpcoesGroq) {
    this.url = opcoes.url ?? "https://api.groq.com/openai/v1/chat/completions";
  }

  async completar(pedido: PedidoLlm): Promise<RespostaLlm> {
    const { modelos, tentativasPorModelo = 3, esperaMaximaMs = 65_000, prazoFinal } = this.opcoes;
    let ultimoErro: unknown;
    for (const modelo of modelos) {
      for (let tentativa = 1; tentativa <= tentativasPorModelo; tentativa++) {
        if (prazoFinal !== undefined && Date.now() >= prazoFinal) throw new ErroLlm("Tempo esgotado esperando o modelo", 504);
        try {
          return await this.chamar(pedido, modelo);
        } catch (e) {
          ultimoErro = e;
          if (!(e instanceof ErroLlm)) throw e;
          const recuperavel = e.status === 429 || (e.status ?? 0) >= 500;
          if (!recuperavel) break; // erro de requisição: tentar outro modelo
          const espera = e.tentarDeNovoEmMs ?? 2000 * tentativa;
          if (espera > esperaMaximaMs) break; // cota diária: próximo modelo
          if (prazoFinal !== undefined && Date.now() + espera > prazoFinal) throw new ErroLlm("Tempo esgotado esperando o limite do modelo", 504);
          await esperar(espera + 250);
        }
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new ErroLlm("Nenhum modelo disponível");
  }

  private async chamar(pedido: PedidoLlm, modelo: string): Promise<RespostaLlm> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.opcoes.chave}` },
      body: JSON.stringify(corpoRequisicao(pedido, modelo)),
      signal: this.opcoes.prazoFinal !== undefined ? AbortSignal.timeout(Math.max(1000, this.opcoes.prazoFinal - Date.now())) : undefined,
    });
    const texto = await res.text();
    if (!res.ok) throw new ErroLlm(`Groq ${res.status}: ${texto.slice(0, 300)}`, res.status, tempoDeEspera(res, texto));
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      // Resposta malformada: erro recuperável, para tentar de novo ou passar ao próximo modelo.
      throw new ErroLlm("Resposta do modelo não é JSON válido", 502);
    }
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new ErroLlm("Resposta sem mensagem", 502);
    return {
      mensagem: { role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls },
      modelo: json.model ?? modelo,
      tokens: json.usage?.total_tokens ?? 0,
    };
  }
}

/** Cliente que sempre falha com um motivo: faz o agente cair na tratativa da política com o aviso certo. */
export class ClienteIndisponivel implements ClienteLlm {
  constructor(private readonly motivo: string) {}
  async completar(): Promise<RespostaLlm> {
    throw new ErroLlm(this.motivo, 503);
  }
}

/** Modelos padrão (configuráveis por GROQ_MODELOS="a,b,c"). */
export const MODELOS_PADRAO = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];

export function modelosDoAmbiente(valor: string | undefined): string[] {
  const lista = (valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return lista.length ? lista : MODELOS_PADRAO;
}
