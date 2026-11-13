/**
 * Calendário de dias úteis. Datas são strings ISO (yyyy-mm-dd) para evitar
 * problemas de fuso horário; toda a aritmética é feita em UTC.
 */

const MS_DIA = 86_400_000;

export function paraDia(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / MS_DIA);
}

export function paraIso(dia: number): string {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em ISO. */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Feriados nacionais do Brasil no ano: as datas fixas e a Sexta-feira Santa.
 * Carnaval e Corpus Christi ficam de fora: são ponto facultativo.
 */
export function feriadosNacionais(ano: number): string[] {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  const sextaSanta = paraIso(paraDia(pascoa(ano)) - 2);
  return [...fixos, sextaSanta].sort();
}

export class Calendario {
  private readonly feriados: Set<number>;

  constructor(feriados: readonly string[]) {
    this.feriados = new Set(feriados.map(paraDia));
  }

  ehDiaUtil(dia: number): boolean {
    const semana = new Date(dia * MS_DIA).getUTCDay(); // 0 = domingo
    return semana !== 0 && semana !== 6 && !this.feriados.has(dia);
  }

  /** Avança n dias úteis a partir de `dia` (exclusivo). n = 0 devolve o próprio dia. */
  somarDiasUteis(dia: number, n: number): number {
    let atual = dia;
    let restantes = n;
    while (restantes > 0) {
      atual += 1;
      if (this.ehDiaUtil(atual)) restantes -= 1;
    }
    return atual;
  }

  /**
   * Soma acumulada de dias úteis a partir de uma origem fixa, construída sob
   * demanda. Transforma `diasUteisEntre` em O(1) amortizado, o que importa na
   * simulação (milhares de pedidos × dias de horizonte).
   */
  private origem: number | null = null;
  private acumulado: number[] = [];

  private acumuladoAte(dia: number): number {
    if (this.origem === null || dia < this.origem) {
      this.origem = dia - 400;
      this.acumulado = [];
    }
    const idx = dia - this.origem;
    for (let i = this.acumulado.length; i <= idx; i++) {
      const anterior = i === 0 ? 0 : this.acumulado[i - 1];
      this.acumulado.push(anterior + (this.ehDiaUtil(this.origem + i) ? 1 : 0));
    }
    return this.acumulado[idx];
  }

  /** Dias úteis no intervalo (inicio, fim]: quantos dias úteis passaram depois de `inicio` até `fim`. */
  diasUteisEntre(inicio: number, fim: number): number {
    if (fim <= inicio) return 0;
    const a = this.acumuladoAte(inicio);
    return this.acumuladoAte(fim) - a;
  }

  /**
   * Prazo exibido ao cliente segundo a regra de negócio: o dia 1 é o primeiro
   * dia útil depois do pedido (separação) e, a partir dele, contam-se os dias
   * úteis do SLA da transportadora.
   */
  prazoContratado(dataPedido: string, slaDiasUteis: number): string {
    const dia1 = this.somarDiasUteis(paraDia(dataPedido), 1);
    return paraIso(this.somarDiasUteis(dia1, slaDiasUteis));
  }
}
