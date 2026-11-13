/**
 * Simula o tratamento da fila inteira, dia a dia, com a capacidade do time,
 * e mede a perda esperada final de cada estratégia. É o que sustenta o número
 * "quanto a solução recupera" em relação ao processo atual.
 */
import { Calendario } from "./calendario";
import { montarFila, type Estrategia, NOMES_ESTRATEGIA } from "./priorizacao";
import { atrasoNoDia, probabilidadeCancelamento, type Analise } from "./risco";

export interface ResultadoEstrategia {
  estrategia: Estrategia;
  nome: string;
  perdaEsperada: number;
  /** Perda esperada acumulada ao fim de cada dia (para o gráfico) */
  perdaAcumuladaPorDia: number[];
  cancelamentosEsperados: number;
}

export interface ResultadoSimulacao {
  /** Perda inevitável: o que já está contratado pelo atraso atual, mesmo tratando tudo hoje */
  perdaInevitavel: number;
  estrategias: ResultadoEstrategia[];
  recuperadoVsAtual: number;
  /** Fração do máximo recuperável que a solução captura */
  eficiencia: number;
}

export function simular(analise: Analise, estrategias: Estrategia[] = ["ordem_de_chegada", "exposicao", "custo_de_esperar"]): ResultadoSimulacao {
  const { excecoes, parametros, diasDeTratamento } = analise;
  const cal = new Calendario(parametros.feriados);

  const perdaInevitavel = excecoes.reduce((s, e) => s + e.exposicao, 0);

  const resultados = estrategias.map((estrategia): ResultadoEstrategia => {
    const fila = montarFila(excecoes, parametros.capacidadeDiaria, estrategia);
    const porDia = new Array(diasDeTratamento.length).fill(0);
    let cancelamentos = 0;
    for (const { dia, excecao: e } of fila) {
      const atraso = e.perdaTravada ? e.atrasoAtual : atrasoNoDia(cal, e.data_prometida, diasDeTratamento[dia]);
      const prob = probabilidadeCancelamento(atraso, parametros);
      porDia[dia] += prob * e.valorEmJogo;
      cancelamentos += prob;
    }
    let acc = 0;
    const perdaAcumuladaPorDia = porDia.map((v) => (acc += v));
    return {
      estrategia,
      nome: NOMES_ESTRATEGIA[estrategia],
      perdaEsperada: acc,
      perdaAcumuladaPorDia,
      cancelamentosEsperados: cancelamentos,
    };
  });

  const atual = resultados.find((r) => r.estrategia === "ordem_de_chegada");
  const solucao = resultados.find((r) => r.estrategia === "custo_de_esperar");
  const recuperadoVsAtual = atual && solucao ? atual.perdaEsperada - solucao.perdaEsperada : 0;
  const maximo = atual ? atual.perdaEsperada - perdaInevitavel : 0;

  return {
    perdaInevitavel,
    estrategias: resultados,
    recuperadoVsAtual,
    eficiencia: maximo > 0 ? recuperadoVsAtual / maximo : 0,
  };
}
