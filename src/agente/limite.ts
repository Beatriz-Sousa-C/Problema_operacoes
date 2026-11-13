/**
 * Limite de uso da IA ao vivo (só servidor).
 *
 * O objetivo é barrar robôs e abuso em massa, nunca um avaliador clicando:
 *  - por IP, numa janela de 10 minutos (folgado: vários avaliadores podem
 *    estar na mesma rede, com o mesmo IP);
 *  - um teto diário global de chamadas ao modelo, que protege a cota mesmo
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
}

const inteiroDoAmbiente = (v: string | undefined, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
};

/** LIMITE_IA_POR_IP: investigações por IP a cada 10 min (grupos = o dobro). LIMITE_IA_DIARIO: chamadas ao modelo por dia. */
export function configDoAmbiente(env: Record<string, string | undefined> = process.env): ConfigLimite {
  const porIp = inteiroDoAmbiente(env.LIMITE_IA_POR_IP, 30);
  return { janelaMs: 10 * 60_000, porIp: { investigacao: porIp, grupo: porIp * 2 }, diario: inteiroDoAmbiente(env.LIMITE_IA_DIARIO, 1500) };
}

export type ResultadoLimite = { ok: true } | { ok: false; motivo: string };

/** Dia corrente no horário de Brasília (UTC-3), para o teto diário virar à meia-noite local. */
const diaLocal = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

export class Limitador {
  private readonly acessos = new Map<string, number[]>();
  private dia = "";
  private chamadasHoje = 0;
  private ultimaLimpeza = 0;

  constructor(
    readonly config: ConfigLimite,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Registra um uso do IP e diz se ele está dentro do limite. */
  permitir(ip: string, tipo: TipoUso): ResultadoLimite {
    const t = this.agora();
    this.limpar(t);
    if (this.restanteHoje() <= 0) return { ok: false, motivo: "limite diário da IA atingido; mostrando a tratativa pela política" };
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
    this.virarDia(this.agora());
    if (this.chamadasHoje >= this.config.diario) return false;
    this.chamadasHoje++;
    return true;
  }

  restanteHoje(): number {
    this.virarDia(this.agora());
    return this.config.diario - this.chamadasHoje;
  }

  private virarDia(t: number) {
    const d = diaLocal(t);
    if (d !== this.dia) {
      this.dia = d;
      this.chamadasHoje = 0;
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

/** Cliente que conta cada chamada no teto diário antes de repassar ao modelo. */
export class ClienteContado implements ClienteLlm {
  constructor(
    private readonly interno: ClienteLlm,
    private readonly limitador: Limitador,
  ) {}

  completar(pedido: PedidoLlm): Promise<RespostaLlm> {
    if (!this.limitador.contarChamada()) return Promise.reject(new ErroLlm("limite diário da IA atingido; mostrando a tratativa pela política", 429));
    return this.interno.completar(pedido);
  }
}

/** IP do visitante. No Vercel, x-real-ip e x-forwarded-for são escritos pela plataforma. */
export function ipDaRequisicao(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
