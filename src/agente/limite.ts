/**
 * Limite de uso da IA ao vivo (só servidor).
 *
 * O objetivo é barrar robôs e abuso em massa sem atrapalhar quem avalia, e
 * caber na cota gratuita da Groq, que é limitada sobretudo por TOKENS por dia
 * (100 a 200 mil por modelo). Uma investigação completa gasta cerca de 15 a
 * 20 mil tokens, então o teto diário é medido em tokens, não só em chamadas.
 *  - por IP, numa janela de 10 minutos (investigações e decisões de grupo têm
 *    contagens próprias; "pedir um plano novo" gasta ~17 grupos e 2 investigações);
 *  - um teto diário global de chamadas e de tokens, que protege a cota mesmo
 *    se alguém trocar de IP.
 * Ao estourar, a rota não falha: devolve a tratativa da política com um aviso.
 *
 * A contagem fica na memória de cada instância do servidor: é aproximada
 * (o Vercel pode rodar mais de uma cópia), o que basta para este uso.
 */
import { ErroLlm, type ClienteLlm, type PedidoLlm, type RespostaLlm } from "./llm";

export type TipoUso = "investigacao" | "grupo";

export interface ConfigLimite {
  janelaMs: number;
  porIp: Record<TipoUso, number>;
  /** Chamadas ao modelo por dia, somando todos os visitantes */
  diario: number;
  /** Tokens por dia, somando todos os visitantes e modelos */
  tokensDiarios: number;
}

const inteiroDoAmbiente = (v: string | undefined, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
};

/**
 * LIMITE_IA_POR_IP: investigações por IP a cada 10 min (grupos = 5 vezes isso).
 * LIMITE_IA_DIARIO: chamadas ao modelo por dia. LIMITE_IA_TOKENS_DIARIO: tokens por dia.
 */
export function configDoAmbiente(env: Record<string, string | undefined> = process.env): ConfigLimite {
  const porIp = inteiroDoAmbiente(env.LIMITE_IA_POR_IP, 8);
  return {
    janelaMs: 10 * 60_000,
    porIp: { investigacao: porIp, grupo: porIp * 5 },
    diario: inteiroDoAmbiente(env.LIMITE_IA_DIARIO, 400),
    tokensDiarios: inteiroDoAmbiente(env.LIMITE_IA_TOKENS_DIARIO, 400_000),
  };
}

export type ResultadoLimite = { ok: true } | { ok: false; motivo: string };

export const MOTIVO_TETO_DIARIO = "limite diário da IA atingido; mostrando a tratativa pela política";

/** Dia corrente no horário de Brasília (UTC-3), para o teto diário virar à meia-noite local. */
const diaLocal = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

export class Limitador {
  private readonly acessos = new Map<string, number[]>();
  private dia = "";
  private chamadasHoje = 0;
  private tokensHoje = 0;
  private ultimaLimpeza = 0;

  constructor(
    readonly config: ConfigLimite,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Registra um uso do IP e diz se ele está dentro do limite. */
  permitir(ip: string, tipo: TipoUso): ResultadoLimite {
    const t = this.agora();
    this.limpar(t);
    if (this.tetoDiarioAtingido()) return { ok: false, motivo: MOTIVO_TETO_DIARIO };
    const chave = `${tipo}|${ip}`;
    const recentes = (this.acessos.get(chave) ?? []).filter((x) => t - x < this.config.janelaMs);
    if (recentes.length >= this.config.porIp[tipo]) {
      this.acessos.set(chave, recentes);
      return { ok: false, motivo: "muitas solicitações seguidas; tente de novo em alguns minutos" };
    }
    recentes.push(t);
    this.acessos.set(chave, recentes);
    return { ok: true };
  }

  /** Conta uma chamada ao modelo; devolve false se o teto diário já foi atingido. */
  contarChamada(): boolean {
    if (this.tetoDiarioAtingido()) return false;
    this.chamadasHoje++;
    return true;
  }

  /** Soma os tokens de uma resposta ao consumo do dia. */
  contarTokens(n: number): void {
    this.virarDia(this.agora());
    this.tokensHoje += Math.max(0, n);
  }

  tetoDiarioAtingido(): boolean {
    this.virarDia(this.agora());
    return this.chamadasHoje >= this.config.diario || this.tokensHoje >= this.config.tokensDiarios;
  }

  /** Para diagnóstico e testes */
  get usoHoje() {
    this.virarDia(this.agora());
    return { chamadas: this.chamadasHoje, tokens: this.tokensHoje };
  }

  private virarDia(t: number) {
    const d = diaLocal(t);
    if (d !== this.dia) {
      this.dia = d;
      this.chamadasHoje = 0;
      this.tokensHoje = 0;
    }
  }

  /** Remove IPs sem uso recente, no máximo uma vez por minuto, para a memória não crescer. */
  private limpar(t: number) {
    if (t - this.ultimaLimpeza < 60_000) return;
    this.ultimaLimpeza = t;
    for (const [chave, lista] of this.acessos) {
      if (!lista.some((x) => t - x < this.config.janelaMs)) this.acessos.delete(chave);
    }
  }

  /** Para testes e diagnóstico */
  get ipsEmMemoria() {
    return this.acessos.size;
  }
}

/** Cliente que conta cada chamada e cada token no teto diário. */
export class ClienteContado implements ClienteLlm {
  constructor(
    private readonly interno: ClienteLlm,
    private readonly limitador: Limitador,
  ) {}

  async completar(pedido: PedidoLlm): Promise<RespostaLlm> {
    if (!this.limitador.contarChamada()) throw new ErroLlm(MOTIVO_TETO_DIARIO, 429);
    const r = await this.interno.completar(pedido);
    this.limitador.contarTokens(r.tokens);
    return r;
  }
}

/** IP do visitante. No Vercel, x-real-ip e x-forwarded-for são escritos pela plataforma. */
export function ipDaRequisicao(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
